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
 * Options for the StateManager.
 */
export interface StateManagerOptions {
  /**
   * Whether to persist state to a JSON file on shutdown and
   * restore it on startup.
   *
   * @default false
   */
  persist?: boolean;

  /**
   * Path to the JSON file for state persistence.
   * Only used when `persist` is true.
   *
   * @default "./state.json"
   */
  filePath?: string;
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

  constructor(
    private readonly logger: Logger,
    options: StateManagerOptions = {},
  ) {
    this.persist = options.persist ?? false;
    this.filePath = options.filePath ?? "./state.json";
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
   * Fires change listeners if the value actually changed.
   *
   * @param key The state key
   * @param value The value to store
   */
  set<T = unknown>(key: string, value: T): void {
    const oldValue = this.store.get(key);
    this.store.set(key, value);

    // Only notify if the value actually changed
    if (!this.isEqual(oldValue, value)) {
      this.logger.debug({ key, oldValue, newValue: value }, "State changed");
      this.notifyListeners(key, value, oldValue);
    }
  }

  /**
   * Delete a key from the state store.
   *
   * Fires change listeners if the key existed.
   *
   * @param key The state key
   * @returns true if the key existed and was deleted
   */
  delete(key: string): boolean {
    if (!this.store.has(key)) {
      return false;
    }

    const oldValue = this.store.get(key);
    this.store.delete(key);
    this.logger.debug({ key, oldValue }, "State deleted");
    this.notifyListeners(key, undefined, oldValue);
    return true;
  }

  /**
   * Check if a key exists in the state store.
   */
  has(key: string): boolean {
    return this.store.has(key);
  }

  /**
   * Get all keys in the state store.
   */
  keys(): string[] {
    return [...this.store.keys()];
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
   * Called by the engine on shutdown.
   */
  async save(): Promise<void> {
    if (!this.persist) return;

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
