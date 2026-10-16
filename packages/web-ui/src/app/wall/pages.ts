/**
 * Wall pagination: a paging widget packs minimum-span tiles across and down its
 * span, resolving pages through one pure layer.
 */

import { WALL_CARD_METRICS } from "./cards/metrics.js";
import {
  ROW_UNIT_MIN,
  WALL_GUTTER_MIN_PX,
  WALL_MIN_DEVICE_COLUMNS,
  WALL_MIN_DEVICE_ROWS,
} from "./grid.js";
import type { WallWidgetSpan } from "./registry.js";

/**
 * The columns one wall tile occupies — a typed device widget's minimum column
 * span.
 */
export const WALL_TILE_CELL_COLUMNS = WALL_MIN_DEVICE_COLUMNS;

/**
 * The rows one wall tile occupies — a typed device widget's minimum row span.
 */
export const WALL_TILE_CELL_ROWS = WALL_MIN_DEVICE_ROWS;

/**
 * The separation between two adjacent tiles, in CSS pixels.
 */
export const WALL_TILE_GAP_PX = 8;

/**
 * The most a paged tile row may be inflated beyond the tile's own cell. A
 * widget's leftover height is centred rather than distributed into its tiles.
 */
export const WALL_TILE_ROW_HEIGHT_CAP = 1.25;

/**
 * The surfaced control frame's content inset, in CSS pixels, per side — the
 * ported card surface's own padding, read from the card table.
 */
export const WALL_FRAME_INSET_PX = WALL_CARD_METRICS.padding;

/**
 * The wall's minimum touch target, in CSS pixels — the page-control row's height.
 */
const WALL_TOUCH_TARGET_PX = 42;

/**
 * The wall's minimum control gap, in CSS pixels, between the tiles and page-control row.
 */
export const WALL_CONTROL_GAP_PX = 8;

/**
 * The frame inset above and below a surfaced card, in CSS pixels — the ported
 * card surface's padding on each side.
 */
export const WALL_FRAME_RESERVED_PX = 2 * WALL_FRAME_INSET_PX;

/**
 * The page-control row and the gap above it, in CSS pixels. Reserved only when a
 * widget actually pages.
 */
export const WALL_PAGE_CONTROL_RESERVED_PX = WALL_TOUCH_TARGET_PX + WALL_CONTROL_GAP_PX;

/**
 * The rows the frame's opt-in title costs a paging widget's plan.
 */
export const WALL_FRAME_TITLE_ROWS = 1;

/**
 * The whole chrome a paging wall widget consumes inside its card: the frame inset,
 * a page-control row, and the control gap.
 */
export const WALL_PAGE_RESERVED_PX = WALL_FRAME_RESERVED_PX + WALL_PAGE_CONTROL_RESERVED_PX;

/** A paging wall widget's resolved pagination. */
export interface WallPagePlan {
  /** The tile grid's column count — how many tiles fit across the widget's span. */
  readonly tilesAcross: number;
  /** The tile grid's row count — how many tile rows the span holds at the row unit. */
  readonly tilesDown: number;
  /** How many tiles one page presents (`tilesAcross × tilesDown`). */
  readonly tilesPerPage: number;
  /** How many pages the content occupies; `0` for no content. */
  readonly pageCount: number;
  /**
   * The height each tile row gets, in CSS pixels, bounded against the tile's own
   * cell so no promised row clips a tile and none is inflated.
   */
  readonly rowHeightPx: number;
}

/** A paging widget's span, content size, and resolved panel geometry. */
export interface WallPagesInput {
  /** The widget's span, in grid cells. */
  readonly span: WallWidgetSpan;
  /** How many tiles the widget holds. */
  readonly count: number;
  /** The wall's resolved row unit, in CSS pixels. */
  readonly rowUnit: number;
  /** The wall gutter between cells, in CSS pixels; the wall's own drawn floor by default. */
  readonly gutterPx?: number;
  /**
   * Vertical space, in CSS pixels, the widget's own chrome consumes — reserved from
   * the span before tiles are packed.
   */
  readonly reservedPx?: number;
}

/**
 * Resolves the page plan for a paging widget: the tile grid it draws and how many
 * pages its content occupies.
 */
export function resolvePages(input: WallPagesInput): WallPagePlan {
  const unit = Math.max(input.rowUnit, ROW_UNIT_MIN);
  const gutterPx = input.gutterPx ?? WALL_GUTTER_MIN_PX;
  const across = tilesAcross(input.span.w);
  const extent = input.span.h * unit + Math.max(0, input.span.h - 1) * gutterPx;
  const available = Math.max(0, extent - (input.reservedPx ?? 0));
  const down = tilesDown(available, unit, gutterPx);
  const tilesPerPage = across * down;
  const cellPx = tileCellPx(unit, gutterPx);
  const rowHeightPx = (available - Math.max(0, down - 1) * WALL_TILE_GAP_PX) / down;

  return {
    tilesAcross: across,
    tilesDown: down,
    tilesPerPage,
    pageCount: input.count <= 0 ? 0 : Math.ceil(input.count / tilesPerPage),
    // The row is bounded against the tile's own cell; the pitch above is untouched.
    rowHeightPx: Math.max(cellPx, Math.min(rowHeightPx, WALL_TILE_ROW_HEIGHT_CAP * cellPx)),
  };
}

/** One rendered page of a paging wall widget. */
export interface WallPagedTiles<T> {
  /** The items this page draws, in the widget's own order. */
  readonly items: readonly T[];
  /** The clamped page index this page is (`0`-based). */
  readonly page: number;
  /** How many pages the whole set occupies; `0` for an empty set. */
  readonly pageCount: number;
  /** The tile grid's column count — how many tiles a page row holds. */
  readonly tilesAcross: number;
  /** The tile grid's row count for this page's tiles. */
  readonly rows: number;
  /** How many tiles one page presents. */
  readonly tilesPerPage: number;
  /**
   * The height each tile row gets, in CSS pixels — bounded against the tile's own
   * cell, so a page this plan reports never clips or inflates a tile.
   */
  readonly rowHeightPx: number;
}

/** The span, content, and chrome a widget pages through the shared layer. */
export interface WallPagedTilesInput<T> {
  /** The widget's tiles, in the order it presents them. */
  readonly items: readonly T[];
  /** The widget's span, in grid cells. */
  readonly span: WallWidgetSpan;
  /** The wall's resolved row unit, in CSS pixels. */
  readonly rowUnit: number;
  /** The requested page; clamped into range. */
  readonly page: number;
  /**
   * The grid rows the widget's own chrome consumes at the resolved row unit,
   * reserved in every plan.
   */
  readonly reservedRows?: number;
  /**
   * Whether the widget configures a title, so the plan reserves
   * {@link WALL_FRAME_TITLE_ROWS} for it.
   */
  readonly titled?: boolean;
  /** The wall gutter between cells, in CSS pixels; the wall's own drawn floor by default. */
  readonly gutterPx?: number;
}

/**
 * Resolves the page a widget draws through the wall's shared pagination layer: the
 * tile grid, the items it presents, and the page count.
 */
export function resolvePagedTiles<T>(input: WallPagedTilesInput<T>): WallPagedTiles<T> {
  const unit = Math.max(input.rowUnit, ROW_UNIT_MIN);
  // The chrome every plan reserves: the frame inset, its title, and the widget's header.
  const alwaysPx =
    WALL_FRAME_RESERVED_PX +
    (input.reservedRows ?? 0) * unit +
    (input.titled ? WALL_FRAME_TITLE_ROWS * unit : 0);
  const span: WallWidgetSpan = { w: input.span.w, h: input.span.h };
  const planFor = (reservedPx: number): WallPagePlan =>
    resolvePages({
      span,
      count: input.items.length,
      rowUnit: input.rowUnit,
      gutterPx: input.gutterPx,
      reservedPx,
    });

  const full = planFor(alwaysPx);
  const plan = full.pageCount > 1 ? planFor(alwaysPx + WALL_PAGE_CONTROL_RESERVED_PX) : full;

  const page = plan.pageCount <= 0 ? 0 : Math.min(Math.max(0, input.page), plan.pageCount - 1);
  const start = page * plan.tilesPerPage;
  const items = input.items.slice(start, start + plan.tilesPerPage);

  return {
    items,
    page,
    pageCount: plan.pageCount,
    tilesAcross: plan.tilesAcross,
    rows: Math.max(1, Math.ceil(items.length / plan.tilesAcross)),
    tilesPerPage: plan.tilesPerPage,
    rowHeightPx: plan.rowHeightPx,
  };
}

/**
 * How many minimum-span tiles fit across `columns` grid columns. At least one.
 */
function tilesAcross(columns: number): number {
  return Math.max(1, Math.floor(columns / WALL_TILE_CELL_COLUMNS));
}

/**
 * The tile's own cell height, in CSS pixels: its row span times the resolved row
 * unit, plus the gutter it spans.
 */
function tileCellPx(unit: number, gutterPx: number): number {
  return WALL_TILE_CELL_ROWS * unit + gutterPx;
}

/**
 * How many tile rows fit in `availablePx` at `unit`, keeping a tile gap between
 * adjacent tiles. At least one.
 */
function tilesDown(availablePx: number, unit: number, gutterPx: number): number {
  const pitch = tileCellPx(unit, gutterPx) + WALL_TILE_GAP_PX;
  return Math.max(1, Math.floor((availablePx + WALL_TILE_GAP_PX) / pitch));
}
