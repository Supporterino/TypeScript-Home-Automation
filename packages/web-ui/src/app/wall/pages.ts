/**
 * Wall pagination (wall-zones-and-fit D5, D12; specs/wall-display "Panel Fit",
 * "Device Grid Widget"). A wall widget whose own content can exceed the span it
 * was placed at never overflows or scrolls — the wall never scrolls — it pages:
 * the device grid, the favorites grid, and the room grid all resolve their pages
 * through this one pure layer, so the renderer and the editor's page-count report
 * cannot disagree. Dependency-free (no React, no DOM) so it stays reachable by
 * `bun test`.
 *
 * ## The tile model
 *
 * A wall tile is the shared wall device card at its minimum span:
 * {@link WALL_TILE_CELL_COLUMNS} grid columns wide and {@link WALL_TILE_CELL_ROWS}
 * grid rows tall — the cell {@link ROW_UNIT_MIN} is derived for, and a typed
 * device widget's own minimum span in the widget registry. A paging widget packs
 * such tiles across its cells, and down them at the panel's resolved row unit,
 * keeping {@link WALL_TILE_GAP_PX} between adjacent tiles:
 *
 * ```
 *  across     = max(1, floor(columns / WALL_TILE_CELL_COLUMNS))
 *  pitch      = WALL_TILE_CELL_ROWS · unit + WALL_TILE_GAP_PX
 *  available  = rows · unit + (rows − 1) · gutter − reserved
 *  down       = max(1, floor((available + WALL_TILE_GAP_PX) / pitch))
 * ```
 *
 * The pitch packs the tiles; the row each one is drawn in is then bounded against
 * its own cell — at least `WALL_TILE_CELL_ROWS · unit + gutter` and at most
 * {@link WALL_TILE_ROW_HEIGHT_CAP} times that — so a widget's leftover height is
 * left as panel and centred rather than distributed into its tiles
 * (specs/wall-display "Paged Tile Sizing"). The bound acts on the resolved height
 * alone, so the pitch, the rows packed, and the page count are all unchanged.
 *
 * The column count is taken from the grid's own cells, because the wall's columns
 * are equal: a tile spans {@link WALL_TILE_CELL_COLUMNS} of them, so a twelve-column
 * span presents four tiles across and never more than the panel's own columns can
 * hold — a tile is never narrower than the minimum-span tile this plan models.
 * (Counting in the row unit would over-count: on a landscape panel a column is
 * wider than a row is tall, so the count would promise more tiles across than
 * minimum-width tiles fit.)
 *
 * `reserved` is the vertical space the widget's own chrome consumes — the frame
 * inset, a page-control row, and whatever header the widget draws above its tiles
 * — so a widget that must show an affordance reserves it and the plan still fits
 * the card (wall-zones-and-fit D5; specs/wall-display "Panel Fit"). It is `0` by
 * default, so the bare span math is unchanged.
 *
 * The vertical axis takes a cell as no taller than the row unit plus the gutter —
 * an under-estimate, so a page the plan reports always fits the widget at the
 * wall's floors (specs/wall-display "A selection too large pages rather than
 * scrolls").
 *
 * ## One geometry for the plan and the draw
 *
 * The gutter defaults to its *floor*, exactly as `span.ts`'s card geometry does:
 * the wall draws `clamp(16px, 2vmin, 24px)`, so on any viewport whose `vmin` is
 * at or below 800 the drawn gutter is the floor. Modelling the floor makes both
 * halves agree on the smallest cell the wall can draw — a plan that assumed the
 * ceiling would promise a row the drawn cell cannot hold, which is precisely the
 * clip the tile-row guarantee exists to prevent.
 */
import {
  ROW_UNIT_MIN,
  WALL_GUTTER_MIN_PX,
  WALL_MIN_DEVICE_COLUMNS,
  WALL_MIN_DEVICE_ROWS,
} from "./grid.js";
import type { WallWidgetSpan } from "./registry.js";

/**
 * The columns one wall tile occupies — a typed device widget's minimum column
 * span (`wall/grid.ts`'s `WALL_MIN_DEVICE_COLUMNS`), asserted by
 * `wall-pages.test.ts` so the page math and the widget registry cannot drift. It
 * is what the tile packing divides the widget's columns by: a twelve-column span
 * presents four minimum-width tiles across, never more than the panel's own
 * columns can hold, so a tile is never narrower than the minimum-span tile this
 * plan models.
 */
export const WALL_TILE_CELL_COLUMNS = WALL_MIN_DEVICE_COLUMNS;

/**
 * The rows one wall tile occupies — a typed device widget's minimum row span
 * (`wall/grid.ts`'s `WALL_MIN_DEVICE_ROWS`), the axis the vertical cell bound is
 * derived from. It is what {@link tileCellPx} multiplies the row unit by, so the
 * derived cell is exactly the compact card's budget at the floors and the row
 * unit's own derivation is untouched.
 */
export const WALL_TILE_CELL_ROWS = WALL_MIN_DEVICE_ROWS;

/**
 * The separation between two adjacent tiles, in CSS pixels — the wall's control
 * gap (`WALL_MIN_CONTROL_GAP`), declared locally because this module stays free
 * of the widget registry and asserted against it by `wall-pages.test.ts`.
 */
export const WALL_TILE_GAP_PX = 8;

/**
 * The most a paged tile row may be inflated beyond the tile's own cell (design.md
 * D4; specs/wall-display "Paged Tile Sizing"). A widget's leftover height is left
 * as panel and centred rather than distributed into its tiles, so a tile renders
 * at a predictable size on every panel instead of at whatever height the widget's
 * leftover happens to provide. One constant, shared by every paging widget — the
 * device grid, a room's tiles, and the favorites grid all page through
 * {@link resolvePages} / {@link resolvePagedTiles}.
 */
export const WALL_TILE_ROW_HEIGHT_CAP = 1.25;

/**
 * The surfaced control frame's content inset, in CSS pixels, per side — Hearth's
 * `--hearth-space-4`, the token the frame pads a control card with. Declared
 * numerically so a page plan can reserve it; `wall-device-grid.test.ts` asserts it
 * against `wall/hearth.css`.
 */
export const WALL_FRAME_INSET_PX = 16;

/**
 * The wall's minimum touch target, in CSS pixels — the page-control row's height.
 * Declared locally (this module stays free of the widget registry, whose import
 * cycle would make a module-scope read a temporal-dead-zone error);
 * `wall-device-grid.test.ts` asserts it against `WALL_MIN_TOUCH_TARGET`.
 */
const WALL_TOUCH_TARGET_PX = 42;

/**
 * The wall's minimum control gap, in CSS pixels — the space between the tiles and
 * the page-control row. Declared locally for the same reason, and asserted
 * against `WALL_MIN_CONTROL_GAP` by `wall-device-grid.test.ts`.
 */
const WALL_CONTROL_GAP_PX = 8;

/**
 * The frame inset above and below a surfaced card, in CSS pixels — Hearth's
 * `--hearth-space-4` on each side. The frame always pads, so this is reserved in
 * *every* plan, whether the widget pages or not.
 */
export const WALL_FRAME_RESERVED_PX = 2 * WALL_FRAME_INSET_PX;

/**
 * The page-control row and the gap above it, in CSS pixels. Reserved only when a
 * widget actually pages, because a widget that fits one page draws no such row.
 */
export const WALL_PAGE_CONTROL_RESERVED_PX = WALL_TOUCH_TARGET_PX + WALL_CONTROL_GAP_PX;

/**
 * The rows the frame's opt-in title costs a paging widget's plan (wall-zones-and-fit
 * D3, D4; specs/wall-display "Span-Aware Card Presentation"). The frame draws a
 * configured title inside the same cell, above the renderer, so a titled widget's
 * tiles have one row less to pack into — the same allowance `span.ts`'s
 * `WALL_TITLE_ROWS` gives the minimum spans and the editor's height floor, and
 * `wall-paging.test.ts` asserts the two agree. Declared locally because this
 * module stays free of `span.ts`, whose import of this module's own inset would
 * make a module-scope read a temporal-dead-zone error.
 */
export const WALL_FRAME_TITLE_ROWS = 1;

/**
 * The whole chrome a paging wall widget consumes inside its card (design.md D5;
 * specs/wall-display "Panel Fit"): the frame inset above and below, one
 * page-control row at the wall's minimum touch target, and the control gap
 * separating that row from the tiles. A widget that pages reserves all of it, so
 * a page's tile rows always fit the card's inner height — the wall never scrolls.
 */
export const WALL_PAGE_RESERVED_PX = WALL_FRAME_RESERVED_PX + WALL_PAGE_CONTROL_RESERVED_PX;

/** A paging wall widget's resolved pagination (design.md D5, D12). */
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
   * The height each tile row gets, in CSS pixels. It is never shorter than the
   * tile's own cell (`WALL_TILE_CELL_ROWS · unit + gutter`, and at the floors that
   * cell is exactly the compact card's budget) and never taller than
   * {@link WALL_TILE_ROW_HEIGHT_CAP} times it, so no promised row can clip a tile
   * and no tile is inflated to fill the widget's leftover height — the widget
   * centres that space instead (specs/wall-display "Paged Tile Sizing").
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
   * Vertical space, in CSS pixels, the widget's own chrome consumes — reserved
   * from the span's height before tiles are packed. `0` (the default) reserves
   * nothing, which is the bare span math.
   */
  readonly reservedPx?: number;
}

/**
 * Resolves the page plan for a paging widget: the tile grid it draws and how many
 * pages its content occupies. Content that fits is one page; more pages, exactly
 * `ceil(count / tilesPerPage)` pages, so neither the renderer nor the editor has
 * to re-derive the count (design.md D7, D12).
 *
 * A row unit below the wall's floor — a panel not yet measured, where the grid
 * renders with a unit of `0` — is read as the floor, so the plan degrades to the
 * smallest cell the wall ever draws rather than dividing the span by an unknown
 * one.
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
    // The row is bounded against the tile's own cell: never inflated past
    // `WALL_TILE_ROW_HEIGHT_CAP` × it to fill the widget, and never shorter than
    // it, so a promised row still holds its tile ("Paged Tile Sizing"). Both
    // bounds act on the resolved height only — the pitch above is untouched, so
    // `tilesDown` and the page count are unchanged.
    rowHeightPx: Math.max(cellPx, Math.min(rowHeightPx, WALL_TILE_ROW_HEIGHT_CAP * cellPx)),
  };
}

/** One rendered page of a paging wall widget (design.md D5, D12). */
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
   * cell (at least it, at most {@link WALL_TILE_ROW_HEIGHT_CAP} times it), so a
   * page this plan reports never clips a tile and never inflates one (see
   * {@link WallPagePlan.rowHeightPx}).
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
   * The grid rows the widget's own chrome — whatever it draws above its tiles,
   * such as a header and a metric — consumes at the resolved row unit. It is
   * reserved in every plan, because that chrome is always drawn.
   */
  readonly reservedRows?: number;
  /**
   * Whether the widget configures a title. The frame draws it inside the same cell
   * above the renderer, so the plan reserves {@link WALL_FRAME_TITLE_ROWS} for it —
   * the allowance that keeps a titled card's tile rows at the compact budget
   * instead of squeezing them under it (wall-zones-and-fit D3, D4).
   */
  readonly titled?: boolean;
  /** The wall gutter between cells, in CSS pixels; the wall's own drawn floor by default. */
  readonly gutterPx?: number;
}

/**
 * Resolves the page a widget draws through the wall's shared pagination layer:
 * the tile grid that holds it, the items it presents, and how many pages the
 * whole set occupies.
 *
 * The plan is resolved twice at most. Both plans reserve the frame's own chrome —
 * its inset, its title when the widget configures one, and the widget's header,
 * because the frame always pads and the widget always draws its header; only the
 * page-control row is held back from the first plan, so content that fits one page
 * uses every cell without reserving room for a control that will not be drawn.
 * When the content pages, the plan is resolved again with
 * {@link WALL_PAGE_CONTROL_RESERVED_PX} added, because a paging widget draws that
 * row. A page is therefore never promised a tile row the card cannot show, in
 * either case.
 *
 * The requested page is clamped into range, so an edit that removes pages moves
 * an open wall back onto a real page rather than onto a blank one.
 */
export function resolvePagedTiles<T>(input: WallPagedTilesInput<T>): WallPagedTiles<T> {
  const unit = Math.max(input.rowUnit, ROW_UNIT_MIN);
  // The chrome every plan reserves: the frame's inset and its title when one is
  // configured, and whatever the widget always draws above its tiles.
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
 * How many minimum-span tiles fit across `columns` grid columns. The wall's
 * columns are equal, so a tile spanning {@link WALL_TILE_CELL_COLUMNS} of them fits
 * exactly `floor(columns / WALL_TILE_CELL_COLUMNS)` times — a twelve-column span
 * presents four tiles across, never more than the panel's own columns hold. At
 * least one, so a legal span always presents a page rather than an empty widget.
 */
function tilesAcross(columns: number): number {
  return Math.max(1, Math.floor(columns / WALL_TILE_CELL_COLUMNS));
}

/**
 * The tile's own cell height, in CSS pixels: its row span multiplied by the
 * resolved row unit, plus the gutter it spans. The pitch the page math packs tiles
 * by is this cell plus one {@link WALL_TILE_GAP_PX}, and
 * {@link WALL_TILE_ROW_HEIGHT_CAP} is a multiple of it, so the row the plan
 * promises, the box a tile is drawn in, and the row unit's own derivation are all
 * the same geometry (specs/wall-display "Paged Tile Sizing"). Only the row span
 * enters it, so the tile-packing column span does not disturb the vertical bound.
 */
function tileCellPx(unit: number, gutterPx: number): number {
  return WALL_TILE_CELL_ROWS * unit + gutterPx;
}

/**
 * How many tile rows fit in `availablePx` of the widget's height at `unit`,
 * keeping one {@link WALL_TILE_GAP_PX} between adjacent tiles. The pitch is the
 * tile's own cell — {@link tileCellPx}, the box the wall's row unit is derived to
 * hold a compact card in — plus that gap, so every row this promises is at least a
 * tile's cell tall and no promised row can clip a tile. At least one, so a legal
 * span always presents a page rather than an empty widget.
 */
function tilesDown(availablePx: number, unit: number, gutterPx: number): number {
  const pitch = tileCellPx(unit, gutterPx) + WALL_TILE_GAP_PX;
  return Math.max(1, Math.floor((availablePx + WALL_TILE_GAP_PX) / pitch));
}
