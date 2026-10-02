/**
 * User-defined room shapes (design.md D14), shared because they are delivered
 * over the wire and reference device descriptors.
 */

import type { DeviceDescriptor } from "./device.js";

/** A user-defined room: a stable identifier and a unique display name. */
export interface Room {
  readonly id: string;
  readonly name: string;
}

/**
 * One member of a room's membership listing.
 *
 * `available` is `false` when the device is no longer known to any device
 * source — unpaired, or its source disabled/unconfigured — in which case
 * `device` is `null` rather than stale data (design.md D14).
 */
export interface RoomMember {
  readonly qualifiedId: string;
  readonly available: boolean;
  readonly device: DeviceDescriptor | null;
}

/** A room together with its current membership. */
export interface RoomWithMembers extends Room {
  readonly members: RoomMember[];
}
