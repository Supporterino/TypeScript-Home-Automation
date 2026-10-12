import type { DebugClient } from "../client.js";
import { parseCommandValue } from "../command-value.js";
import { formatTable, formatValue } from "../format.js";
import { summarizeOutcomes } from "../room-model.js";
import { resolveDeviceOrExit } from "./device-lookup.js";

/** List rooms with their member count. */
export async function listRooms(client: DebugClient, json: boolean): Promise<void> {
  const result = await client.getRooms();

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.rooms.length === 0) {
    console.log("No rooms defined.");
    return;
  }

  const rows = result.rooms.map((room) => [room.id, room.name, String(room.members.length)]);
  console.log(formatTable(["ID", "NAME", "MEMBERS"], rows));
  console.log(`\n${result.count} room${result.count === 1 ? "" : "s"}`);
}

/**
 * Show one room's membership. The engine exposes no `/api/rooms/:id`, so the
 * room is selected from the full listing by id (as the web UI does).
 */
export async function getRoom(client: DebugClient, id: string, json: boolean): Promise<void> {
  const result = await client.getRooms();
  const room = result.rooms.find((candidate) => candidate.id === id);

  if (!room) {
    console.error(`Room not found: ${id}`);
    process.exit(1);
  }

  if (json) {
    console.log(JSON.stringify(room, null, 2));
    return;
  }

  console.log(`Room:     ${room.name}`);
  console.log(`ID:       ${room.id}`);

  if (room.members.length === 0) {
    console.log("\n(no members)");
    return;
  }

  const rows = room.members.map((member) => [
    member.qualifiedId,
    member.device?.displayName ?? "(unavailable)",
    member.available ? "yes" : "no",
    member.device ? String(member.device.reachable) : "—",
  ]);
  console.log("");
  console.log(formatTable(["QUALIFIED ID", "NAME", "AVAILABLE", "REACHABLE"], rows));
}

export async function createRoom(client: DebugClient, name: string, json: boolean): Promise<void> {
  const room = await client.createRoom(name);
  if (json) {
    console.log(JSON.stringify(room, null, 2));
    return;
  }
  console.log(`Created room "${room.name}" (${room.id}).`);
}

export async function renameRoom(
  client: DebugClient,
  id: string,
  name: string,
  json: boolean,
): Promise<void> {
  const room = await client.renameRoom(id, name);
  if (json) {
    console.log(JSON.stringify(room, null, 2));
    return;
  }
  console.log(`Renamed room ${id} to "${room.name}".`);
}

export async function deleteRoom(client: DebugClient, id: string, json: boolean): Promise<void> {
  const result = await client.deleteRoom(id);
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Deleted room ${result.id}.`);
}

/** Issue a batch command to every capable room member, reporting each outcome. */
export async function sendRoomCommand(
  client: DebugClient,
  id: string,
  property: string,
  rawValue: string,
  json: boolean,
): Promise<void> {
  const value = parseCommandValue(rawValue);
  const results = await client.sendRoomCommand(id, { [property]: value });

  if (json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (results.length === 0) {
    console.log(`Room ${id} has no members.`);
    return;
  }

  const rows = results.map((result) => [result.qualifiedId, result.outcome]);
  console.log(formatTable(["QUALIFIED ID", "OUTCOME"], rows));

  const counts = summarizeOutcomes(results);
  console.log(
    `\n${counts.applied} applied, ${counts.skipped} skipped, ${counts.failed} failed` +
      ` (${property} = ${formatValue(value)})`,
  );
}

/** Assign a device to a room, resolving the device argument via the catalog. */
export async function assignRoom(
  client: DebugClient,
  deviceQuery: string,
  roomId: string,
  json: boolean,
): Promise<void> {
  const device = await resolveDeviceOrExit(client, deviceQuery);
  const result = await client.assignDeviceRoom(device.qualifiedId, roomId);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Assigned "${device.displayName}" to room ${result.roomId}.`);
}

/** Clear a device's room assignment, resolving the device argument via the catalog. */
export async function unassignRoom(
  client: DebugClient,
  deviceQuery: string,
  json: boolean,
): Promise<void> {
  const device = await resolveDeviceOrExit(client, deviceQuery);
  const result = await client.unassignDeviceRoom(device.qualifiedId);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Unassigned "${device.displayName}".`);
}
