import { copyFile, mkdir, open, readFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import type { DeviceObservation } from "@ts-ha/shared";
import type { Logger } from "pino";

/**
 * A device's last-known state together with the observation that produced it
 * (design.md D1, D4; specs/device-state-store). The observation is retained so
 * a restored value is presented as last-known rather than live.
 *
 * Reachability is deliberately not part of a record: design.md D1 scopes the
 * store to state + observation only. A restored descriptor therefore defaults
 * to reachable until the next observation arrives (see `trackedFor()` in the
 * Shelly/Nanoleaf sources).
 */
export interface DeviceStateRecord {
  state: Record<string, unknown>;
  observation: DeviceObservation;
}

/**
 * Options for the DeviceStateStore. Mirrors {@link StateManagerOptions}.
 */
export interface DeviceStateStoreOptions {
  /**
   * Whether to persist device state to a JSON file and restore it on startup.
   *
   * @default true
   */
  persist?: boolean;

  /**
   * Path to the JSON file for device state persistence.
   * Only used when `persist` is true.
   *
   * @default "./device-state.json"
   */
  filePath?: string;

  /**
   * Milliseconds to wait after a mutation before flushing a coalesced save to
   * disk. Multiple writes within one window produce a single save. `0` saves
   * on every mutation. Only used when `persist` is true.
   *
   * @default 1000
   */
  flushIntervalMs?: number;
}

/**
 * Durable, unified store of the last-known state and observation for every
 * device, keyed by qualified id (design.md D1, D3; specs/device-state-store).
 *
 * A device source records each observation here and seeds a descriptor's
 * state from the store when it has no fresher in-memory observation, so a
 * device's last-known state is available after a restart without waiting for
 * a new observation. The store is a seed, never an authority — a reported
 * observation always wins over the persisted value.
 *
 * Persistence mirrors `StateManager`: a debounced write-behind JSON file with
 * chained, serialized saves and atomic temp-file writes.
 */
export class DeviceStateStore {
  private readonly records: Map<string, DeviceStateRecord> = new Map();
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
    options: DeviceStateStoreOptions = {},
  ) {
    this.persist = options.persist ?? true;
    this.filePath = options.filePath ?? "./device-state.json";
    this.flushIntervalMs = options.flushIntervalMs ?? 1000;
  }

  /** Number of device records currently held. */
  get size(): number {
    return this.records.size;
  }

  /**
   * Look up the last-known state and observation for a device.
   *
   * The returned record is the store's own — treat it as read-only; mutating
   * its `state` in place would silently change the persisted value. Only
   * {@link record} should modify a record, and it copies the state it is given
   * so a caller's later mutation cannot leak in.
   *
   * @param qualifiedId The device's qualified identifier
   * @returns The stored record, or `undefined` when the device is unknown
   */
  get(qualifiedId: string): DeviceStateRecord | undefined {
    return this.records.get(qualifiedId);
  }

  /**
   * Record a device's state and the observation that produced it, overwriting
   * any previous record, and schedule a coalesced save when persistence is
   * enabled.
   *
   * @param qualifiedId The device's qualified identifier
   * @param state The device's last-known state
   * @param observation How and when the state was observed
   */
  record(
    qualifiedId: string,
    state: Record<string, unknown>,
    observation: DeviceObservation,
  ): void {
    // Shallow-copy the caller's state so a later in-place mutation of the
    // descriptor's state cannot silently alter the persisted value.
    this.records.set(qualifiedId, { state: { ...state }, observation });
    this.scheduleFlush();
  }

  /**
   * Remove a device's stored record, so a disappeared device does not reappear
   * after a restart (design.md D5). Schedules a coalesced save when a record
   * was actually removed.
   *
   * @param qualifiedId The device's qualified identifier
   * @returns true if a record existed and was removed
   */
  prune(qualifiedId: string): boolean {
    const existed = this.records.delete(qualifiedId);
    if (existed) {
      this.scheduleFlush();
    }
    return existed;
  }

  /**
   * Every qualified id currently held, for reconciling the store against a
   * live device enumeration (design.md D5). Returns a fresh array of the
   * current keys, so pruning while iterating over the result is safe.
   */
  keys(): string[] {
    return [...this.records.keys()];
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  /**
   * Load persisted device state from disk (if persistence is enabled). Called
   * by the engine on startup, before any device source starts (design.md D1).
   *
   * A restored record keeps its original `observation` verbatim — the
   * observedAt is the time it was recorded, never the read time (design.md
   * D4), so a restored value reads as last-known rather than live.
   */
  async load(): Promise<void> {
    if (!this.persist) return;

    let data: string;
    try {
      data = await readFile(this.filePath, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.logger.debug(
          { file: this.filePath },
          "No persisted device state file found, starting fresh",
        );
      } else {
        this.logger.error({ err, file: this.filePath }, "Failed to load persisted device state");
      }
      return;
    }

    try {
      this.restore(JSON.parse(data) as Record<string, unknown>);
    } catch (err) {
      // Primary file is corrupt/unparseable — attempt recovery from the backup.
      this.logger.error(
        { err, file: this.filePath },
        "Persisted device state file is corrupt, attempting backup recovery",
      );
      await this.recoverFromBackup();
    }
  }

  /**
   * Attempt to restore records from the backup file (`filePath` + `.bak`),
   * written by {@link atomicWrite} on the previous save. On failure the
   * in-memory store is left empty and an error is logged.
   */
  private async recoverFromBackup(): Promise<void> {
    const backupPath = `${this.filePath}.bak`;
    try {
      const data = await readFile(backupPath, "utf-8");
      this.restore(JSON.parse(data) as Record<string, unknown>);
    } catch (err) {
      this.logger.error(
        { err, file: backupPath },
        "Backup device state file missing or corrupt, starting with an empty store",
      );
    }
  }

  /** Load parsed records into the store, restoring each observation verbatim. */
  private restore(parsed: Record<string, unknown>): void {
    for (const [qualifiedId, value] of Object.entries(parsed)) {
      if (isDeviceStateRecord(value)) {
        this.records.set(qualifiedId, value);
      } else {
        this.logger.warn({ qualifiedId }, "Skipping malformed device state record while loading");
      }
    }
    this.logger.info(
      { devices: this.records.size, file: this.filePath },
      "Device state restored from disk",
    );
  }

  /**
   * Save current device state to disk (if persistence is enabled).
   *
   * Concurrent calls are serialized onto one chain so they never open the same
   * temp file at once. A failed save is logged and does not prevent a later
   * save from running.
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
      // Serialize each record individually so one bad value cannot abort the
      // entire save — unserializable records are skipped and logged.
      const data: Record<string, DeviceStateRecord> = {};
      for (const [qualifiedId, record] of this.records) {
        try {
          JSON.stringify(record);
          data[qualifiedId] = record;
        } catch (err) {
          this.logger.warn(
            { err, qualifiedId },
            "Skipping unserializable device state while persisting",
          );
        }
      }

      // Every surviving record serialized individually, so this cannot throw.
      const contents = JSON.stringify(data, null, 2);

      await mkdir(dirname(this.filePath), { recursive: true });
      await this.atomicWrite(this.filePath, contents);

      this.logger.info(
        { devices: Object.keys(data).length, file: this.filePath },
        "Device state persisted to disk",
      );
    } catch (err) {
      this.logger.error({ err, file: this.filePath }, "Failed to persist device state");
    }
  }

  /**
   * Schedules a coalesced save after a mutation, when persistence is enabled.
   * Multiple writes inside one `flushIntervalMs` window produce a single save —
   * the first write in an idle period starts the timer, and later writes ride
   * along until it fires rather than restarting it.
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
   * Cancels any pending coalesced save and performs one immediately. Called by
   * the engine on graceful shutdown so mutations made inside the current
   * debounce window are not lost.
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
        this.logger.warn({ err, file: filePath }, "Failed to back up prior device state file");
      }
    }

    await rename(tmpPath, filePath);
  }
}

/** Structural guard for a persisted record read back from disk. */
function isDeviceStateRecord(value: unknown): value is DeviceStateRecord {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { state?: unknown; observation?: unknown };
  return (
    typeof candidate.state === "object" &&
    candidate.state !== null &&
    typeof candidate.observation === "object" &&
    candidate.observation !== null
  );
}
