import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import type { AggregateDeviceSource } from "./device-sources/aggregate.js";
import type { DeviceDescriptor } from "./device-sources/device-source.js";
import { INTERNAL_STATE_PREFIX, type StateManager } from "./state/state-manager.js";

/**
 * Reserved-namespace prefix under which each room definition is stored,
 * keyed by the room's stable identifier (design.md D14, D20).
 */
export const ROOM_PREFIX = `${INTERNAL_STATE_PREFIX}room:`;

/**
 * Reserved-namespace prefix under which each device's room assignment is
 * stored, keyed by the device's qualified identifier. The value is the
 * assigned room's id (design.md D14, D29).
 */
export const ROOM_ASSIGNMENT_PREFIX = `${INTERNAL_STATE_PREFIX}room-assignment:`;

/** Returns the reserved state key storing `id`'s room definition. */
export function roomKey(id: string): string {
  return `${ROOM_PREFIX}${id}`;
}

/** Returns the reserved state key storing `qualifiedId`'s room assignment. */
export function roomAssignmentKey(qualifiedId: string): string {
  return `${ROOM_ASSIGNMENT_PREFIX}${qualifiedId}`;
}

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

export type CreateRoomResult =
  | { status: "ok"; room: Room }
  | { status: "duplicate_name"; message: string };

export type RenameRoomResult =
  | { status: "ok"; room: Room }
  | { status: "not_found" }
  | { status: "duplicate_name"; message: string };

export type DeleteRoomResult = "ok" | "not_found";

export type AssignDeviceResult = "ok" | "room_not_found";

/**
 * User-defined rooms that group devices across every device source
 * (design.md D14; specs/device-rooms/spec.md).
 *
 * Room definitions live under {@link ROOM_PREFIX} and device assignments
 * under {@link ROOM_ASSIGNMENT_PREFIX}, both inside the reserved internal
 * state namespace (design.md D20) — written through `setInternal()` /
 * `deleteInternal()` so neither is reachable through the public state API,
 * mirroring the automation-enabled-flag pattern in `automation-manager.ts`.
 *
 * A single assignment key per device (rather than a per-room member list)
 * makes reassignment a single write with no intermediate state in which a
 * device belongs to both or neither room, and lets the engine derive a
 * membership-change SSE delta straight from that one key's change event
 * without resending every room's full membership.
 */
export class RoomManager {
  constructor(
    private readonly stateManager: StateManager,
    private readonly devices: AggregateDeviceSource,
    private readonly logger: Logger,
  ) {}

  /**
   * Create a room with the given display name.
   *
   * @returns `{ status: "duplicate_name" }` if a room with that name already
   * exists — no room is created.
   */
  createRoom(name: string): CreateRoomResult {
    if (this.findByName(name, null)) {
      return { status: "duplicate_name", message: `A room named "${name}" already exists` };
    }
    const room: Room = { id: randomUUID(), name };
    this.stateManager.setInternal(roomKey(room.id), room);
    this.logger.info({ roomId: room.id, name }, "Room created");
    return { status: "ok", room };
  }

  /**
   * Rename a room, preserving its membership (task 9.1).
   *
   * @returns `{ status: "not_found" }` for an unknown room id, or
   * `{ status: "duplicate_name" }` if another room already has that name.
   */
  renameRoom(id: string, name: string): RenameRoomResult {
    const existing = this.getRoom(id);
    if (!existing) return { status: "not_found" };
    if (this.findByName(name, id)) {
      return { status: "duplicate_name", message: `A room named "${name}" already exists` };
    }
    const room: Room = { id, name };
    this.stateManager.setInternal(roomKey(id), room);
    this.logger.info({ roomId: id, name }, "Room renamed");
    return { status: "ok", room };
  }

  /**
   * Delete a room. Its members are not deleted — they become unassigned
   * (task 9.1).
   */
  deleteRoom(id: string): DeleteRoomResult {
    if (!this.getRoom(id)) return "not_found";
    this.stateManager.deleteInternal(roomKey(id));
    for (const [qualifiedId, roomId] of this.allAssignments()) {
      if (roomId === id) {
        this.stateManager.deleteInternal(roomAssignmentKey(qualifiedId));
      }
    }
    this.logger.info({ roomId: id }, "Room deleted");
    return "ok";
  }

  /**
   * Assign a device (by qualified identifier) to a room, as a single
   * atomic write — reassigning a device already in another room moves it,
   * with no intermediate state (task 9.2). Assigning to the room a device
   * is already in is idempotent and does not fire a change event, since the
   * underlying value does not change.
   *
   * @returns `{ status: "room_not_found" }` for an unknown room id.
   */
  assignDevice(qualifiedId: string, roomId: string): AssignDeviceResult {
    if (!this.getRoom(roomId)) return "room_not_found";
    this.stateManager.setInternal(roomAssignmentKey(qualifiedId), roomId);
    return "ok";
  }

  /** Clear a device's room assignment, if any. Idempotent. */
  unassignDevice(qualifiedId: string): void {
    this.stateManager.deleteInternal(roomAssignmentKey(qualifiedId));
  }

  /** The room a device belongs to, or `null` if it is unassigned or its room no longer exists. */
  getRoomForDevice(qualifiedId: string): Room | null {
    const roomId = this.stateManager.get<string>(roomAssignmentKey(qualifiedId));
    if (!roomId) return null;
    return this.getRoom(roomId);
  }

  /** Every room, with its current membership including unavailable members (task 9.4). */
  listRooms(): RoomWithMembers[] {
    const rooms = this.allRooms();
    const membersByRoom = new Map<string, RoomMember[]>();
    for (const room of rooms) membersByRoom.set(room.id, []);

    for (const [qualifiedId, roomId] of this.allAssignments()) {
      const members = membersByRoom.get(roomId);
      // An assignment referencing a room that no longer exists should not
      // occur — deleteRoom() cleans up every assignment it owns — but a
      // missing entry is skipped rather than surfaced as an error either way
      // (specs/device-rooms "Unknown assignment does not break reads").
      if (!members) continue;
      members.push(this.toMember(qualifiedId));
    }

    return rooms.map((room) => ({ ...room, members: membersByRoom.get(room.id) ?? [] }));
  }

  /** A single room by id, or `null` if unknown. */
  getRoom(id: string): Room | null {
    return this.stateManager.get<Room>(roomKey(id)) ?? null;
  }

  /**
   * Every present device that belongs to no room (task 9.4). Absent devices
   * with no assignment are not meaningful here — they cannot be enumerated
   * at all outside of a room.
   */
  getUnassignedDevices(): DeviceDescriptor[] {
    const assigned = new Set(this.allAssignments().map(([qualifiedId]) => qualifiedId));
    return this.devices.list().filter((device) => !assigned.has(device.qualifiedId));
  }

  private toMember(qualifiedId: string): RoomMember {
    const device = this.devices.get(qualifiedId) ?? null;
    return { qualifiedId, available: device !== null, device };
  }

  private allRooms(): Room[] {
    const rooms: Room[] = [];
    for (const key of this.stateManager.keysInternal(ROOM_PREFIX)) {
      const room = this.stateManager.get<Room>(key);
      if (room) rooms.push(room);
    }
    return rooms;
  }

  private allAssignments(): Array<[qualifiedId: string, roomId: string]> {
    const assignments: Array<[string, string]> = [];
    for (const key of this.stateManager.keysInternal(ROOM_ASSIGNMENT_PREFIX)) {
      const roomId = this.stateManager.get<string>(key);
      if (!roomId) continue;
      assignments.push([key.slice(ROOM_ASSIGNMENT_PREFIX.length), roomId]);
    }
    return assignments;
  }

  private findByName(name: string, excludingId: string | null): Room | undefined {
    return this.allRooms().find((room) => room.name === name && room.id !== excludingId);
  }
}
