/**
 * Pure grid placement for the wall (design.md D4; specs/wall-display "Widget
 * Grid Layout"). Kept dependency-free (no React, no DOM) so the orientation
 * fallback rule and the cell→CSS mapping are reachable by `bun test`.
 */
import type { WallOrientation, WallProfileConfig, WallWidget } from "@ts-ha/shared";

/**
 * Resolves the widget list to render for an orientation. An orientation
 * override replaces the base layout entirely; without one the base `widgets`
 * are used, so a profile reflows between portrait and landscape without a
 * second profile (design.md D4).
 */
export function resolveLayout(
  config: WallProfileConfig,
  orientation: WallOrientation,
): readonly WallWidget[] {
  return config.orientations?.[orientation] ?? config.widgets;
}

/**
 * Maps a widget's zero-based `{x, y, w, h}` placement to CSS grid line values.
 * CSS grid lines are one-based, so `x`/`y` are offset by one; `w`/`h` become
 * `span` lengths.
 */
export function gridPlacementStyle(widget: WallWidget): {
  gridColumn: string;
  gridRow: string;
} {
  return {
    gridColumn: `${widget.x + 1} / span ${widget.w}`,
    gridRow: `${widget.y + 1} / span ${widget.h}`,
  };
}
