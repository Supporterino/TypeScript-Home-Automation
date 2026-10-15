/**
 * Pure card-archetype selection for the wall (design.md D1; specs/wall-display
 * "Wall Device Presentation"). The archetype — not a single template — decides
 * a device card's shape: a `light` carries both a toggle and a brightness
 * control, a `toggle` is the on/off-only whole-card target, a `cover` presents
 * transport controls, and a `readout` is a chrome-less value for a device with
 * no actuatable property. Anything the ranking does not classify keeps the
 * shared dashboard tile's behaviour, as `default`.
 *
 * Dependency-free and derived from the existing {@link TileRanking}, so there
 * is exactly one ranking of what a device *is* — this module only names the
 * card shape that ranking implies (design.md D1).
 */

import type { Capability } from "@ts-ha/shared";
import {
  coverTransportAction,
  formatBrightnessPercent,
  type TileRanking,
  writableBrightnessCapability,
} from "./capability-ranking.js";

/**
 * The brightness percentage formatter and the writable-brightness lookup live in
 * the wall's capability vocabulary (`capability-ranking.ts`) now; this module
 * re-exports them so its existing importers keep working unchanged.
 */
export { formatBrightnessPercent, writableBrightnessCapability };

/** The card shape the wall draws for a device, chosen from its ranked capabilities (design.md D1). */
export type CardArchetype = "light" | "toggle" | "cover" | "readout" | "default";

/**
 * Selects the wall card archetype for a device from its {@link rankDeviceTile}
 * ranking. `capabilities` is the schema the ranking was computed from, consulted
 * to confirm the brightness control a `light` card needs is writable and, for a
 * cover, whether the device declares a writable transport action (design.md
 * D15).
 */
export function cardArchetype(ranking: TileRanking, capabilities: Capability[]): CardArchetype {
  const action = ranking.action;
  if (!action) return ranking.readout ? "readout" : "default";
  // A cover positions (a writable `position`) or transports (a declared
  // writable transport action), so a position-less cover no longer falls back
  // to a generic enum control (design.md D15; specs/wall-display "A position-less
  // cover still gets transport").
  if (action.kind === "position" || coverTransportAction(capabilities) !== null) return "cover";
  if (action.kind === "on_off") {
    return writableBrightnessCapability(capabilities) ? "light" : "toggle";
  }
  return "default";
}

/**
 * Whether a wall card of this archetype is actuated by the whole card rather
 * than an embedded control. Only a pure `toggle` — an on/off device with no
 * value control — is whole-card actuated (specs/wall-display "The whole tile
 * actuates a toggle"). A `light` carries a brightness slider and an explicit
 * on/off toggle, so the card itself never actuates (design.md D3); a `readout`
 * has no action, and a `cover`/value card keeps its embedded control.
 */
export function archetypeWholeCardActuation(archetype: CardArchetype): boolean {
  return archetype === "toggle";
}

/**
 * Whether a device tile draws no surface of its own. A `contained` tile
 * inherits the surrounding frame's surface (design.md D2), and a wall readout
 * card is deliberately chrome-less (design.md D4) — both so a card is a single
 * surface. The dashboard (`wall === false`) never takes the readout branch, so
 * its rendering is unchanged.
 */
export function cardDrawsNoSurface(
  archetype: CardArchetype,
  wall: boolean,
  contained: boolean,
): boolean {
  return contained || (wall && archetype === "readout");
}
