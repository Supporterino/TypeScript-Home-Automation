/**
 * Pure card-archetype selection for the wall: names the card shape a device's
 * ranked capabilities imply.
 */

import type { Capability } from "@ts-ha/shared";
import {
  coverTransportAction,
  formatBrightnessPercent,
  type TileRanking,
  writableBrightnessCapability,
} from "./capability-ranking.js";

/** Re-exports the brightness formatter and writable-brightness lookup. */
export { formatBrightnessPercent, writableBrightnessCapability };

/** The card shape the wall draws for a device, chosen from its ranked capabilities. */
export type CardArchetype = "light" | "toggle" | "cover" | "readout" | "default";

/**
 * Selects the wall card archetype from a device's {@link rankDeviceTile}
 * ranking, consulting `capabilities` to confirm the controls it needs exist.
 */
export function cardArchetype(ranking: TileRanking, capabilities: Capability[]): CardArchetype {
  const action = ranking.action;
  if (!action) return ranking.readout ? "readout" : "default";
  // A cover either positions (writable `position`) or declares a transport action.
  if (action.kind === "position" || coverTransportAction(capabilities) !== null) return "cover";
  if (action.kind === "on_off") {
    return writableBrightnessCapability(capabilities) ? "light" : "toggle";
  }
  return "default";
}

/**
 * Whether a wall card is actuated by the whole card rather than an embedded
 * control: only a pure `toggle` is.
 */
export function archetypeWholeCardActuation(archetype: CardArchetype): boolean {
  return archetype === "toggle";
}

/**
 * Whether a device tile draws no surface of its own: a contained tile, or a
 * chrome-less wall readout card.
 */
export function cardDrawsNoSurface(
  archetype: CardArchetype,
  wall: boolean,
  contained: boolean,
): boolean {
  return contained || (wall && archetype === "readout");
}
