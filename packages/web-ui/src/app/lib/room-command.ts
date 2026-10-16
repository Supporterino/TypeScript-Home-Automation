/**
 * Pure helpers for the room-level batch command: groups members by on/off
 * property family and classifies the per-family batch responses.
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
 * resolved through the same canonical preference as the tile's primary action.
 */
export function findOnOffCapability(capabilities: Capability[]): FlatCapability | undefined {
  return pickOnOffCapability(flattenCapabilities(capabilities), "writable");
}

/**
 * Whether a device declares any writable boolean on/off capability — exactly
 * the members the batch endpoint will attempt to actuate.
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
 * Groups capable members by the on/off property they declare, one group per
 * distinct property, each encoded through its declaring capability.
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
 * Merges the per-family batch responses into one result per member: a member's
 * own family's non-skipped outcome wins over the other families' `skipped`.
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

/** Splits a batch response into applied, skipped, and failed identifiers, in order. */
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
