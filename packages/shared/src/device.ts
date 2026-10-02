/**
 * Source-neutral device descriptor and observation contracts (design.md D1,
 * D2, D21, D22). Every device source reports its devices in these terms.
 */

import type { Capability } from "./capabilities.js";

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
  /**
   * Whether the device is hidden — a user preference held above the
   * sources, not something a source knows about its own devices
   * (design.md D8; specs/device-sources "Rich Device Descriptor").
   *
   * A source does not set this; `AggregateDeviceSource` stamps it onto
   * every descriptor it yields, from enumeration, retrieval, and
   * subscription delivery alike.
   */
  hidden: boolean;
  /**
   * Qualified identifiers of this device's members, present only on a group
   * device (design.md D14). Metadata about the group, not a structural
   * parent/child relationship — member descriptors carry no reciprocal
   * reference back to the group.
   */
  memberQualifiedIds?: string[];
}
