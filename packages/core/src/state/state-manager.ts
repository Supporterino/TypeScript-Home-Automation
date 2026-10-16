import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { INTERNAL_STATE_PREFIX } from "@ts-ha/shared";
import type { Logger } from "pino";
import { readJsonWithBackup, writeJsonAtomically } from "./json-persistence.js";

/** Callback for state change listeners. */
export type StateChangeHandler<T = unknown> = (
  key: string,
  newValue: T | undefined,
  oldValue: T | undefined,
) => void;

export { INTERNAL_STATE_PREFIX };

/** Returns true when `key` falls inside the reserved internal namespace. */
export function isReservedStateKey(key: string): boolean {
  return key.startsWith(INTERNAL_STATE_PREFIX);
}

/** Options for the `StateManager`. */
export interface StateManagerOptions {
  /**
   * Whether to persist state to a JSON file on shutdown and restore on startup.
   *
   * @default true
   */
  persist?: boolean;

  /**
   * Path to the JSON file for state persistence; used when `persist` is true.
   *
   * @default "./state.json"
   */
  filePath?: string;

  /**
   * Milliseconds to wait after a mutation before flushing a coalesced save to disk;
   * `0` saves on every mutation, and multiple writes in one window produce one save.
   * An abrupt process kill loses mutations from the current window.
   *
   * @default 1000
   */
  flushIntervalMs?: number;
}

/**
 * Generic state manager for sharing and persisting state across automations: typed
 * get/set/delete over an in-memory store, with change listeners, optionally persisted.
 */
export class StateManager {
  private readonly store: Map<string, unknown> = new Map();
  private readonly listeners: Map<string, Set<StateChangeHandler>> = new Map();
  /** Wildcard listeners that fire on any key change. */
  private readonly globalListeners: Set<StateChangeHandler> = new Set();
  private readonly persist: boolean;
  private readonly filePath: string;
  private readonly flushIntervalMs: number;

  /** Pending coalesced-save timer, or `null` when no save is scheduled. */
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Chains every `save()` call so overlapping calls never race on the same file.
   */
  private saveChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly logger: Logger,
    options: StateManagerOptions = {},
  ) {
    this.persist = options.persist ?? true;
    this.filePath = options.filePath ?? "./state.json";
    this.flushIntervalMs = options.flushIntervalMs ?? 1000;
  }

  // -------------------------------------------------------------------------
  // Core operations
  // -------------------------------------------------------------------------

  /** Get a value from the state store, or `defaultValue` when the key is absent. */
  get<T = unknown>(key: string, defaultValue?: T): T | undefined {
    if (this.store.has(key)) {
      return this.store.get(key) as T;
    }
    return defaultValue;
  }

  /**
   * Set a value in the state store, firing change listeners if it actually changed
   * and scheduling a coalesced save when persistence is enabled.
   *
   * @throws {Error} if `key` falls inside the reserved internal namespace; use
   * {@link setInternal} for room and automation enabled-flag writes.
   */
  set<T = unknown>(key: string, value: T): void {
    if (isReservedStateKey(key)) {
      throw new Error(`Cannot write reserved internal state key "${key}" through the public API`);
    }
    this.writeValue(key, value);
  }

  /**
   * Write a key under the reserved internal namespace, bypassing the rejection
   * {@link set} applies; the write is otherwise unchanged. Used only by the room and
   * automation enabled-flag writers.
   *
   * @throws {Error} if `key` does not fall inside the reserved namespace.
   */
  setInternal<T = unknown>(key: string, value: T): void {
    if (!isReservedStateKey(key)) {
      throw new Error(
        `setInternal() may only write reserved internal keys (prefix "${INTERNAL_STATE_PREFIX}"); got "${key}"`,
      );
    }
    this.writeValue(key, value);
  }

  private writeValue<T>(key: string, value: T): void {
    const oldValue = this.store.get(key);
    this.store.set(key, value);

    // Only notify if the value actually changed
    if (!this.isEqual(oldValue, value)) {
      this.logger.debug({ key, oldValue, newValue: value }, "State changed");
      this.notifyListeners(key, value, oldValue);
    }

    this.scheduleFlush();
  }

  /**
   * Delete a key from the state store, firing change listeners if it existed; returns
   * whether it existed.
   *
   * @throws {Error} if `key` falls inside the reserved internal namespace.
   */
  delete(key: string): boolean {
    if (isReservedStateKey(key)) {
      throw new Error(`Cannot delete reserved internal state key "${key}" through the public API`);
    }
    return this.deleteValue(key);
  }

  /**
   * Delete a key under the reserved internal namespace, bypassing the rejection
   * {@link delete} applies.
   *
   * @throws {Error} if `key` does not fall inside the reserved namespace.
   */
  deleteInternal(key: string): boolean {
    if (!isReservedStateKey(key)) {
      throw new Error(
        `deleteInternal() may only delete reserved internal keys (prefix "${INTERNAL_STATE_PREFIX}"); got "${key}"`,
      );
    }
    return this.deleteValue(key);
  }

  private deleteValue(key: string): boolean {
    if (!this.store.has(key)) {
      return false;
    }

    const oldValue = this.store.get(key);
    this.store.delete(key);
    this.logger.debug({ key, oldValue }, "State deleted");
    this.notifyListeners(key, undefined, oldValue);
    this.scheduleFlush();
    return true;
  }

  /**
   * Check if a key exists in the state store.
   */
  has(key: string): boolean {
    return this.store.has(key);
  }

  /** Get all keys in the state store, excluding reserved internal keys. */
  keys(): string[] {
    return [...this.store.keys()].filter((key) => !isReservedStateKey(key));
  }

  /**
   * Return reserved internal keys starting with `prefix`, for an internal consumer
   * that owns a slice of the reserved namespace; it is otherwise unenumerable through
   * the public API.
   *
   * @throws {Error} if `prefix` does not fall inside the reserved namespace.
   */
  keysInternal(prefix: string): string[] {
    if (!isReservedStateKey(prefix)) {
      throw new Error(
        `keysInternal() may only enumerate reserved internal keys (prefix "${INTERNAL_STATE_PREFIX}"); got "${prefix}"`,
      );
    }
    return [...this.store.keys()].filter((key) => key.startsWith(prefix));
  }

  // -------------------------------------------------------------------------
  // Change listeners
  // -------------------------------------------------------------------------

  /** Register a listener for changes to a specific key, fired with (key, newValue, oldValue). */
  /** Threshold for warning about potential listener leaks. */
  private static readonly LISTENER_WARN_THRESHOLD = 10;

  onChange<T = unknown>(key: string, handler: StateChangeHandler<T>): void {
    let handlers = this.listeners.get(key);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(key, handlers);
    }
    handlers.add(handler as StateChangeHandler);

    if (handlers.size > StateManager.LISTENER_WARN_THRESHOLD) {
      this.logger.warn(
        { key, count: handlers.size, threshold: StateManager.LISTENER_WARN_THRESHOLD },
        "High number of state change listeners for a single key — possible listener leak",
      );
    }
  }

  /**
   * Remove a listener for a specific key.
   */
  offChange<T = unknown>(key: string, handler: StateChangeHandler<T>): void {
    const handlers = this.listeners.get(key);
    if (handlers) {
      handlers.delete(handler as StateChangeHandler);
      if (handlers.size === 0) {
        this.listeners.delete(key);
      }
    }
  }

  /**
   * Register a listener for changes to any key.
   *
   * @param handler Callback fired with (key, newValue, oldValue)
   */
  onAnyChange(handler: StateChangeHandler): void {
    this.globalListeners.add(handler);
  }

  /**
   * Remove a global change listener.
   */
  offAnyChange(handler: StateChangeHandler): void {
    this.globalListeners.delete(handler);
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  /**
   * Load persisted state from disk (if persistence is enabled).
   * Called by the engine on startup.
   */
  async load(): Promise<void> {
    if (!this.persist) return;
    await readJsonWithBackup(this.filePath, this.logger, "state", (parsed, file) =>
      this.restore(parsed, file),
    );
  }

  /** Load parsed key-value pairs into the store and log success. */
  private restore(parsed: Record<string, unknown>, file: string): void {
    for (const [key, value] of Object.entries(parsed)) {
      this.store.set(key, value);
    }
    this.logger.info({ keys: Object.keys(parsed).length, file }, "State restored from disk");
  }

  /**
   * Save current state to disk. Concurrent calls are serialized onto one chain so
   * they never open the same temp file at once; a failed save is logged.
   */
  async save(): Promise<void> {
    if (!this.persist) return;
    const next = this.saveChain.then(() => this.performSave());
    // however performSave() resolves, keep the chain alive for the next caller
    this.saveChain = next;
    return next;
  }

  private async performSave(): Promise<void> {
    try {
      // Serialize each entry individually so one bad value cannot abort the
      // entire save — unserializable keys are skipped and logged.
      const data: Record<string, unknown> = {};
      for (const [key, value] of this.store) {
        try {
          JSON.stringify(value);
          data[key] = value;
        } catch (err) {
          this.logger.warn({ err, key }, "Skipping unserializable state value while persisting");
        }
      }

      // Every surviving value serialized individually, so this cannot throw.
      const contents = JSON.stringify(data, null, 2);

      await mkdir(dirname(this.filePath), { recursive: true });
      await writeJsonAtomically(this.filePath, contents, this.logger, "state");

      this.logger.info(
        { keys: Object.keys(data).length, file: this.filePath },
        "State persisted to disk",
      );
    } catch (err) {
      this.logger.error({ err, file: this.filePath }, "Failed to persist state");
    }
  }

  /**
   * Schedule a coalesced save after a mutation: the first write in an idle period
   * starts the timer and later writes ride along, so a sustained stream still flushes
   * at a bounded interval. `flushIntervalMs: 0` saves on every mutation.
   */
  private scheduleFlush(): void {
    if (!this.persist) return;

    if (this.flushIntervalMs <= 0) {
      void this.save();
      return;
    }

    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.save();
    }, this.flushIntervalMs);
    // Never let a pending flush keep the process alive on its own — the
    // engine's graceful shutdown path calls flush() explicitly.
    this.flushTimer.unref?.();
  }

  /**
   * Cancel any pending coalesced save and perform one immediately, called on
   * graceful shutdown so mutations inside the current window are not lost.
   */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.save();
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private notifyListeners(key: string, newValue: unknown, oldValue: unknown): void {
    // Key-specific listeners
    const handlers = this.listeners.get(key);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(key, newValue, oldValue);
        } catch (err) {
          this.logger.error({ err, key }, "Error in state change handler");
        }
      }
    }

    // Global listeners
    for (const handler of this.globalListeners) {
      try {
        handler(key, newValue, oldValue);
      } catch (err) {
        this.logger.error({ err, key }, "Error in global state change handler");
      }
    }
  }

  /**
   * Simple equality check. Uses JSON.stringify for objects/arrays,
   * strict equality for primitives.
   */
  private isEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== typeof b) return false;
    if (typeof a === "object") {
      try {
        return JSON.stringify(a) === JSON.stringify(b);
      } catch {
        this.logger.debug("Failed to compare state values via JSON.stringify");
        return false;
      }
    }
    return false;
  }
}
