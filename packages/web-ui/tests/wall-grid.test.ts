import { describe, expect, it } from "bun:test";
import type { WallProfileConfig, WallWidget } from "@ts-ha/shared";
import {
  gridPlacementStyle,
  occupiedRows,
  ROW_UNIT_MAX,
  ROW_UNIT_MIN,
  resolveLayout,
  resolveRowUnit,
  WALL_COMPACT_CARD_HEIGHT_PX,
  WALL_GUTTER,
  WALL_GUTTER_MAX_PX,
  WALL_GUTTER_MIN_PX,
  WALL_MIN_DEVICE_ROWS,
  wallGridMetrics,
  wallGridStyle,
} from "../src/app/wall/grid.js";
import {
  WALL_MIN_CONTROL_GAP,
  WALL_MIN_TOUCH_TARGET,
  WALL_WIDGET_REGISTRY,
} from "../src/app/wall/registry.js";

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
    // (500 − 144) / 5 = 71.2, inside the bounds; without the reservation the
    // same panel would clamp to the ceiling instead.
    expect(resolveRowUnit(500, 5, 24)).toBeCloseTo(71.2, 5);
    expect(resolveRowUnit(500, 5, 24)).toBeLessThan(resolveRowUnit(500, 5, 0));
  });
});

describe("wallGridMetrics", () => {
  it("reserves the panel padding and inter-row gaps in the usable height", () => {
    const widgets = [widget("a", 0, 0, 6, 5)];
    const metrics = wallGridMetrics(1024, widgets, 24);
    expect(metrics.usableHeight).toBe(1024 - 48);
    expect(metrics.rowUnit).toBe(ROW_UNIT_MAX);
    expect(metrics.contentHeight).toBe(5 * ROW_UNIT_MAX + 4 * 24);
    expect(metrics.outcome).toBe("fits");
    expect(metrics.fits).toBe(true);
  });

  it("reports the fits outcome for a composition that fits the panel exactly", () => {
    // 10 rows on a 1000px panel: the unit resolves to 73.6 and the content is
    // exactly the usable height, so the composition fits with nothing to spare.
    const metrics = wallGridMetrics(1000, [widget("a", 0, 0, 12, 10)], 24);

    expect(metrics.rowUnit).toBeCloseTo(73.6, 5);
    expect(metrics.contentHeight).toBeCloseTo(metrics.usableHeight, 5);
    expect(metrics.outcome).toBe("fits");
  });

  it("reports the tooLarge outcome for a composition taller than the panel", () => {
    const metrics = wallGridMetrics(300, [widget("a", 0, 0, 12, 10)], 24);
    expect(metrics.rowUnit).toBe(ROW_UNIT_MIN);
    expect(metrics.contentHeight).toBeGreaterThan(metrics.usableHeight);
    expect(metrics.outcome).toBe("tooLarge");
    expect(metrics.fits).toBe(false);
  });

  it("treats a sub-pixel float-rounding hair as a fit, not an overflow", () => {
    // 19 rows on a 1862px panel: the float division leaves contentHeight a hair
    // above usableHeight (1814.0000000000002 > 1814); it must still fit.
    const metrics = wallGridMetrics(1862, [widget("a", 0, 0, 12, 19)], 24);
    expect(metrics.contentHeight).toBeGreaterThan(metrics.usableHeight);
    expect(metrics.outcome).toBe("fits");
  });
});

describe("the row unit's bounds", () => {
  it("lowers the ceiling to the reduced component scale", () => {
    expect(ROW_UNIT_MAX).toBe(80);
    expect(resolveRowUnit(4096, 2)).toBe(ROW_UNIT_MAX);
  });

  it("derives the floor from the compact light card at the wall's floors", () => {
    // D4: a minimum-span device cell (2 rows) holds the compact card at the
    // touch-target and control-gap floors — the derivation `grid.ts` documents.
    expect(WALL_COMPACT_CARD_HEIGHT_PX).toBe(
      WALL_MIN_DEVICE_ROWS * WALL_MIN_TOUCH_TARGET + 2 * WALL_MIN_CONTROL_GAP,
    );
    expect(ROW_UNIT_MIN).toBe(
      (WALL_COMPACT_CARD_HEIGHT_PX - WALL_GUTTER_MIN_PX) / WALL_MIN_DEVICE_ROWS,
    );
    expect(ROW_UNIT_MIN).toBe(56);
  });

  it("holds the minimum-span cell for the compact card at the gutter floor", () => {
    expect(WALL_MIN_DEVICE_ROWS * ROW_UNIT_MIN + WALL_GUTTER_MIN_PX).toBeGreaterThanOrEqual(
      WALL_COMPACT_CARD_HEIGHT_PX,
    );
  });

  it("keeps the floor at the wall's minimum touch target and below the ceiling", () => {
    expect(ROW_UNIT_MIN).toBeGreaterThanOrEqual(WALL_MIN_TOUCH_TARGET);
    expect(ROW_UNIT_MIN).toBeLessThan(ROW_UNIT_MAX);
  });

  it("takes the minimum device span from the widget registry", () => {
    expect(WALL_MIN_DEVICE_ROWS).toBe(WALL_WIDGET_REGISTRY.device.min.h);
    expect(WALL_MIN_DEVICE_ROWS).toBe(WALL_WIDGET_REGISTRY.device.min.w);
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

  it("never scrolls, not even for a composition taller than the panel", () => {
    const style = wallGridStyle({ widgets: [widget("a", 0, 0, 12, 10)], availableHeight: 300 });

    expect(style.alignContent).toBe("start");
    expect(style.overflowY).toBe("hidden");
  });

  it("keeps hidden overflow in every outcome", () => {
    const layouts = [
      { widgets: [widget("a", 0, 0, 3, 2)], availableHeight: 1024 },
      { widgets: [widget("a", 0, 0, 12, 10)], availableHeight: 1000 },
      { widgets: [widget("a", 0, 0, 12, 10)], availableHeight: 300 },
      { widgets: [], availableHeight: 0 },
    ];

    for (const layout of layouts) {
      expect(wallGridStyle(layout).overflowY).toBe("hidden");
    }
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
