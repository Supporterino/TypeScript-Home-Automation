/** User-defined room shapes, delivered over the wire. */

import type { DeviceDescriptor } from "./device.js";

/** A user-defined room: a stable identifier and a unique display name. */
export interface Room {
  readonly id: string;
  readonly name: string;
}

/** One member of a room's membership listing; `device` is `null` when unavailable. */
export interface RoomMember {
  readonly qualifiedId: string;
  readonly available: boolean;
  readonly device: DeviceDescriptor | null;
}

/** A room together with its current membership. */
export interface RoomWithMembers extends Room {
  readonly members: RoomMember[];
}
