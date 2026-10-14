import { describe, expect, it } from "bun:test";
import { WALL_GRID_COLUMNS, type WallProfileConfig, type WallWidget } from "@ts-ha/shared";
import {
  resolveDraftPreview,
  WALL_PANEL_HEIGHT_PX,
  WALL_PANEL_WIDTH_PX,
  wallTargetPanel,
} from "../src/app/wall/editor/preview.js";
import { WALL_GUTTER_MAX_PX, wallGridMetrics } from "../src/app/wall/grid.js";
import { deviceGridIds, resolveDeviceGridPage } from "../src/app/wall/widgets/device-grid-model.js";

/**
 * The editor's draft preview (wall-zones-and-fit D7; specs/wall-display "Wall
 * Configuration Editor"). The resolver is pure, so the panel geometry, the
 * verdict, and the page counts are asserted directly — no DOM, no Hearth.
 */

function widget(
  id: string,
  type: WallWidget["type"],
  placement: { x: number; y: number; w: number; h: number },
  config: Record<string, unknown> = {},
  zone?: string,
): WallWidget {
  return { id, type, config, ...placement, zone };
}

function config(widgets: WallWidget[]): WallProfileConfig {
  return { widgets };
}

describe("the previewed panel", () => {
  it("is the wall's own target panel, at its aspect ratio", () => {
    const preview = resolveDraftPreview(config([]));

    expect(preview.panel).toEqual({ width: WALL_PANEL_WIDTH_PX, height: WALL_PANEL_HEIGHT_PX });
    expect(WALL_PANEL_WIDTH_PX / WALL_PANEL_HEIGHT_PX).toBeCloseTo(16 / 9, 5);
    expect(wallTargetPanel()).toEqual(preview.panel);
  });

  it("places a full-width widget inside the panel's own edges", () => {
    const preview = resolveDraftPreview(
      config([widget("a", "clock", { x: 0, y: 0, w: WALL_GRID_COLUMNS, h: 2 })]),
    );
    const box = preview.widgets[0]?.box;
    if (!box) throw new Error("expected a previewed widget");

    // The panel pads itself and keeps a gutter between cells, so a full-width
    // widget starts and ends one gutter inside the panel.
    expect(box.left).toBe(WALL_GUTTER_MAX_PX);
    expect(box.left + box.width).toBe(WALL_PANEL_WIDTH_PX - WALL_GUTTER_MAX_PX);
    expect(box.top).toBe(WALL_GUTTER_MAX_PX);
    expect(box.top + box.height).toBeLessThan(WALL_PANEL_HEIGHT_PX);
  });

  it("scales the cells to the panel's resolved row unit", () => {
    const widgets = [widget("a", "clock", { x: 0, y: 0, w: 6, h: 2 })];
    const preview = resolveDraftPreview(config(widgets));
    const metrics = wallGridMetrics(WALL_PANEL_HEIGHT_PX, widgets);

    expect(preview.rowUnit).toBe(metrics.rowUnit);
    expect(preview.contentHeight).toBe(metrics.contentHeight);
    expect(preview.usableHeight).toBe(metrics.usableHeight);
    // Two rows plus the gutter between them.
    expect(preview.widgets[0]?.box.height).toBeCloseTo(2 * preview.rowUnit + WALL_GUTTER_MAX_PX, 5);
  });
});

describe("the previewed composition", () => {
  it("names each cell by its type and by the zone it declares", () => {
    const preview = resolveDraftPreview(
      config([
        widget("a", "clock", { x: 0, y: 0, w: 6, h: 2 }, {}, "Climate"),
        widget("b", "weather", { x: 6, y: 0, w: 6, h: 2 }, {}, "Climate"),
        widget("c", "scene", { x: 0, y: 2, w: 2, h: 2 }, {}, "Scenes"),
      ]),
    );

    expect(preview.widgets.map((entry) => entry.label)).toEqual(["Clock", "Weather", "Scene"]);
    expect(preview.widgets.map((entry) => entry.zone)).toEqual(["Climate", "Climate", "Scenes"]);
    expect(preview.bands.map((band) => band.zone)).toEqual(["Climate", "Scenes"]);
  });

  it("spans a zone's band across its members", () => {
    const preview = resolveDraftPreview(
      config([
        widget("a", "clock", { x: 0, y: 0, w: 6, h: 2 }, {}, "Climate"),
        widget("b", "weather", { x: 6, y: 0, w: 6, h: 2 }, {}, "Climate"),
      ]),
    );
    const band = preview.bands[0];
    if (!band) throw new Error("expected a previewed band");

    expect(band.box.left).toBe(WALL_GUTTER_MAX_PX);
    expect(band.box.left + band.box.width).toBe(WALL_PANEL_WIDTH_PX - WALL_GUTTER_MAX_PX);
  });

  it("reports an unzoned widget as outside every band", () => {
    const preview = resolveDraftPreview(config([widget("a", "clock", { x: 0, y: 0, w: 6, h: 2 })]));

    expect(preview.widgets[0]?.zone).toBeNull();
    expect(preview.bands).toEqual([]);
  });
});

describe("the previewed verdict", () => {
  it("reports a composition that fits the panel", () => {
    const preview = resolveDraftPreview(config([widget("a", "clock", { x: 0, y: 0, w: 6, h: 4 })]));

    expect(preview.fit).toBe("fits");
    expect(preview.summary).toContain("Fits the 1920 × 1080 panel");
  });

  it("reports a composition taller than the panel as too large", () => {
    const preview = resolveDraftPreview(
      config([widget("a", "clock", { x: 0, y: 0, w: 12, h: 24 })]),
    );

    expect(preview.fit).toBe("tooLarge");
    expect(preview.contentHeight).toBeGreaterThan(preview.usableHeight);
    expect(preview.summary).toContain("Too large for the 1920 × 1080 panel");
  });

  it("judges a draft against another panel when one is given", () => {
    const widgets = [widget("a", "clock", { x: 0, y: 0, w: 12, h: 12 })];

    expect(resolveDraftPreview(config(widgets), { width: 1920, height: 1080 }).fit).toBe("fits");
    expect(resolveDraftPreview(config(widgets), { width: 1920, height: 600 }).fit).toBe("tooLarge");
  });
});

describe("the previewed device grids", () => {
  it("reports the page count the widget itself would present", () => {
    const selected = Array.from({ length: 9 }, (_, index) => `light.${index}`);
    const grid = widget("grid", "devices", { x: 0, y: 0, w: 6, h: 4 }, { qualifiedIds: selected });
    const preview = resolveDraftPreview(config([grid]));
    const expected = resolveDeviceGridPage({
      ids: deviceGridIds({ qualifiedIds: selected }),
      span: grid,
      rowUnit: preview.rowUnit,
      page: 0,
    });

    expect(preview.grids).toEqual([{ widgetId: "grid", devices: 9, pages: expected.pageCount }]);
    expect(preview.grids[0]?.pages).toBeGreaterThan(1);
  });

  it("reports a selection that fits as one page", () => {
    const preview = resolveDraftPreview(
      config([
        widget(
          "grid",
          "devices",
          { x: 0, y: 0, w: 12, h: 12 },
          { qualifiedIds: ["light.a", "light.b"] },
        ),
      ]),
    );

    expect(preview.grids).toEqual([{ widgetId: "grid", devices: 2, pages: 1 }]);
  });

  it("counts the rows a configured title costs the grid, as the wall does", () => {
    // The title is drawn inside the grid's own cell, so the preview must reserve it
    // exactly as the widget does — otherwise the editor would report a page count
    // the wall cannot draw (specs/wall-display "Wall Configuration Editor").
    const selected = Array.from({ length: 40 }, (_, index) => `light.${index}`);
    const grid = widget(
      "grid",
      "devices",
      { x: 0, y: 0, w: 6, h: 6 },
      { qualifiedIds: selected, title: "Hallway" },
    );
    const preview = resolveDraftPreview(config([grid]));
    const expected = resolveDeviceGridPage({
      ids: deviceGridIds({ qualifiedIds: selected }),
      span: grid,
      rowUnit: preview.rowUnit,
      page: 0,
      titled: true,
    });
    const untitled = resolveDeviceGridPage({
      ids: deviceGridIds({ qualifiedIds: selected }),
      span: grid,
      rowUnit: preview.rowUnit,
      page: 0,
    });

    expect(preview.grids).toEqual([{ widgetId: "grid", devices: 40, pages: expected.pageCount }]);
    expect(expected.pageCount).toBeGreaterThanOrEqual(untitled.pageCount);
    expect(expected.tilesPerPage).toBeLessThanOrEqual(untitled.tilesPerPage);
  });

  it("reports no grid for a profile without one", () => {
    expect(
      resolveDraftPreview(config([widget("a", "clock", { x: 0, y: 0, w: 6, h: 2 })])).grids,
    ).toEqual([]);
  });
});
