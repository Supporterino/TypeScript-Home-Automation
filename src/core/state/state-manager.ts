import { copyFile, mkdir, open, readFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import type { Logger } from "pino";

/** Callback for state change listeners. */
export type StateChangeHandler<T = unknown> = (
  key: string,
  newValue: T | undefined,
  oldValue: T | undefined,
) => void;

/**
 * Sigil prefix for the reserved internal state namespace (design.md D20).
 *
 * Automation-scoped keys are `<automation-name>:<key>`, and automation names
 * derive from kebab-case filenames — they can never begin with `$`. A public
 * caller can therefore never produce a key inside this namespace, which is
 * what makes the reservation enforceable rather than merely conventional.
 *
 * Internal consumers (room definitions, automation enabled flags) write
 * through {@link StateManager.setInternal} / {@link StateManager.deleteInternal},
 * which bypass the rejection that {@link StateManager.set} and
 * {@link StateManager.delete} apply to every other caller.
 */
export const INTERNAL_STATE_PREFIX = "$internal:";

/** Returns true when `key` falls inside the reserved internal namespace. */
export function isReservedStateKey(key: string): boolean {
  return key.startsWith(INTERNAL_STATE_PREFIX);
}

/**
 * Options for the StateManager.
 */
export interface StateManagerOptions {
  /**
   * Whether to persist state to a JSON file on shutdown and
   * restore it on startup.
   *
   * @default true
   */
  persist?: boolean;

  /**
   * Path to the JSON file for state persistence.
   * Only used when `persist` is true.
   *
   * @default "./state.json"
   */
  filePath?: string;

  /**
   * Milliseconds to wait after a mutation before flushing a coalesced save to
   * disk. Multiple writes within one window produce a single save. `0` saves
   * on every mutation. Only used when `persist` is true.
   *
   * An abrupt process kill loses mutations from the current window — a
   * bounded trade-off against writing through on every `set()`, which is not
   * viable given `save()` rewrites and fsyncs the whole store (design.md D6,
   * R3).
   *
   * @default 1000
   */
  flushIntervalMs?: number;
}

/**
 * Generic state manager for sharing and persisting state across automations.
 *
 * Provides typed get/set/delete operations on an in-memory key-value store.
 * Supports change listeners that fire when a key is set or deleted, enabling
 * the `state` trigger type in automations.
 *
 * Optionally persists state to a JSON file on shutdown and restores it on
 * startup.
 *
 * @example
 * ```ts
 * // In an automation:
 * this.state.set("night_mode", true);
 * const isNight = this.state.get<boolean>("night_mode");
 *
 * // Typed with a default:
 * const count = this.state.get<number>("motion_count", 0);
 * this.state.set("motion_count", count + 1);
 *
 * // Delete:
 * this.state.delete("temporary_flag");
 * ```
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
   * Chains every `save()` call (scheduled or explicit) so overlapping calls
   * never race on the same file — a scheduled flush and an explicit call from
   * graceful shutdown can otherwise land inside `atomicWrite()` concurrently.
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

  /**
   * Get a value from the state store.
   *
   * @param key The state key
   * @param defaultValue Value to return if the key doesn't exist
   * @returns The stored value cast to T, or the default
   */
  get<T = unknown>(key: string, defaultValue?: T): T | undefined {
    if (this.store.has(key)) {
      return this.store.get(key) as T;
    }
    return defaultValue;
  }

  /**
   * Set a value in the state store.
   *
   * Fires change listeners if the value actually changed, and schedules a
   * coalesced save when persistence is enabled.
   *
   * @param key The state key
   * @param value The value to store
   * @throws {Error} if `key` falls inside the reserved internal namespace
   * (design.md D20). Use {@link setInternal} for room and automation
   * enabled-flag writes.
   */
  set<T = unknown>(key: string, value: T): void {
    if (isReservedStateKey(key)) {
      throw new Error(`Cannot write reserved internal state key "${key}" through the public API`);
    }
    this.writeValue(key, value);
  }

  /**
   * Writes a key under the reserved internal namespace, bypassing the
   * rejection {@link set} applies to public callers. Used only by the room
   * and automation enabled-flag writers (design.md D20).
   *
   * Everything else about the write is unchanged — it is persisted,
   * coalesced by the flush interval, and delivered to change listeners like
   * any other key.
   *
   * @throws {Error} if `key` does not fall inside the reserved namespace —
   * this path exists for internal keys only.
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
   * Delete a key from the state store.
   *
   * Fires change listeners if the key existed, and schedules a coalesced
   * save when persistence is enabled.
   *
   * @param key The state key
   * @returns true if the key existed and was deleted
   * @throws {Error} if `key` falls inside the reserved internal namespace.
   * Use {@link deleteInternal} for room and automation enabled-flag deletes.
   */
  delete(key: string): boolean {
    if (isReservedStateKey(key)) {
      throw new Error(`Cannot delete reserved internal state key "${key}" through the public API`);
    }
    return this.deleteValue(key);
  }

  /**
   * Deletes a key under the reserved internal namespace, bypassing the
   * rejection {@link delete} applies to public callers (design.md D20).
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

  /**
   * Get all keys in the state store, excluding reserved internal keys
   * (design.md D20). Every surface that lists or counts keys derives from
   * this method, so a count alongside a listing can never disagree with it.
   */
  keys(): string[] {
    return [...this.store.keys()].filter((key) => !isReservedStateKey(key));
  }

  /**
   * Returns reserved internal keys starting with `prefix`, for an internal
   * consumer that owns a slice of the reserved namespace and needs to
   * enumerate it — for example the automation-enabled reaper discarding
   * preferences for automations no longer discovered (design.md D20, D30).
   *
   * The reserved namespace is otherwise unenumerable through the public API
   * by design; this exists for internal consumers only.
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

  /**
   * Register a listener for changes to a specific key.
   *
   * @param key The state key to watch
   * @param handler Callback fired with (key, newValue, oldValue)
   */
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

    let data: string;
    try {
      data = await readFile(this.filePath, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.logger.debug({ file: this.filePath }, "No persisted state file found, starting fresh");
      } else {
        this.logger.error({ err, file: this.filePath }, "Failed to load persisted state");
      }
      return;
    }

    try {
      this.restore(JSON.parse(data) as Record<string, unknown>, this.filePath);
    } catch (err) {
      // Primary file is corrupt/unparseable — attempt recovery from the backup.
      this.logger.error(
        { err, file: this.filePath },
        "Persisted state file is corrupt, attempting backup recovery",
      );
      await this.recoverFromBackup();
    }
  }

  /**
   * Attempt to restore state from the backup file (`filePath` + `.bak`).
   * On failure the in-memory store is left empty and an error is logged.
   */
  private async recoverFromBackup(): Promise<void> {
    const backupPath = `${this.filePath}.bak`;
    try {
      const data = await readFile(backupPath, "utf-8");
      this.restore(JSON.parse(data) as Record<string, unknown>, backupPath);
    } catch (err) {
      this.logger.error(
        { err, file: backupPath },
        "Backup state file missing or corrupt, starting with an empty store",
      );
    }
  }

  /** Load parsed key-value pairs into the store and log success. */
  private restore(parsed: Record<string, unknown>, file: string): void {
    for (const [key, value] of Object.entries(parsed)) {
      this.store.set(key, value);
    }
    this.logger.info({ keys: Object.keys(parsed).length, file }, "State restored from disk");
  }

  /**
   * Save current state to disk (if persistence is enabled).
   *
   * Concurrent calls — a scheduled coalesced flush racing an explicit call
   * from graceful shutdown — are serialized onto one chain so they never
   * open the same temp file at once. A failed save is logged and does not
   * prevent a later save from running (design.md R3; task 2.5).
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
      await this.atomicWrite(this.filePath, contents);

      this.logger.info(
        { keys: Object.keys(data).length, file: this.filePath },
        "State persisted to disk",
      );
    } catch (err) {
      this.logger.error({ err, file: this.filePath }, "Failed to persist state");
    }
  }

  /**
   * Schedules a coalesced save after a mutation, when persistence is
   * enabled. Multiple writes inside one `flushIntervalMs` window produce a
   * single save — the first write in an idle period starts the timer, and
   * later writes ride along until it fires rather than restarting it, so a
   * sustained stream of writes still flushes at a bounded interval rather
   * than being deferred indefinitely (design.md D6).
   *
   * `flushIntervalMs: 0` saves on every mutation instead of scheduling.
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
   * Cancels any pending coalesced save and performs one immediately.
   *
   * Called by the engine on graceful shutdown so mutations made inside the
   * current debounce window are not lost (design.md D6; task 2.3).
   */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.save();
  }

  /**
   * Durably write `contents` to `filePath` atomically.
   *
   * Writes to a temp file, `fsync`s it to disk, preserves any existing file as
   * a `.bak` backup (best-effort), then atomically renames the temp file over
   * `filePath`. An interrupted write can never leave `filePath` truncated.
   */
  private async atomicWrite(filePath: string, contents: string): Promise<void> {
    const tmpPath = `${filePath}.tmp`;

    const fh = await open(tmpPath, "w");
    try {
      await fh.writeFile(contents, "utf-8");
      await fh.sync();
    } finally {
      await fh.close();
    }

    // Best-effort backup of the previous good file — a failed backup (e.g. the
    // file does not exist yet) MUST NOT block the primary save.
    try {
      await copyFile(filePath, `${filePath}.bak`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        this.logger.warn({ err, file: filePath }, "Failed to back up prior state file");
      }
    }

    await rename(tmpPath, filePath);
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
