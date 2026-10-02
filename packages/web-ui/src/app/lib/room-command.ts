/**
 * Pure helpers for the room-level batch command (design.md D5; specs/web-ui
 * "Room-Level Command"; tasks 10.1–10.3).
 *
 * A room command is best-effort: the batch endpoint dispatches one command
 * body to every capable member and classifies each as applied, skipped
 * (declares no writable on/off), or failed. Because a source may declare its
 * on/off property as either the source-neutral `on` or Zigbee2MQTT's `state` —
 * and the endpoint rejects a property a member does not declare — a room whose
 * members span both families is commanded with one request per property
 * family, each composed through the shared boolean encoder so a
 * string-encoded family (`"ON"`/`"OFF"`) is addressed correctly. A homogeneous
 * room still yields exactly one request. This module owns that grouping and
 * classification, so the view stays a thin renderer over testable logic
 * (design.md D23).
 */
import {
  type Capability,
  composeBooleanCapabilityValue,
  type RoomCommandResult,
} from "@ts-ha/shared";
import {
  type FlatCapability,
  flattenCapabilities,
  pickOnOffCapability,
} from "./capability-ranking.js";

/**
 * The declared writable boolean on/off capability a room command can target,
 * resolved through the shared canonical preference (canonical `on` over
 * Zigbee2MQTT's `state`) so it agrees with the tile's ranked primary action.
 */
export function findOnOffCapability(capabilities: Capability[]): FlatCapability | undefined {
  return pickOnOffCapability(flattenCapabilities(capabilities), "writable");
}

/**
 * Whether a device declares any writable boolean on/off capability — exactly
 * the members the batch endpoint will attempt to actuate. Members that merely
 * report are skipped by the endpoint and must not be optimistically commanded
 * locally.
 */
export function supportsOnOffCommand(capabilities: Capability[]): boolean {
  return findOnOffCapability(capabilities) !== undefined;
}

/** One room member a command can address: its qualified identifier and declared capabilities. */
export interface RoomCommandMember {
  qualifiedId: string;
  capabilities: Capability[];
}

/**
 * One request to issue: the property family, the value encoded through that
 * family's declared on/off encoding, and the members it addresses.
 */
export interface RoomCommandGroup {
  property: string;
  value: string | number | boolean;
  members: RoomCommandMember[];
}

/**
 * Groups capable members by the on/off property they declare — one group per
 * distinct property name, each carrying the value composed through the
 * declaring capability's encoding. Members declaring no writable on/off are
 * dropped; a homogeneous room produces exactly one group, preserving the
 * "single request" guarantee (task 10.1), while a mixed room produces one per
 * family.
 */
export function groupOnOffCommand(members: RoomCommandMember[], on: boolean): RoomCommandGroup[] {
  const groups = new Map<string, RoomCommandGroup>();
  for (const member of members) {
    const capability = findOnOffCapability(member.capabilities);
    if (!capability) continue;
    const existing = groups.get(capability.property);
    if (existing) {
      existing.members.push(member);
      continue;
    }
    groups.set(capability.property, {
      property: capability.property,
      value: composeBooleanCapabilityValue(capability, on),
      members: [member],
    });
  }
  return [...groups.values()];
}

export interface RoomCommandClassification {
  /** Members the engine actuated (their optimistic override reconciles against reported state). */
  applied: string[];
  /** Members that declared no writable on/off and were not commanded. */
  skipped: string[];
  /** Members whose dispatch failed and whose optimistic override must revert. */
  failed: string[];
}

/**
 * Merges the per-family batch responses into one result per member. Every
 * request reports all room members, so a member capable of one family is
 * reported `skipped` by the other families' requests; its own family's
 * non-skipped outcome wins. Members no family can address stay `skipped`, so
 * {@link classifyRoomCommandResults} still separates a genuinely
 * non-actuatable member from a failed one (task 10.3).
 */
export function mergeRoomCommandResults(responses: RoomCommandResult[][]): RoomCommandResult[] {
  const byMember = new Map<string, RoomCommandResult>();
  for (const results of responses) {
    for (const result of results) {
      const existing = byMember.get(result.qualifiedId);
      if (!existing || existing.outcome === "skipped") byMember.set(result.qualifiedId, result);
    }
  }
  return [...byMember.values()];
}

/** Splits a batch response into applied, skipped, and failed qualified identifiers, preserving order. */
export function classifyRoomCommandResults(
  results: RoomCommandResult[],
): RoomCommandClassification {
  const applied: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  for (const result of results) {
    if (result.outcome === "applied") applied.push(result.qualifiedId);
    else if (result.outcome === "skipped") skipped.push(result.qualifiedId);
    else failed.push(result.qualifiedId);
  }

  return { applied, skipped, failed };
}
