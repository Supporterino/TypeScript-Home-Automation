/**
 * Pure live-update decisions for the wall surface (design.md D9, D11;
 * specs/wall-display "Profile Changes Reach Open Walls", "Always-On
 * Operation").
 *
 * The wall does not open its own stream — it rides the data layer's single
 * snapshot-then-stream connection, so on a network drop the store marks the
 * transport degraded, falls back to polling, and re-reads its snapshot when
 * the stream reopens, with no reload of the wall. This module holds the only
 * decision-worthy part of reacting to that stream: whether an event names the
 * profile this wall is showing, and which view state that leaves the wall in.
 *
 * Kept dependency-free (no React, no DOM) so both are reachable by `bun test`.
 */

import type { WallChangeKind, WallProfile } from "@ts-ha/shared";
import type { NormalizedStreamEvent } from "../types.js";

/**
 * The `wall` change kind an event reports for `name`, or `null` when the
 * event is not about that profile — a different profile's change, or any other
 * category entirely. A `null` result means the wall has nothing to do.
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
 * Resolves the wall's view state. A deletion wins over everything (the profile
 * is gone regardless of any stale in-memory copy); a 404 is the never-existed
 * case; a loaded profile is ready; otherwise it is still loading. Both empty
 * cases render an explanation rather than a blank surface (specs/wall-display
 * "An unknown profile explains itself", "A deleted profile is explained on an
 * open wall").
 */
export function wallViewState({ profile, notFound, deleted }: WallViewStateInput): WallViewState {
  if (deleted) return "deleted";
  if (notFound) return "unknown";
  if (profile !== null) return "ready";
  return "loading";
}

/**
 * Whether a failed profile load must displace the whole surface with the
 * destructive "Wall unavailable" state. Only before any profile has loaded:
 * once a composition is on screen, a transient refetch failure (a `wall` event
 * or a `degraded → live` restore) must not blank it — the last-good profile,
 * including the connection-independent clock, keeps rendering and the error is
 * surfaced non-destructively instead (specs/wall-display "Always-On
 * Operation").
 */
export function wallErrorIsFatal(profile: WallProfile | null): boolean {
  return profile === null;
}
