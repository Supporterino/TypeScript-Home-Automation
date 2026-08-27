/**
 * The source-agnostic `DeviceSource` abstraction (design.md D2, D21, D22;
 * specs/device-sources/spec.md).
 *
 * Every controllable thing the engine knows about — Zigbee, Shelly, and
 * Nanoleaf devices, and configured state toggles — is exposed through one
 * interface: enumeration, command dispatch, and state subscription. The
 * HomeKit bridge and the web UI consume the same device model instead of
 * each reimplementing discovery, freshness, and write-back per family.
 */
import type { Capability } from "../../types/capabilities.js";
import { formatQualifiedId } from "./qualified-id.js";

/** Whether a device's last observation arrived push-first or on a poll. */
export type ObservationMode = "push" | "polled";

/**
 * How and when a device's last-known state was observed.
 *
 * `refreshIntervalMs` is present only for polled observations — it lets a
 * consumer derive a confirmation deadline (design.md D21) without knowing
 * which configuration setting governs which device family.
 */
export interface DeviceObservation {
  mode: ObservationMode;
  /** Epoch milliseconds at which this observation was made or last refreshed. */
  observedAt: number;
  /** Present only when `mode === "polled"`: the source's configured refresh interval. */
  refreshIntervalMs?: number;
}

/**
 * A rich, source-neutral description of one device, sufficient for a client
 * to render controls without knowing which family produced it.
 */
export interface DeviceDescriptor {
  /** The identifier of the source that yielded this device (e.g. "zigbee"). */
  source: string;
  /**
   * The device's stable identity within its source — IEEE address for
   * Zigbee, registered name for Shelly and Nanoleaf, state key for a toggle.
   * Does not change when the device is renamed upstream.
   */
  id: string;
  /** `source` and `id` joined per design.md D29 — the single identifier consumers address this device by. */
  qualifiedId: string;
  /** Human-readable display name. May change at any time; never used as an identifier. */
  displayName: string;
  /** The device's last-known state, in whatever shape its source reports. */
  state: Record<string, unknown>;
  /** Capability schema describing what can be read and what can be actuated. */
  capabilities: Capability[];
  /** Whether the device is currently reachable. */
  reachable: boolean;
  /** How and when the current state was observed. */
  observation: DeviceObservation;
}

/** Notified whenever a device's descriptor changes (state, reachability, or appearance/disappearance). */
export type DeviceChangeListener = (descriptor: DeviceDescriptor) => void;

/** The outcome of dispatching a command to a device through a `DeviceSource`. */
export type DeviceCommandOutcome =
  | { status: "ok" }
  | { status: "not_found" }
  | { status: "unavailable" }
  | { status: "invalid"; error: string };

/**
 * A source-agnostic supplier of devices from one device family.
 *
 * A source MUST enumerate its devices, accept commands for them, notify
 * subscribers of state and reachability changes, and be started and stopped
 * as part of the engine lifecycle. It reports itself unavailable — rather
 * than throwing — when its backing service or configuration is absent.
 */
export interface DeviceSource {
  /** Short, stable identifier for this source (e.g. "zigbee", "shelly", "nanoleaf", "state"). Never contains the qualified-id delimiter. */
  readonly id: string;

  /**
   * Whether this source's backing service/configuration is present. `false`
   * means enumeration yields no devices and commands are rejected as
   * unavailable, without the source throwing.
   */
  readonly available: boolean;

  /** Begin producing devices: replay known inventory and subscribe to change/freshness mechanisms. */
  start(): Promise<void> | void;

  /** Release every listener, subscription, and timer created in `start()`. */
  stop(): Promise<void> | void;

  /** Enumerate every device currently known to this source. Empty when unavailable. */
  list(): DeviceDescriptor[];

  /** Look up one device by its source-scoped device identifier (not the qualified id). */
  get(deviceId: string): DeviceDescriptor | undefined;

  /**
   * Dispatch a command to one of this source's devices.
   *
   * Returns `"not_found"` for an unrecognised device identifier,
   * `"unavailable"` when the source itself is unavailable, and `"invalid"`
   * with a descriptive error when the properties fail validation against the
   * device's declared capability schema (task 7.1) — rather than throwing —
   * so callers can map each to a distinct HTTP status. An invalid command
   * MUST NOT reach the device's transport (task 7.3).
   */
  command(deviceId: string, properties: Record<string, unknown>): Promise<DeviceCommandOutcome>;

  /** Subscribe to every device change this source produces. Returns an unsubscribe function. */
  subscribe(listener: DeviceChangeListener): () => void;
}

/**
 * Convenience helper for a source's `list()`/`get()` implementations: builds
 * a descriptor's `qualifiedId` from the source's own `id` and a device id.
 */
export function qualifyDeviceId(sourceId: string, deviceId: string): string {
  return formatQualifiedId(sourceId, deviceId);
}
