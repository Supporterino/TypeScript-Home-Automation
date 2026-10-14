import { describe, expect, it } from "bun:test";
import {
  ROW_UNIT_MAX,
  ROW_UNIT_MIN,
  WALL_COMPACT_CARD_HEIGHT_PX,
  WALL_GUTTER_MIN_PX,
} from "../src/app/wall/grid.js";
import { resolvePages, WALL_TILE_CELL_SPAN, WALL_TILE_GAP_PX } from "../src/app/wall/pages.js";
import { WALL_MIN_CONTROL_GAP, WALL_WIDGET_REGISTRY } from "../src/app/wall/registry.js";

// Pure pagination — no DOM (wall-zones-and-fit D12; specs/wall-display "Device
// Grid Widget", "Panel Fit"). The device grid pages a selection its span cannot
// present instead of overflowing or scrolling, so the wall never scrolls.

describe("resolvePages", () => {
  it("presents a selection that fits its span as one page", () => {
    // A 6×4 span at the floor holds 3 tiles across × 2 down = 6.
    const plan = resolvePages({ span: { w: 6, h: 4 }, count: 6, rowUnit: ROW_UNIT_MIN });

    expect(plan.tilesPerPage).toBe(6);
    expect(plan.pageCount).toBe(1);
  });

  it("pages a selection larger than its span", () => {
    const plan = resolvePages({ span: { w: 6, h: 4 }, count: 13, rowUnit: ROW_UNIT_MIN });

    expect(plan.tilesPerPage).toBe(6);
    expect(plan.pageCount).toBe(3);
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

  it("presents at least one tile for the device type's minimum span", () => {
    const { min } = WALL_WIDGET_REGISTRY.device;
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

describe("the device tile's model", () => {
  it("takes the tile's cell span from the device type's minimum span", () => {
    const { min } = WALL_WIDGET_REGISTRY.device;

    expect(min.w).toBe(WALL_TILE_CELL_SPAN);
    expect(min.h).toBe(WALL_TILE_CELL_SPAN);
  });

  it("separates adjacent tiles by the wall's own control gap", () => {
    expect(WALL_TILE_GAP_PX).toBe(WALL_MIN_CONTROL_GAP);
  });

  it("keeps the derived cell tall enough for the compact light card", () => {
    // The pitch the page math divides by is the tile's cell at the row unit,
    // which D4 derives from the compact card:
    //   WALL_TILE_CELL_SPAN · ROW_UNIT_MIN + WALL_GUTTER_MIN_PX ≥ card height.
    expect(WALL_TILE_CELL_SPAN * ROW_UNIT_MIN + WALL_GUTTER_MIN_PX).toBeGreaterThanOrEqual(
      WALL_COMPACT_CARD_HEIGHT_PX,
    );
  });

  it("presents exactly the device type's minimum span as one tile", () => {
    // The tile's footprint is the minimum-span device card, so a span at that
    // minimum presents one tile — not the four a one-cell tile would.
    const plan = resolvePages({
      span: WALL_WIDGET_REGISTRY.device.min,
      count: 1,
      rowUnit: ROW_UNIT_MIN,
    });

    expect(plan.tilesAcross).toBe(1);
    expect(plan.tilesDown).toBe(1);
  });
});
