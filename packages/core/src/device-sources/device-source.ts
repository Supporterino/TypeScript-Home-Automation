/**
 * The source-agnostic `DeviceSource` abstraction. Every controllable thing the
 * engine knows about is exposed through one interface: enumeration, command
 * dispatch, and state subscription.
 */
import type { DeviceDescriptor } from "@ts-ha/shared";
import { formatQualifiedId } from "./qualified-id.js";

export type {
  DeviceDescriptor,
  DeviceObservation,
  ObservationMode,
} from "@ts-ha/shared";

/** Notified whenever a device's descriptor changes (state, reachability, or appearance/disappearance). */
export type DeviceChangeListener = (descriptor: DeviceDescriptor) => void;

/** The outcome of dispatching a command to a device through a `DeviceSource`. */
export type DeviceCommandOutcome =
  | { status: "ok" }
  | { status: "not_found" }
  | { status: "unavailable" }
  | { status: "invalid"; error: string };

/**
 * A source-agnostic supplier of devices from one device family: it enumerates devices,
 * accepts commands, notifies of state changes, and reports itself unavailable rather than
 * throwing when its backing service is absent.
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
   * Dispatch a command to one of this source's devices. An invalid command is
   * rejected rather than thrown, and must not reach the device's transport.
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
