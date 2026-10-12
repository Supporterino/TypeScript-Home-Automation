/**
 * Pure grid placement for the wall (design.md D1, D4; specs/wall-display
 * "Widget Grid Layout", "Wall Glanceability"). Kept dependency-free (no React,
 * no DOM) so the orientation fallback rule, the row-unit resolution, and the
 * cell→CSS mapping are reachable by `bun test`.
 */
import {
  WALL_GRID_COLUMNS,
  type WallOrientation,
  type WallProfileConfig,
  type WallWidget,
} from "@ts-ha/shared";

/**
 * The floor and ceiling of the wall's row unit, in CSS pixels (design.md D1).
 * A bounded unit keeps a small profile from inflating to fill the panel while
 * still aligning every widget on a shared row rhythm.
 */
export const ROW_UNIT_MIN = 72;
export const ROW_UNIT_MAX = 112;

/**
 * The wall's single gutter and panel padding token (design.md D1). Used for
 * both the grid `gap` and its `padding`, so a widget is separated from its
 * neighbours and the panel edge by the same minimum.
 */
export const WALL_GUTTER = "clamp(16px, 2vmin, 24px)";

/** The gutter's floor, in CSS pixels — the minimum separation the clamp guarantees. */
export const WALL_GUTTER_MIN_PX = 16;

/** The gutter's ceiling, in CSS pixels. */
export const WALL_GUTTER_MAX_PX = 24;

/**
 * Sub-pixel tolerance for the fit comparison, in CSS pixels. `contentHeight`
 * and `usableHeight` are derived from a floating-point division, so a profile
 * that fits exactly can round to a hair over — e.g. 19 rows on a 1862px panel
 * computes `1814.0000000000002 > 1814`. The tolerance keeps a true fit centered
 * instead of degrading to start-aligned/scroll on that rounding.
 */
const FIT_TOLERANCE_PX = 1e-6;

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

/** The number of implicit grid rows a layout occupies — the largest `y + h` (design.md D1). */
export function occupiedRows(widgets: readonly WallWidget[]): number {
  let rows = 0;
  for (const widget of widgets) {
    rows = Math.max(rows, widget.y + widget.h);
  }
  return rows;
}

/**
 * Resolves the wall's row unit from the panel's *usable* content height:
 * the available height minus the panel padding (`2 * gutter`) and the
 * inter-row gaps (`(occupiedRows - 1) * gutter`), divided by the row count and
 * clamped to `[ROW_UNIT_MIN, ROW_UNIT_MAX]` (design.md D1). Reserving that
 * chrome is what keeps a profile that fits from being pushed past the panel by
 * its own padding and gaps. Bounding the unit is what stops a small profile
 * from stretching each card to the panel height; an empty profile resolves to
 * the ceiling.
 *
 * `gutterPx` defaults to `0` so the raw per-row average remains available to
 * callers that only want the clamp; wall layout passes the numeric gutter.
 */
export function resolveRowUnit(
  availableHeight: number,
  occupiedRows: number,
  gutterPx = 0,
): number {
  if (occupiedRows <= 0) return ROW_UNIT_MAX;
  const chrome = 2 * gutterPx + Math.max(0, occupiedRows - 1) * gutterPx;
  const unit = (availableHeight - chrome) / occupiedRows;
  return Math.min(ROW_UNIT_MAX, Math.max(ROW_UNIT_MIN, unit));
}

/** The resolved wall grid dimensions for one layout and panel height (design.md D1). */
export interface WallGridMetrics {
  /** The bounded height of one grid row, in CSS pixels. */
  rowUnit: number;
  /** The composition's total height, in CSS pixels. */
  contentHeight: number;
  /** The panel's content-box height — the height available after padding. */
  usableHeight: number;
  /** Whether the composition fits inside the panel without scrolling. */
  fits: boolean;
}

/**
 * Resolves a layout's row unit and whether it fits. The unit is derived from
 * the usable content height (padding and inter-row gaps reserved), so a valid
 * profile is centered when it fits and only degrades to scrolling when the
 * clamped unit still overflows (design.md D1). Pure so it is testable without a
 * DOM.
 */
export function wallGridMetrics(
  availableHeight: number,
  widgets: readonly WallWidget[],
  gutterPx = WALL_GUTTER_MAX_PX,
): WallGridMetrics {
  const rows = occupiedRows(widgets);
  const rowUnit = resolveRowUnit(availableHeight, rows, gutterPx);
  const contentHeight = rows * rowUnit + Math.max(0, rows - 1) * gutterPx;
  const usableHeight = availableHeight - 2 * gutterPx;
  return {
    rowUnit,
    contentHeight,
    usableHeight,
    fits: contentHeight <= usableHeight + FIT_TOLERANCE_PX,
  };
}

/** The dynamic CSS grid style `WallGrid` applies to its root element (design.md D1). */
export interface WallGridStyle {
  display: "grid";
  gridTemplateColumns: string;
  gridAutoRows: string;
  gap: string;
  alignContent: "center" | "start";
  width: string;
  height: string;
  padding: string;
  boxSizing: "border-box";
  overflowX: "hidden";
  /** `auto` only as a last resort, when a clamped profile cannot fit. */
  overflowY: "hidden" | "auto";
}

/**
 * Builds the wall's grid style: a fixed, bounded row unit derived from the
 * panel's usable height and the layout's occupied rows, a single gutter token
 * for both `gap` and `padding`, and vertical centering of the composition when
 * it fits (design.md D1). A profile whose clamped content height still exceeds
 * the panel degrades to `start` alignment with vertical scroll, so no row is
 * clipped and unreachable. Pure so the sizing rule is testable without a DOM.
 */
export function wallGridStyle(input: {
  widgets: readonly WallWidget[];
  availableHeight: number;
  gutterPx?: number;
}): WallGridStyle {
  const gutterPx = input.gutterPx ?? WALL_GUTTER_MAX_PX;
  const { rowUnit, fits } = wallGridMetrics(input.availableHeight, input.widgets, gutterPx);
  return {
    display: "grid",
    gridTemplateColumns: `repeat(${WALL_GRID_COLUMNS}, minmax(0, 1fr))`,
    gridAutoRows: `${rowUnit}px`,
    gap: WALL_GUTTER,
    alignContent: fits ? "center" : "start",
    width: "100vw",
    height: "100dvh",
    padding: WALL_GUTTER,
    boxSizing: "border-box",
    overflowX: "hidden",
    overflowY: fits ? "hidden" : "auto",
  };
}
