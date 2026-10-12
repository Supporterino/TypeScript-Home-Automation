import { describe, expect, it } from "bun:test";
import type { WallProfileConfig, WallWidget } from "@ts-ha/shared";
import {
  gridPlacementStyle,
  occupiedRows,
  ROW_UNIT_MAX,
  ROW_UNIT_MIN,
  resolveLayout,
  resolveRowUnit,
  WALL_GUTTER,
  WALL_GUTTER_MAX_PX,
  WALL_GUTTER_MIN_PX,
  wallGridMetrics,
  wallGridStyle,
} from "../src/app/wall/grid.js";

function widget(id: string, x: number, y: number, w: number, h: number): WallWidget {
  return { id, type: "clock", config: {}, x, y, w, h };
}

describe("resolveLayout", () => {
  const base = [widget("a", 0, 0, 4, 2)];

  it("falls back to the base layout for an orientation without an override", () => {
    const config: WallProfileConfig = { widgets: base };
    expect(resolveLayout(config, "portrait")).toBe(base);
    expect(resolveLayout(config, "landscape")).toBe(base);
  });

  it("replaces the base layout for an orientation that declares one", () => {
    const portrait = [widget("a", 0, 0, 6, 3), widget("b", 6, 0, 6, 3)];
    const config: WallProfileConfig = { widgets: base, orientations: { portrait } };

    expect(resolveLayout(config, "portrait")).toBe(portrait);
    expect(resolveLayout(config, "landscape")).toBe(base);
  });

  it("falls back per orientation when only one override is present", () => {
    const landscape = [widget("a", 0, 0, 12, 2)];
    const config: WallProfileConfig = { widgets: base, orientations: { landscape } };

    expect(resolveLayout(config, "landscape")).toBe(landscape);
    expect(resolveLayout(config, "portrait")).toBe(base);
  });
});

describe("gridPlacementStyle", () => {
  it("offsets zero-based cells to one-based CSS grid lines and spans the size", () => {
    expect(gridPlacementStyle(widget("a", 2, 3, 4, 5))).toEqual({
      gridColumn: "3 / span 4",
      gridRow: "4 / span 5",
    });
  });

  it("places a widget at the origin on the first grid line", () => {
    expect(gridPlacementStyle(widget("a", 0, 0, 1, 1))).toEqual({
      gridColumn: "1 / span 1",
      gridRow: "1 / span 1",
    });
  });
});

describe("occupiedRows", () => {
  it("is the largest y + h across the layout", () => {
    expect(occupiedRows([widget("a", 0, 0, 4, 2), widget("b", 4, 2, 4, 3)])).toBe(5);
  });

  it("is zero for an empty layout", () => {
    expect(occupiedRows([])).toBe(0);
  });
});

describe("resolveRowUnit", () => {
  it("clamps a short profile's row unit to the maximum", () => {
    // Five rows on a 1024px panel would be ~190px each; bounded to the ceiling.
    expect(resolveRowUnit(1024, 5)).toBe(ROW_UNIT_MAX);
  });

  it("uses the exact fit when the natural unit falls inside the bounds", () => {
    expect(resolveRowUnit(600, 8)).toBeCloseTo(75, 5);
    expect(resolveRowUnit(600, 8)).toBeGreaterThan(ROW_UNIT_MIN);
    expect(resolveRowUnit(600, 8)).toBeLessThan(ROW_UNIT_MAX);
  });

  it("clamps a tall profile's row unit to the minimum", () => {
    expect(resolveRowUnit(240, 10)).toBe(ROW_UNIT_MIN);
  });

  it("reserves a supplied gutter when sizing rows", () => {
    // Padding (2×24) and four inter-row gaps (4×24) are removed before dividing:
    // (600 − 144) / 5 = 91.2, inside the bounds.
    expect(resolveRowUnit(600, 5, 24)).toBeCloseTo(91.2, 5);
    expect(resolveRowUnit(600, 5, 24)).toBeLessThan(resolveRowUnit(600, 5, 0));
  });
});

describe("wallGridMetrics", () => {
  it("reserves the panel padding and inter-row gaps in the usable height", () => {
    const widgets = [widget("a", 0, 0, 6, 5)];
    const metrics = wallGridMetrics(1024, widgets, 24);
    expect(metrics.usableHeight).toBe(1024 - 48);
    expect(metrics.rowUnit).toBe(ROW_UNIT_MAX);
    expect(metrics.contentHeight).toBe(5 * ROW_UNIT_MAX + 4 * 24);
    expect(metrics.fits).toBe(true);
  });

  it("reports overflow for a clamped profile taller than the panel", () => {
    const widgets = [widget("a", 0, 0, 12, 10)];
    const metrics = wallGridMetrics(300, widgets, 24);
    expect(metrics.rowUnit).toBe(ROW_UNIT_MIN);
    expect(metrics.contentHeight).toBeGreaterThan(metrics.usableHeight);
    expect(metrics.fits).toBe(false);
  });

  it("treats a sub-pixel float-rounding hair as a fit, not an overflow", () => {
    // 19 rows on a 1862px panel: the float division leaves contentHeight a hair
    // above usableHeight (1814.0000000000002 > 1814); it must still fit.
    const metrics = wallGridMetrics(1862, [widget("a", 0, 0, 12, 19)], 24);
    expect(metrics.contentHeight).toBeGreaterThan(metrics.usableHeight);
    expect(metrics.fits).toBe(true);
  });
});

describe("wallGridStyle", () => {
  it("sizes rows by the bounded row unit rather than the panel height", () => {
    const style = wallGridStyle({ widgets: [widget("a", 0, 0, 3, 2)], availableHeight: 1024 });
    expect(style.gridAutoRows).toBe(`${ROW_UNIT_MAX}px`);
    expect(style.gridAutoRows).not.toBe("minmax(0, 1fr)");
    expect(style.alignContent).toBe("center");
  });

  it("keeps a small-span widget's height tied to its span and the row unit", () => {
    const panelHeight = 1024;
    const style = wallGridStyle({
      widgets: [widget("a", 0, 0, 3, 2)],
      availableHeight: panelHeight,
    });
    const rowUnit = Number.parseInt(style.gridAutoRows, 10);
    expect(rowUnit * 2).toBeLessThan(panelHeight);
  });

  it("centers a profile whose content fits and does not scroll", () => {
    const style = wallGridStyle({ widgets: [widget("a", 0, 0, 6, 5)], availableHeight: 1024 });
    expect(style.alignContent).toBe("center");
    expect(style.overflowY).toBe("hidden");
  });

  it("starts and scrolls a profile taller than the panel instead of clipping it", () => {
    const style = wallGridStyle({ widgets: [widget("a", 0, 0, 12, 10)], availableHeight: 300 });
    expect(style.alignContent).toBe("start");
    expect(style.overflowY).toBe("auto");
  });

  it("still centers a profile that fits only within the float tolerance", () => {
    const style = wallGridStyle({ widgets: [widget("a", 0, 0, 12, 19)], availableHeight: 1862 });
    expect(style.alignContent).toBe("center");
    expect(style.overflowY).toBe("hidden");
  });
});

describe("WALL_GUTTER", () => {
  it("is the single clamp token the design specifies", () => {
    expect(WALL_GUTTER).toBe("clamp(16px, 2vmin, 24px)");
  });

  it("guarantees at least the design minimum separation", () => {
    expect(WALL_GUTTER_MIN_PX).toBeGreaterThanOrEqual(16);
    expect(WALL_GUTTER_MAX_PX).toBeGreaterThanOrEqual(WALL_GUTTER_MIN_PX);
  });

  it("applies the gutter to both the grid gap and the panel padding", () => {
    const style = wallGridStyle({ widgets: [widget("a", 0, 0, 3, 2)], availableHeight: 1024 });
    expect(style.gap).toBe(WALL_GUTTER);
    expect(style.padding).toBe(WALL_GUTTER);
  });
});
