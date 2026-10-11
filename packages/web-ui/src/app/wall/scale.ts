/**
 * Wall tile scaling (design.md D7; specs/wall-display "Touch Operation").
 *
 * A wall presents exactly the device tile every other collection uses — there
 * is no second device presentation — only larger, so its interactive controls
 * meet the wall's minimum touch target. This module owns the pure size-token →
 * metrics mapping, keeping the interactive-control dimension a single,
 * testable value rather than a literal scattered across the tile.
 *
 * Deliberately dependency-free: the shared {@link DeviceTile} imports this on
 * first paint, so it must never reach the lazy wall registry or widgets.
 */

/** A wall tile's size token. The default preserves the tile's ordinary rendering exactly. */
export type WallTileSize = "default" | "wall";

export interface WallTileMetrics {
  /** Minimum interactive-control side, in CSS pixels. */
  control: number;
  /** Mantine size token for the tile's embedded form controls. */
  controlSize: "sm" | "md" | "lg";
  /** Mantine padding token for the tile's paper. */
  padding: "sm" | "md";
}

/**
 * Interactive-control metrics for a size token. The `wall` token enlarges the
 * control to meet {@link WALL_MIN_TOUCH_TARGET}; the default reproduces the
 * tile's existing desktop scale.
 */
export function wallTileMetrics(size: WallTileSize = "default"): WallTileMetrics {
  if (size === "wall") {
    return { control: 48, controlSize: "lg", padding: "md" };
  }
  return { control: 32, controlSize: "sm", padding: "sm" };
}
