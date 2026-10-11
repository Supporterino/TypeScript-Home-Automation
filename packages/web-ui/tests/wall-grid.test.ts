import { describe, expect, it } from "bun:test";
import type { WallProfileConfig, WallWidget } from "@ts-ha/shared";
import { gridPlacementStyle, resolveLayout } from "../src/app/wall/grid.js";

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
