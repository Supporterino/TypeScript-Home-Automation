/**
 * Wall tile scaling (design.md D2, D7; specs/wall-display "Touch Operation",
 * "Span-Aware Card Presentation", "Wall Glanceability").
 *
 * The wall's own non-device controls (its page controls, a room's batch command,
 * a scene and a link affordance) are drawn at the wall's minimum touch target,
 * which is the ported card system's own control height. This module owns the pure
 * size-token → metrics mapping, keeping the interactive-control dimension a
 * single, testable value rather than a literal scattered across the wall.
 *
 * Deliberately dependency-free: the wall's card vocabulary imports this, so it
 * must never reach the widget registry or the renderers. The device tile this
 * module once scaled has retired to the ported cards under `wall/cards/`
 * (design.md D1, D10), so only the wall's own affordance size and the readout
 * tier remain in use.
 */
import type { WallWidgetTier } from "./span.js";
import { WALL_BAND_FONT_SIZE, WALL_METRIC_FONT_SIZE } from "./type-ramp.js";

/** A wall tile's size token. The default preserves the tile's ordinary rendering exactly. */
export type WallTileSize = "default" | "wall";

export interface WallTileMetrics {
  /** Minimum interactive-control side, in CSS pixels. */
  control: number;
  /** Size token for the tile's embedded form controls. */
  controlSize: "sm" | "md" | "lg";
  /** Padding token for the tile's surface. */
  padding: "sm" | "md";
}

/**
 * Interactive-control metrics for a size token. The `wall` token is the ported
 * card system's own control height (design.md D2); the default reproduces the
 * tile's existing desktop scale.
 */
export function wallTileMetrics(size: WallTileSize = "default"): WallTileMetrics {
  if (size === "wall") {
    return { control: 42, controlSize: "lg", padding: "md" };
  }
  return { control: 32, controlSize: "sm", padding: "sm" };
}

/**
 * The tier a wall readout presents its value on, chosen by the span the readout
 * was placed at (design.md D3, D6; specs/wall-display "Span-Aware Card
 * Presentation", "Wall Glanceability"). A readout at or near its type's minimum
 * span — the grouped readouts of a climate band, or the same readout on a small
 * card — renders on the band tier, below the metric tier, so a group of readouts
 * does not compete with a card's hero and its value and unit stay on one line in
 * a narrow cell. A readout with a genuinely large span grows onto the metric
 * tier rather than repeating the composition its minimum span draws.
 */
export function wallReadoutFontSize(tier: WallWidgetTier): string {
  return tier === "roomy" ? WALL_METRIC_FONT_SIZE : WALL_BAND_FONT_SIZE;
}
