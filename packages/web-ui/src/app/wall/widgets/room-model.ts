/**
 * Pure member selection for the wall room widget: the available devices a room
 * command will actuate, and the tiles the card presents.
 */

import { type RoomCommandMember, supportsOnOffCommand } from "../../lib/room-command.js";
import type { DeviceDescriptor, RoomMember } from "../../types.js";

/**
 * The available, actuatable members of a room, in membership order.
 */
export function actuatableRoomMembers(members: readonly RoomMember[]): RoomCommandMember[] {
  const actuatable: RoomCommandMember[] = [];
  for (const member of members) {
    const device = member.device;
    if (!member.available || !device) continue;
    if (!supportsOnOffCommand(device.capabilities)) continue;
    actuatable.push({ qualifiedId: member.qualifiedId, capabilities: device.capabilities });
  }
  return actuatable;
}

/**
 * One tile a room card presents: a member's live device, or the member whose
 * device is no longer known (the card draws the shared unavailable tile for it).
 */
export interface RoomTile {
  readonly qualifiedId: string;
  readonly device: DeviceDescriptor | null;
}

/**
 * The tiles a room card presents: every available member with its live device,
 * then the members whose device is unavailable.
 */
export function roomTiles(members: readonly RoomMember[]): RoomTile[] {
  const tiles: RoomTile[] = [];
  for (const member of members) {
    const device = member.device;
    if (member.available && device) tiles.push({ qualifiedId: member.qualifiedId, device });
  }
  for (const member of members) {
    if (!member.available) tiles.push({ qualifiedId: member.qualifiedId, device: null });
  }
  return tiles;
}
