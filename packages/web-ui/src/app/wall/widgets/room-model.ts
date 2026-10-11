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
import type { RoomMember } from "../../types.js";

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
