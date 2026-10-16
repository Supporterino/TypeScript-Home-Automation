/**
 * Wall tile scaling: the pure size-token → metrics mapping for the wall's own
 * non-device controls.
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
 * Interactive-control metrics for a size token: `wall` is the ported card system's
 * control height, the default the desktop scale.
 */
export function wallTileMetrics(size: WallTileSize = "default"): WallTileMetrics {
  if (size === "wall") {
    return { control: 42, controlSize: "lg", padding: "md" };
  }
  return { control: 32, controlSize: "sm", padding: "sm" };
}

/**
 * The font tier a wall readout presents its value on: the metric tier at a roomy
 * span, the band tier otherwise.
 */
export function wallReadoutFontSize(tier: WallWidgetTier): string {
  return tier === "roomy" ? WALL_METRIC_FONT_SIZE : WALL_BAND_FONT_SIZE;
}
