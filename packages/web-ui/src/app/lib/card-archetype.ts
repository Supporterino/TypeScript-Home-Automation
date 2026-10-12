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
  type FlatCapability,
  flattenCapabilities,
  type TileRanking,
} from "./capability-ranking.js";

/** The card shape the wall draws for a device, chosen from its ranked capabilities (design.md D1). */
export type CardArchetype = "light" | "toggle" | "cover" | "readout" | "default";

/**
 * The writable brightness control a `light` card drives, if the device declares
 * one. A brightness the device only reports would let the ranking qualify an
 * on/off primary with a brightness readout, but no slider could be driven — so
 * its absence keeps such a device a plain `toggle` rather than a broken light.
 */
export function writableBrightnessCapability(
  capabilities: Capability[],
): FlatCapability | undefined {
  return flattenCapabilities(capabilities).find(
    (c) => c.property === "brightness" && c.valueType === "numeric" && c.access.writable,
  );
}

/**
 * Selects the wall card archetype for a device from its {@link rankDeviceTile}
 * ranking. `capabilities` is the schema the ranking was computed from, consulted
 * only to confirm the brightness control a `light` card needs is writable.
 */
export function cardArchetype(ranking: TileRanking, capabilities: Capability[]): CardArchetype {
  const action = ranking.action;
  if (!action) return ranking.readout ? "readout" : "default";
  if (action.kind === "position") return "cover";
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
 * Whether a device tile draws no `Paper` of its own. A `contained` tile
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

/**
 * Formats a brightness value as a percentage of its declared range for the
 * light card's persistent readout (design.md D3). A raw `0–254` Zigbee
 * brightness and a `0–100` Nanoleaf one both read as a percentage, so the value
 * is normalised against its own range rather than assumed to already be one. A
 * missing or non-numeric value renders an em dash rather than a stale number.
 */
export function formatBrightnessPercent(
  value: unknown,
  range?: { min?: number; max?: number },
): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  const min = range?.min ?? 0;
  const max = range?.max ?? 100;
  if (max <= min) return `${Math.round(value)}%`;
  const percent = Math.round(((value - min) / (max - min)) * 100);
  return `${Math.min(100, Math.max(0, percent))}%`;
}
