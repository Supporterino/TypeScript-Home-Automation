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
 * ## The re-derived row unit (design.md D2, D5)
 *
 * {@link ROW_UNIT_MIN} is derived from the smallest card the ported card system
 * produces rather than chosen: a minimum-span device cell is
 * {@link WALL_MIN_DEVICE_ROWS} rows, and the ported compact card's own budget is
 * {@link WALL_COMPACT_CARD_HEIGHT_PX}, read from the card module. The floor is the
 * row unit at which such a cell holds that card with nothing to spare — see the
 * derivation below — and it is what makes a minimum-span device card fit its cell
 * exactly while the whole wall renders at the ported card's own density.
 */
import {
  WALL_GRID_COLUMNS,
  type WallOrientation,
  type WallProfileConfig,
  type WallWidget,
} from "@ts-ha/shared";
import {
  WALL_CARD_COMPACT_HEIGHT_PX,
  WALL_CARD_CONTROL_ROW_MIN_WIDTH_PX,
} from "./cards/card-composition.js";

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
 * The row unit's ceiling, in CSS pixels (design.md D5; specs/wall-display "Wall
 * Glanceability"). Re-chosen for the ported card's density: the floor is derived
 * (a two-row device cell holds the smallest ported card with nothing to spare),
 * and the ceiling sits just above it so a two-row device cell is not inflated to
 * a block far taller than the card it holds — the "52–56" density design.md D5
 * leaves to the harness, settled at its top. It changes no requirement and no
 * task; `wall-grid.test.ts` asserts it stays above the floor and near it.
 */
export const ROW_UNIT_MAX = 56;

/**
 * The wall's minimum touch target, in CSS pixels — the floor every compact
 * control row meets, and therefore also a floor on the row unit (a row can never
 * be shorter than a control). It mirrors `WALL_MIN_TOUCH_TARGET` (the wall's own
 * declaration site) and the ported card's control height (design.md D2);
 * `wall-grid.test.ts` asserts the row unit holds it.
 */
const WALL_TOUCH_TARGET_PX = 42;

/**
 * The minimum rows a typed device cell occupies — every typed device widget's
 * minimum span height (`WALL_WIDGET_REGISTRY.light.min.h`), asserted by
 * `wall-grid.test.ts`. The row unit is derived from it, so it is unchanged by
 * the width axis below.
 */
export const WALL_MIN_DEVICE_ROWS = 2;

/**
 * The height, in CSS pixels, the smallest card the ported card system produces
 * needs at the wall's floors (design.md D2, D5; specs/wall-display "Wall
 * Glanceability" — "The row unit holds the smallest card"). It is the ported
 * card's *own* compact budget — its state item plus one control row — read from
 * the card module rather than restated, so the row unit is derived from the real
 * card and cannot drift from it. (design.md D5 quotes Mushroom's small light card
 * as ~110 px with the visible 36 px icon; the ported card's state row is the
 * 42 px icon affordance, so its declared budget is the value read here.)
 */
export const WALL_COMPACT_CARD_HEIGHT_PX = WALL_CARD_COMPACT_HEIGHT_PX;

/**
 * The row unit's floor, in CSS pixels (design.md D2, D5). Derived, not chosen — a
 * {@link WALL_MIN_DEVICE_ROWS}-row cell is
 * `WALL_MIN_DEVICE_ROWS · ROW_UNIT_MIN + one gutter` tall (the gutter is the
 * inter-row gap the grid reserves), and it must hold
 * {@link WALL_COMPACT_CARD_HEIGHT_PX} with nothing to spare:
 *
 * ```
 *  2 · ROW_UNIT_MIN + WALL_GUTTER_MIN_PX  =  WALL_COMPACT_CARD_HEIGHT_PX
 *  ⇒ 2 · ROW_UNIT_MIN + 16                =  116   (the ported card's budget)
 *  ⇒ ROW_UNIT_MIN                          =  50
 * ```
 *
 * The gutter floor (16 px) is the worst case, so a panel whose clamp resolves
 * above it has room to spare. The derivation is asserted in `wall-grid.test.ts`
 * against the ported card's real compact height, the gutter floor, and the typed
 * device widget's minimum span.
 */
export const ROW_UNIT_MIN = Math.max(
  (WALL_COMPACT_CARD_HEIGHT_PX - WALL_GUTTER_MIN_PX) / WALL_MIN_DEVICE_ROWS,
  WALL_TOUCH_TARGET_PX,
);

/**
 * The minimum columns a typed device widget occupies — derived, like the row
 * unit, from the widest card the ported card system produces: the fewest columns
 * whose cell, at the wall's floors, is at least the widest control row a card
 * draws at its minimum span ({@link WALL_CARD_CONTROL_ROW_MIN_WIDTH_PX} — the
 * cover's Open/Stop/Close transport, the widest bounded row the ported anatomy
 * produces). A `columns`-wide cell is `columns · unit + (columns − 1) · gutter`
 * wide at `unit` — the row geometry of `span.ts`'s `cardHeightPx` transposed —
 * and a wall column is never narrower than a row is tall, so the floor uses the
 * row unit's floor and the gutter's floor:
 *
 * ```
 *  WALL_MIN_DEVICE_COLUMNS · ROW_UNIT_MIN + (WALL_MIN_DEVICE_COLUMNS − 1) · WALL_GUTTER_MIN_PX
 *    ≥ WALL_CARD_CONTROL_ROW_MIN_WIDTH_PX
 *  ⇒ 3 · 50 + 2 · 16 = 182 ≥ 174
 * ```
 *
 * so a card at its type's minimum span never clips a control horizontally, on
 * either panel (specs/wall-display "A light card fits its minimum span", "A
 * card's content fits its span"). The width axis is never an input to the row
 * derivation above, so the row unit is unchanged; `wall-grid.test.ts` asserts the
 * derivation against the card's real row width and the typed device widget's
 * minimum span.
 */
export const WALL_MIN_DEVICE_COLUMNS = Math.max(
  1,
  Math.ceil(
    (WALL_CARD_CONTROL_ROW_MIN_WIDTH_PX + WALL_GUTTER_MIN_PX) / (ROW_UNIT_MIN + WALL_GUTTER_MIN_PX),
  ),
);

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
