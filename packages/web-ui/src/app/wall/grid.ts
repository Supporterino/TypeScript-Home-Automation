/**
 * Pure grid placement and panel-fit resolution for the wall: the re-derived row
 * unit, the fit outcome, and the cell→CSS mapping.
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
 * The wall's single gutter and panel padding token, used for both the grid `gap`
 * and its `padding`.
 */
export const WALL_GUTTER = "clamp(16px, 2vmin, 24px)";

/** The gutter's floor, in CSS pixels — the minimum separation the clamp guarantees. */
export const WALL_GUTTER_MIN_PX = 16;

/** The gutter's ceiling, in CSS pixels. */
export const WALL_GUTTER_MAX_PX = 24;

/**
 * The row unit's ceiling, in CSS pixels — just above the derived floor so a
 * two-row device cell is not inflated far past the card it holds.
 */
export const ROW_UNIT_MAX = 56;

/** The wall's minimum touch target, in CSS pixels — also a floor on the row unit. */
const WALL_TOUCH_TARGET_PX = 42;

/** The minimum grid rows a typed device cell occupies, from which the row unit is derived. */
export const WALL_MIN_DEVICE_ROWS = 2;

/**
 * The height, in CSS pixels, the ported card system's smallest card needs at the
 * wall's floors — its own compact budget, read from the card module.
 */
export const WALL_COMPACT_CARD_HEIGHT_PX = WALL_CARD_COMPACT_HEIGHT_PX;

/**
 * The row unit's floor, in CSS pixels — derived so a minimum-row device cell
 * holds the smallest ported card, never below the wall's touch target.
 */
export const ROW_UNIT_MIN = Math.max(
  (WALL_COMPACT_CARD_HEIGHT_PX - WALL_GUTTER_MIN_PX) / WALL_MIN_DEVICE_ROWS,
  WALL_TOUCH_TARGET_PX,
);

/**
 * The minimum grid columns a typed device widget occupies — derived so the widest
 * card control row never clips at the wall's floors.
 */
export const WALL_MIN_DEVICE_COLUMNS = Math.max(
  1,
  Math.ceil(
    (WALL_CARD_CONTROL_ROW_MIN_WIDTH_PX + WALL_GUTTER_MIN_PX) / (ROW_UNIT_MIN + WALL_GUTTER_MIN_PX),
  ),
);

/**
 * Sub-pixel tolerance for the fit comparison, so a profile that fits exactly does
 * not round over and report the too-large outcome.
 */
const FIT_TOLERANCE_PX = 1e-6;

/**
 * Resolves the widget list to render for an orientation: an override replaces the
 * base layout entirely.
 */
export function resolveLayout(
  config: WallProfileConfig,
  orientation: WallOrientation,
): readonly WallWidget[] {
  return config.orientations?.[orientation] ?? config.widgets;
}

/**
 * Maps a zero-based cell placement `{x, y, w, h}` to one-based CSS grid line
 * values.
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

/** The number of implicit grid rows a layout occupies — the largest `y + h`. */
export function occupiedRows(widgets: readonly WallWidget[]): number {
  let rows = 0;
  for (const widget of widgets) {
    rows = Math.max(rows, widget.y + widget.h);
  }
  return rows;
}

/**
 * Resolves the wall's row unit from the panel's usable content height, clamped to
 * `[ROW_UNIT_MIN, ROW_UNIT_MAX]`.
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
 * The wall's fit verdict for one layout and panel: `tooLarge` is the explicit
 * outcome of a composition that cannot fit the wall's floors.
 */
export type WallFitOutcome = "fits" | "tooLarge";

/** The resolved wall grid dimensions for one layout and panel height. */
export interface WallGridMetrics {
  /** The bounded height of one grid row, in CSS pixels. */
  rowUnit: number;
  /** The composition's total height, in CSS pixels. */
  contentHeight: number;
  /** The panel's content-box height — the height available after padding. */
  usableHeight: number;
  /** The explicit fit verdict. */
  outcome: WallFitOutcome;
  /** The boolean form of {@link outcome}, for the centering rule. */
  fits: boolean;
}

/**
 * Resolves a layout's row unit and whether it fits the panel, reserving padding
 * and inter-row gaps.
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

/** The dynamic CSS grid style `WallGrid` applies to its root element. */
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
  /** Always `hidden` — the wall never scrolls. */
  overflowY: "hidden";
}

/**
 * Builds the wall's grid style: a bounded row unit, a single gutter for `gap` and
 * `padding`, and vertical centering when the composition fits.
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
