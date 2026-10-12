/**
 * Pure Rooms-tab model (specs/cli "Command Surface" — `ts-ha rooms`).
 *
 * Projects rooms with their membership for display, composes a batch command
 * from a single `property value` line, and summarizes a batch's per-member
 * outcomes. DOM/JSX-free so it is unit-testable without a render harness.
 */

import type { RoomCommandResult, RoomWithMembers } from "@ts-ha/shared";
import { parseCommandValue } from "./command-value.js";

export interface RoomMemberRow {
  qualifiedId: string;
  displayName: string;
  available: boolean;
  /** `null` when the device descriptor is unavailable. */
  reachable: boolean | null;
}

export interface RoomRow {
  id: string;
  name: string;
  memberCount: number;
  members: RoomMemberRow[];
}

/** Project rooms and their membership into display rows. */
export function projectRoomRows(rooms: RoomWithMembers[]): RoomRow[] {
  return rooms.map((room) => ({
    id: room.id,
    name: room.name,
    memberCount: room.members.length,
    members: room.members.map((member) => ({
      qualifiedId: member.qualifiedId,
      displayName: member.device?.displayName ?? "(unavailable)",
      available: member.available,
      reachable: member.device?.reachable ?? null,
    })),
  }));
}

export interface ParsedRoomCommand {
  property: string;
  properties: Record<string, unknown>;
}

/**
 * Parse a batch-control line of the form `<property> <value>`. The value is
 * JSON when valid, else the raw string (mirroring `state set`). Returns `null`
 * for an empty or property-only input.
 */
export function parseRoomCommandInput(input: string): ParsedRoomCommand | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const match = /^(\S+)\s+(.+)$/.exec(trimmed);
  if (!match) return null;

  const [, property, rawValue] = match;
  return { property, properties: { [property]: parseCommandValue(rawValue) } };
}

export interface RoomOutcomeCounts {
  applied: number;
  skipped: number;
  failed: number;
}

/** Count a batch's per-member outcomes. */
export function summarizeOutcomes(results: RoomCommandResult[]): RoomOutcomeCounts {
  const counts: RoomOutcomeCounts = { applied: 0, skipped: 0, failed: 0 };
  for (const result of results) counts[result.outcome] += 1;
  return counts;
}
