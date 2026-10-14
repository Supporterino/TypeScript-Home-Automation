/**
 * Pure member selection for the wall room widget (design.md D7;
 * specs/wall-display "Widget Catalog"; specs/wall-display "A room widget
 * commands the room").
 *
 * A room command is best-effort and must address exactly the members the
 * batch endpoint will attempt to actuate: available devices that declare a
 * writable on/off capability. Report-only members — and members whose device
 * is no longer known — are excluded here, so the widget never optimistically
 * commands something the endpoint would skip. Kept DOM-free so the selection
 * is testable.
 */

import { type RoomCommandMember, supportsOnOffCommand } from "../../lib/room-command.js";
import type { DeviceDescriptor, RoomMember } from "../../types.js";

/**
 * The available, actuatable members of a room, in membership order — exactly
 * the set {@link groupOnOffCommand} should issue commands for.
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
 * The tiles a room card presents, in the order the card has always drawn them
 * (design.md D13; specs/wall-display "Widget Catalog"): every available member —
 * each with its live device — then the members whose device is unavailable.
 *
 * The tile set is kept as data rather than built inline by the renderer, because
 * the card pages it through the wall's shared pagination layer
 * (wall-zones-and-fit D5; specs/wall-display "Panel Fit").
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
