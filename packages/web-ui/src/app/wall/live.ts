/**
 * Pure live-update decisions for the wall surface: whether a stream event names
 * the profile on show, and which view state that leaves the wall in.
 */

import type { WallChangeKind, WallProfile } from "@ts-ha/shared";
import type { NormalizedStreamEvent } from "../types.js";

/**
 * The `wall` change kind an event reports for `name`, or `null` when the event is
 * not about that profile.
 */
export function wallEventKindForProfile(
  event: NormalizedStreamEvent,
  name: string,
): WallChangeKind | null {
  if (event.category !== "wall" || event.name !== name) return null;
  return event.kind;
}

/** Whether a stream event names the profile `name` — i.e. the wall must react to it. */
export function wallEventAffectsProfile(event: NormalizedStreamEvent, name: string): boolean {
  return wallEventKindForProfile(event, name) !== null;
}

/** The wall's resolved render state. */
export type WallViewState = "loading" | "ready" | "unknown" | "deleted";

export interface WallViewStateInput {
  /** The last successfully loaded profile, or `null` before one has loaded. */
  profile: WallProfile | null;
  /** A 404 for this profile — it has never existed — distinct from a transport failure. */
  notFound: boolean;
  /** A `wall` `deleted` event for this profile arrived while it was open. */
  deleted: boolean;
}

/**
 * Resolves the wall's view state: a deletion wins, a 404 is the never-existed
 * case, a loaded profile is ready, otherwise loading.
 */
export function wallViewState({ profile, notFound, deleted }: WallViewStateInput): WallViewState {
  if (deleted) return "deleted";
  if (notFound) return "unknown";
  if (profile !== null) return "ready";
  return "loading";
}

/**
 * Whether a failed profile load must displace the whole surface — only before any
 * profile has loaded.
 */
export function wallErrorIsFatal(profile: WallProfile | null): boolean {
  return profile === null;
}
