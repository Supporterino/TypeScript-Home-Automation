import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { DeviceObservation } from "@ts-ha/shared";
import type { Logger } from "pino";
import { readJsonWithBackup, writeJsonAtomically } from "../state/json-persistence.js";

/**
 * A device's last-known state together with the observation that produced it, so a
 * restored value reads as last-known. Reachability is deliberately not persisted.
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
   * Path to the JSON file for device state persistence; used when `persist` is true.
   *
   * @default "./device-state.json"
   */
  filePath?: string;

  /**
   * Milliseconds to wait after a mutation before flushing a coalesced save; `0` saves on
   * every mutation.
   *
   * @default 1000
   */
  flushIntervalMs?: number;
}

/**
 * Durable, unified store of the last-known state and observation for every device,
 * keyed by qualified id. The store is a seed, never an authority.
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
   * graceful shutdown can otherwise land inside `writeJsonAtomically()` concurrently.
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
   * Look up the last-known state and observation for a device. The returned record is the
   * store's own — treat it as read-only; only {@link record} should modify one.
   */
  get(qualifiedId: string): DeviceStateRecord | undefined {
    return this.records.get(qualifiedId);
  }

  /**
   * Record a device's state and the observation that produced it, overwriting any previous
   * record and scheduling a coalesced save.
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
   * Remove a device's stored record, so a disappeared device does not reappear after
   * a restart; returns whether a record existed.
   */
  prune(qualifiedId: string): boolean {
    const existed = this.records.delete(qualifiedId);
    if (existed) {
      this.scheduleFlush();
    }
    return existed;
  }

  /**
   * Every qualified id currently held, for reconciling the store against a live
   * enumeration; returns a fresh array, so pruning while iterating is safe.
   */
  keys(): string[] {
    return [...this.records.keys()];
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  /**
   * Load persisted device state from disk, called on startup before any source
   * starts. A restored record keeps its original `observation` verbatim.
   */
  async load(): Promise<void> {
    if (!this.persist) return;
    await readJsonWithBackup(this.filePath, this.logger, "device state", (parsed) =>
      this.restore(parsed),
    );
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
   * Save current device state to disk; concurrent calls are serialized so they never open
   * the same temp file at once.
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
      await writeJsonAtomically(this.filePath, contents, this.logger, "device state");

      this.logger.info(
        { devices: Object.keys(data).length, file: this.filePath },
        "Device state persisted to disk",
      );
    } catch (err) {
      this.logger.error({ err, file: this.filePath }, "Failed to persist device state");
    }
  }

  /**
   * Schedule a coalesced save after a mutation: the first write in an idle period starts
   * the timer and later writes ride along. `flushIntervalMs: 0` saves on every mutation.
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
