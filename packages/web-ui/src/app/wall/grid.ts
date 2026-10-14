/**
 * Pure grid placement and panel-fit resolution for the wall (wall-zones-and-fit
 * D5, D10; specs/wall-display "Widget Grid Layout", "Wall Glanceability",
 * "Panel Fit"). Kept dependency-free (no React, no DOM) so the orientation
 * fallback rule, the row-unit resolution, the fit outcome, and the cell→CSS
 * mapping are reachable by `bun test`.
 *
 * ## The fit resolver (specs/wall-display "Panel Fit")
 *
 * "Panel Fit" makes never-scrolling normative: the wall MUST NOT scroll, an
 * authored composition that cannot fit the panel at the floors MUST render a
 * contained explanation, and a widget whose own content cannot fit its span
 * MUST page rather than overflow. {@link wallGridMetrics} therefore resolves an
 * explicit {@link WallFitOutcome} — `fits` or `tooLarge` — and
 * {@link wallGridStyle} sets `overflowY: "hidden"` in *every* outcome. The
 * former `auto` (scroll) branch is gone: an unfittable authored composition is
 * explained by the wall rather than degraded to a scroll, and a widget that
 * holds more content than its span can present pages its content instead
 * (the device grid — see `wall/pages.ts`).
 *
 * ## The re-derived row unit (wall-zones-and-fit D4, D10)
 *
 * {@link ROW_UNIT_MIN} is derived from the compact wall light card rather than
 * chosen: a minimum-span `device` cell is {@link WALL_MIN_DEVICE_ROWS} rows, and
 * the compact card (specs/wall-display "A light card fits its minimum span") is
 * {@link WALL_COMPACT_CARD_HEIGHT_PX} px of content and surface padding. The
 * floor is the row unit at which such a cell holds that card with nothing to
 * spare — see the derivation below — and, with {@link ROW_UNIT_MAX} reduced to
 * the same D10 scale, it is what makes a wall card render ~25–30 % smaller on
 * the panel without crossing the wall's 56 px touch target or its 18 px body
 * floor.
 */
import {
  WALL_GRID_COLUMNS,
  type WallOrientation,
  type WallProfileConfig,
  type WallWidget,
} from "@ts-ha/shared";

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
 * The row unit's ceiling, in CSS pixels (wall-zones-and-fit D10). Lowered from
 * 112 px to the reduced component scale, so a short composition renders as a
 * dense, glanceable set of cards rather than a handful of very large blocks.
 */
export const ROW_UNIT_MAX = 80;

/**
 * The wall's minimum touch target, in CSS pixels — the floor every compact
 * control row meets. Declared locally because this module must stay free of the
 * widget registry (which reaches React and the renderers); `wall-grid.test.ts`
 * asserts it agrees with `WALL_MIN_TOUCH_TARGET`, so the two cannot drift.
 */
const WALL_TOUCH_TARGET_PX = 56;

/**
 * The wall's minimum space between two adjacent interactive controls, in CSS
 * pixels. Declared locally for the same reason as {@link WALL_TOUCH_TARGET_PX}
 * and asserted against `WALL_MIN_CONTROL_GAP` by `wall-grid.test.ts`.
 */
const WALL_CONTROL_GAP_PX = 8;

/** The compact light card's stacked control rows: the on/off affordance and the compact value-control row. */
const WALL_COMPACT_CARD_ROWS = 2;

/**
 * The minimum rows a `device` cell occupies — the wall device card's minimum
 * span (`WALL_WIDGET_REGISTRY.device.min`), asserted by `wall-grid.test.ts`.
 */
export const WALL_MIN_DEVICE_ROWS = 2;

/**
 * The height, in CSS pixels, the compact wall light card needs at the wall's
 * floors (wall-zones-and-fit D4; specs/wall-display "A light card fits its
 * minimum span"): {@link WALL_COMPACT_CARD_ROWS} touch-target rows plus the
 * card's surface padding of one control gap top and bottom.
 */
export const WALL_COMPACT_CARD_HEIGHT_PX =
  WALL_COMPACT_CARD_ROWS * WALL_TOUCH_TARGET_PX + 2 * WALL_CONTROL_GAP_PX;

/**
 * The row unit's floor, in CSS pixels (wall-zones-and-fit D4, D10). Derived, not
 * chosen — a {@link WALL_MIN_DEVICE_ROWS}-row cell is
 * `WALL_MIN_DEVICE_ROWS · ROW_UNIT_MIN + one gutter` tall (the gutter is the
 * inter-row gap the grid reserves), and it must hold
 * {@link WALL_COMPACT_CARD_HEIGHT_PX}:
 *
 * ```
 *  2 · ROW_UNIT_MIN + WALL_GUTTER_MIN_PX  ≥  WALL_COMPACT_CARD_HEIGHT_PX
 *  ⇒ 2 · ROW_UNIT_MIN + 16                ≥  128
 *  ⇒ ROW_UNIT_MIN                          =  56
 * ```
 *
 * The gutter floor (16 px) is the worst case, so a panel whose clamp resolves
 * above it has room to spare. The derivation is asserted in `wall-grid.test.ts`
 * against the wall's real touch target, control gap, and device minimum span.
 */
export const ROW_UNIT_MIN =
  (WALL_COMPACT_CARD_HEIGHT_PX - WALL_GUTTER_MIN_PX) / WALL_MIN_DEVICE_ROWS;

/**
 * Sub-pixel tolerance for the fit comparison, in CSS pixels. `contentHeight`
 * and `usableHeight` are derived from a floating-point division, so a profile
 * that fits exactly can round to a hair over — e.g. 19 rows on a 1862px panel
 * computes `1814.0000000000002 > 1814`. The tolerance keeps a true fit centered
 * instead of reporting the too-large outcome on that rounding.
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
 * Maps a zero-based cell placement `{x, y, w, h}` to CSS grid line values. CSS
 * grid lines are one-based, so `x`/`y` are offset by one; `w`/`h` become
 * `span` lengths. Any cell-placed box is accepted — a widget, or a zone band's
 * bounding box (wall-zones-and-fit D2) — so the cell→line mapping stays single
 * sourced for both layers.
 */
export function gridPlacementStyle(placement: { x: number; y: number; w: number; h: number }): {
  gridColumn: string;
  gridRow: string;
} {
  return {
    gridColumn: `${placement.x + 1} / span ${placement.w}`,
    gridRow: `${placement.y + 1} / span ${placement.h}`,
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

/**
 * The wall's fit verdict for one layout and panel (wall-zones-and-fit D5;
 * specs/wall-display "Panel Fit"). `tooLarge` is the explicit outcome an
 * authored composition that cannot fit the panel at the wall's floors resolves
 * to — the wall renders a contained explanation for it rather than scrolling.
 */
export type WallFitOutcome = "fits" | "tooLarge";

/** The resolved wall grid dimensions for one layout and panel height (design.md D1, D5). */
export interface WallGridMetrics {
  /** The bounded height of one grid row, in CSS pixels. */
  rowUnit: number;
  /** The composition's total height, in CSS pixels. */
  contentHeight: number;
  /** The panel's content-box height — the height available after padding. */
  usableHeight: number;
  /** The explicit fit verdict (design.md D5; specs/wall-display "Panel Fit"). */
  outcome: WallFitOutcome;
  /** The boolean form of {@link outcome}, for the centering rule. */
  fits: boolean;
}

/**
 * Resolves a layout's row unit and whether it fits. The unit is derived from
 * the usable content height (padding and inter-row gaps reserved), so a valid
 * profile is centered when it fits and a composition that still cannot fit at
 * the clamped floor resolves to `tooLarge` rather than to a scroll (design.md
 * D5; specs/wall-display "Panel Fit"). Pure so it is testable without a DOM.
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
  const fits = contentHeight <= usableHeight + FIT_TOLERANCE_PX;
  return {
    rowUnit,
    contentHeight,
    usableHeight,
    outcome: fits ? "fits" : "tooLarge",
    fits,
  };
}

/** The dynamic CSS grid style `WallGrid` applies to its root element (design.md D1, D5). */
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
  /** Always `hidden` — the wall never scrolls (design.md D5; specs/wall-display "Panel Fit"). */
  overflowY: "hidden";
}

/**
 * Builds the wall's grid style: a fixed, bounded row unit derived from the
 * panel's usable height and the layout's occupied rows, a single gutter token
 * for both `gap` and `padding`, and vertical centering of the composition when
 * it fits (design.md D1). `overflowY` is `hidden` in every outcome, because the
 * wall never scrolls: a composition that cannot fit is explained by the wall
 * instead of being made scrollable (design.md D5; specs/wall-display "Panel
 * Fit"). Pure so the sizing rule is testable without a DOM.
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
    overflowY: "hidden",
  };
}
