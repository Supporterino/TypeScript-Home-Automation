/** Source-neutral device descriptor and observation contracts. */

import type { Capability } from "./capabilities.js";

/** Whether a device's last observation arrived push-first or on a poll. */
export type ObservationMode = "push" | "polled";

/** How and when a device's last-known state was observed. */
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
  /** The device's stable identity within its source; never changes on rename. */
  id: string;
  /** `source` and `id` joined; the identifier consumers address this device by. */
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
  /** Whether the device is hidden — a user preference stamped on by `AggregateDeviceSource`. */
  hidden: boolean;
  /** Qualified identifiers of this device's members, present only on a group device. */
  memberQualifiedIds?: string[];
}
