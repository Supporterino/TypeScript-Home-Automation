import { describe, expect, it } from "bun:test";
import { WALL_CARD_METRICS } from "../src/app/wall/cards/metrics.js";
import {
  ROW_UNIT_MAX,
  ROW_UNIT_MIN,
  WALL_COMPACT_CARD_HEIGHT_PX,
  WALL_GUTTER_MAX_PX,
  WALL_GUTTER_MIN_PX,
} from "../src/app/wall/grid.js";
import {
  resolvePagedTiles,
  resolvePages,
  WALL_FRAME_INSET_PX,
  WALL_FRAME_RESERVED_PX,
  WALL_PAGE_RESERVED_PX,
  WALL_TILE_CELL_COLUMNS,
  WALL_TILE_CELL_ROWS,
  WALL_TILE_GAP_PX,
  WALL_TILE_ROW_HEIGHT_CAP,
} from "../src/app/wall/pages.js";
import {
  WALL_MIN_CONTROL_GAP,
  WALL_MIN_TOUCH_TARGET,
  WALL_WIDGET_REGISTRY,
} from "../src/app/wall/registry.js";

// Pure pagination — no DOM. The device grid pages a selection its span cannot present
// instead of overflowing or scrolling, so the wall never scrolls.

describe("the frame inset follows the ported card padding", () => {
  it("derives the inset and both reservations from the ported card's own padding", () => {
    // One number, read from the card table rather than restated: the frame's inset *is* the
    // ported card surface's padding.
    expect(WALL_FRAME_INSET_PX).toBe(WALL_CARD_METRICS.padding);
    expect(WALL_FRAME_RESERVED_PX).toBe(2 * WALL_CARD_METRICS.padding);
    expect(WALL_PAGE_RESERVED_PX).toBe(
      WALL_FRAME_RESERVED_PX + WALL_MIN_TOUCH_TARGET + WALL_MIN_CONTROL_GAP,
    );
  });
});

describe("resolvePages", () => {
  it("presents a selection that fits its span as one page", () => {
    // A 6×4 span at the floor holds two tile columns × two tile rows = four tiles.
    const span = { w: 6, h: 4 };
    const { tilesPerPage } = resolvePages({ span, count: 1, rowUnit: ROW_UNIT_MIN });
    const plan = resolvePages({ span, count: tilesPerPage, rowUnit: ROW_UNIT_MIN });

    expect(tilesPerPage).toBe(4);
    expect(plan.pageCount).toBe(1);
  });

  it("pages a selection larger than its span", () => {
    const plan = resolvePages({ span: { w: 6, h: 4 }, count: 13, rowUnit: ROW_UNIT_MIN });

    expect(plan.tilesPerPage).toBe(4);
    expect(plan.pageCount).toBe(4);
  });

  it("reports the exact page count for a selection spanning several pages", () => {
    const span = { w: 6, h: 4 };
    const { tilesPerPage } = resolvePages({ span, count: 1, rowUnit: ROW_UNIT_MIN });

    for (const count of [
      1,
      tilesPerPage,
      tilesPerPage + 1,
      tilesPerPage * 3,
      tilesPerPage * 3 - 1,
    ]) {
      const plan = resolvePages({ span, count, rowUnit: ROW_UNIT_MIN });
      expect(plan.pageCount, `${count} devices`).toBe(Math.ceil(count / plan.tilesPerPage));
    }
  });

  it("presents at least one tile for a device type's minimum span", () => {
    const { min } = WALL_WIDGET_REGISTRY.light;
    const plan = resolvePages({ span: min, count: 4, rowUnit: ROW_UNIT_MIN });

    expect(plan.tilesAcross).toBeGreaterThanOrEqual(1);
    expect(plan.tilesDown).toBeGreaterThanOrEqual(1);
    expect(plan.tilesPerPage).toBeGreaterThanOrEqual(1);
    expect(plan.pageCount).toBeGreaterThanOrEqual(1);
  });

  it("holds one tile per tile span across the row-unit range", () => {
    // The tile's cell span is independent of the row unit, so a 6×4 span holds
    // the same tile grid at the wall's floor and its ceiling.
    const atFloor = resolvePages({ span: { w: 6, h: 4 }, count: 6, rowUnit: ROW_UNIT_MIN });
    const atCeiling = resolvePages({ span: { w: 6, h: 4 }, count: 6, rowUnit: ROW_UNIT_MAX });

    expect(atFloor.tilesAcross).toBe(atCeiling.tilesAcross);
    expect(atFloor.tilesDown).toBe(atCeiling.tilesDown);
  });

  it("widens the tile grid as the span grows", () => {
    const small = resolvePages({ span: { w: 4, h: 4 }, count: 100, rowUnit: ROW_UNIT_MIN });
    const large = resolvePages({ span: { w: 12, h: 8 }, count: 100, rowUnit: ROW_UNIT_MIN });

    expect(large.tilesPerPage).toBeGreaterThan(small.tilesPerPage);
  });

  it("reports no page for an empty selection", () => {
    expect(resolvePages({ span: { w: 6, h: 4 }, count: 0, rowUnit: ROW_UNIT_MIN }).pageCount).toBe(
      0,
    );
  });

  it("reads a row unit below the wall's floor as the floor", () => {
    // Before the panel is measured the grid renders with a unit of 0; the plan
    // must not divide the span by an unknown cell.
    const unmeasured = resolvePages({ span: { w: 6, h: 4 }, count: 6, rowUnit: 0 });
    const atFloor = resolvePages({ span: { w: 6, h: 4 }, count: 6, rowUnit: ROW_UNIT_MIN });

    expect(unmeasured).toEqual(atFloor);
  });
});

// The paged tile row's bound. A tile row is sized from the tile's own cell and bounded
// against inflation, so a paged tile renders at a predictable size on every panel.

/** The harness stage's geometry: a 1920×1080 panel resolves the row unit's ceiling and a 21.6 px gutter. */
const HARNESS_ROW_UNIT = ROW_UNIT_MAX;
const HARNESS_GUTTER_PX = 21.6;
const HARNESS_TILE_CELL_PX = WALL_TILE_CELL_ROWS * HARNESS_ROW_UNIT + HARNESS_GUTTER_PX;

describe("the paged tile row's bound", () => {
  it("caps a tile row at 1.25× the tile's cell, and never below it", () => {
    // The capture's geometry: a 4×6 room card on the harness panel leaves one tile row the
    // whole leftover height, 316 px against the tile's own 181.6 px cell (1.74×).
    const reservedPx = WALL_FRAME_RESERVED_PX + 3 * HARNESS_ROW_UNIT;
    const plan = resolvePages({
      span: { w: 4, h: 6 },
      count: 4,
      rowUnit: HARNESS_ROW_UNIT,
      gutterPx: HARNESS_GUTTER_PX,
      reservedPx,
    });
    const available = 6 * HARNESS_ROW_UNIT + 5 * HARNESS_GUTTER_PX - reservedPx;

    expect(plan.tilesDown).toBe(1);
    expect(plan.rowHeightPx).toBe(WALL_TILE_ROW_HEIGHT_CAP * HARNESS_TILE_CELL_PX);
    expect(plan.rowHeightPx).toBeLessThan(available);
    expect(plan.rowHeightPx).toBeGreaterThanOrEqual(HARNESS_TILE_CELL_PX);
  });

  it("leaves a row already inside the bound at the height the plan resolved", () => {
    // The same panel without the room's chrome packs three tile rows, each below
    // the bound, so the plan's own height stands and the tile keeps its cell.
    const plan = resolvePages({
      span: { w: 4, h: 6 },
      count: 6,
      rowUnit: HARNESS_ROW_UNIT,
      gutterPx: HARNESS_GUTTER_PX,
    });
    const available = 6 * HARNESS_ROW_UNIT + 5 * HARNESS_GUTTER_PX;

    expect(plan.tilesDown).toBe(3);
    expect(plan.rowHeightPx).toBeLessThan(WALL_TILE_ROW_HEIGHT_CAP * HARNESS_TILE_CELL_PX);
    expect(plan.rowHeightPx).toBe((available - 2 * WALL_TILE_GAP_PX) / 3);
    expect(plan.rowHeightPx).toBeGreaterThanOrEqual(HARNESS_TILE_CELL_PX);
  });

  it("never lets a row fall below the tile's cell nor rise past the cap, at any geometry", () => {
    for (const rowUnit of [ROW_UNIT_MIN, ROW_UNIT_MAX]) {
      for (const gutterPx of [WALL_GUTTER_MIN_PX, HARNESS_GUTTER_PX, WALL_GUTTER_MAX_PX]) {
        const unit = Math.max(rowUnit, ROW_UNIT_MIN);
        const cellPx = WALL_TILE_CELL_ROWS * unit + gutterPx;
        for (const rows of [1, 2, 3, 4, 6, 12]) {
          for (const reservedRows of [0, 1, 3, 6]) {
            const plan = resolvePages({
              span: { w: 6, h: rows },
              count: 40,
              rowUnit,
              gutterPx,
              reservedPx: reservedRows * unit,
            });
            const where = `${rows} rows @ ${rowUnit}px, gutter ${gutterPx}px, ${reservedRows} reserved`;

            expect(plan.rowHeightPx, where).toBeGreaterThanOrEqual(cellPx);
            expect(plan.rowHeightPx, where).toBeLessThanOrEqual(WALL_TILE_ROW_HEIGHT_CAP * cellPx);
          }
        }
      }
    }
  });

  it("leaves tilesDown and the page count exactly as the pitch resolves them", () => {
    // The bound acts on the resolved height alone: the pitch the rows are packed by is
    // untouched, so the page a plan reports is the page it always was.
    const reservedRows = 3;
    const pitch = WALL_TILE_CELL_ROWS * HARNESS_ROW_UNIT + HARNESS_GUTTER_PX + WALL_TILE_GAP_PX;
    const alwaysPx = WALL_FRAME_RESERVED_PX + reservedRows * HARNESS_ROW_UNIT;
    const extent = 6 * HARNESS_ROW_UNIT + 5 * HARNESS_GUTTER_PX;
    // The plan pages, so the page-control row is held back from the tile rows.
    const reservedPx = alwaysPx + WALL_PAGE_RESERVED_PX;
    const available = extent - reservedPx;
    const expectedDown = Math.max(1, Math.floor((available + WALL_TILE_GAP_PX) / pitch));

    const plan = resolvePages({
      span: { w: 4, h: 6 },
      count: 5,
      rowUnit: HARNESS_ROW_UNIT,
      gutterPx: HARNESS_GUTTER_PX,
      reservedPx,
    });

    expect(plan.tilesDown).toBe(expectedDown);
    expect(plan.tilesAcross).toBe(1);
    expect(plan.tilesPerPage).toBe(plan.tilesAcross * expectedDown);
    expect(plan.pageCount).toBe(Math.ceil(5 / plan.tilesPerPage));

    // The shared paged plan agrees: the same tile a page, the same five pages,
    // and the same capped row.
    const paged = resolvePagedTiles({
      items: Array.from({ length: 5 }, (_, index) => `device.${index}`),
      span: { w: 4, h: 6 },
      rowUnit: HARNESS_ROW_UNIT,
      gutterPx: HARNESS_GUTTER_PX,
      page: 0,
      reservedRows,
    });

    expect(paged.pageCount).toBe(5);
    expect(paged.tilesAcross).toBe(1);
    expect(paged.tilesPerPage).toBe(1);
    expect(paged.rows).toBe(1);
    expect(paged.rowHeightPx).toBe(WALL_TILE_ROW_HEIGHT_CAP * HARNESS_TILE_CELL_PX);
  });
});

describe("the device tile's model", () => {
  it("takes the tile's cell span from a device type's minimum span", () => {
    const { min } = WALL_WIDGET_REGISTRY.light;

    expect(min.w).toBe(WALL_TILE_CELL_COLUMNS);
    expect(min.h).toBe(WALL_TILE_CELL_ROWS);
  });

  it("separates adjacent tiles by the wall's own control gap", () => {
    expect(WALL_TILE_GAP_PX).toBe(WALL_MIN_CONTROL_GAP);
  });

  it("keeps the derived cell tall enough for the ported compact card", () => {
    // The pitch the page math divides by is the tile's cell at the row unit, derived from
    // the ported card: WALL_TILE_CELL_ROWS · ROW_UNIT_MIN + WALL_GUTTER_MIN_PX = card height.
    expect(WALL_TILE_CELL_ROWS * ROW_UNIT_MIN + WALL_GUTTER_MIN_PX).toBeGreaterThanOrEqual(
      WALL_COMPACT_CARD_HEIGHT_PX,
    );
  });

  it("presents exactly a device type's minimum span as one tile", () => {
    // The tile's footprint is the minimum-span device card, so a span at that
    // minimum presents one tile — not the four a one-cell tile would.
    const plan = resolvePages({
      span: WALL_WIDGET_REGISTRY.light.min,
      count: 1,
      rowUnit: ROW_UNIT_MIN,
    });

    expect(plan.tilesAcross).toBe(1);
    expect(plan.tilesDown).toBe(1);
  });
});
