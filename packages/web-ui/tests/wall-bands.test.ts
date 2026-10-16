import { describe, expect, it } from "bun:test";
import type { WallWidget } from "@ts-ha/shared";
import { resolveBands } from "../src/app/wall/bands.js";

// Pure zone grouping — no DOM. A zone is an additive label on the flat grid: the
// widgets sharing it render inside one band, and no widget's placement changes.

function widget(id: string, x: number, y: number, w: number, h: number, zone?: string): WallWidget {
  return { id, type: "clock", config: {}, x, y, w, h, zone };
}

describe("resolveBands", () => {
  it("returns one band for the widgets sharing a zone", () => {
    const bands = resolveBands([
      widget("a", 0, 0, 3, 2, "Climate"),
      widget("b", 3, 0, 3, 2, "Climate"),
    ]);

    expect(bands).toHaveLength(1);
    expect(bands[0]).toEqual({ zone: "Climate", x: 0, y: 0, w: 6, h: 2 });
  });

  it("returns one band per zone, in first-appearance order", () => {
    const bands = resolveBands([
      widget("a", 0, 0, 4, 2, "Lights"),
      widget("b", 4, 0, 4, 2, "Climate"),
      widget("c", 0, 2, 2, 2, "Lights"),
      widget("d", 4, 2, 4, 2, "Climate"),
    ]);

    expect(bands).toEqual([
      { zone: "Lights", x: 0, y: 0, w: 4, h: 4 },
      { zone: "Climate", x: 4, y: 0, w: 4, h: 4 },
    ]);
  });

  it("ignores a widget that declares no zone", () => {
    const bands = resolveBands([widget("a", 0, 0, 4, 2), widget("b", 4, 0, 4, 2, "Lights")]);

    expect(bands).toEqual([{ zone: "Lights", x: 4, y: 0, w: 4, h: 2 }]);
  });

  it("renders no band at all for an unzoned profile", () => {
    expect(resolveBands([widget("a", 0, 0, 4, 2), widget("b", 4, 0, 4, 2)])).toEqual([]);
  });

  it("spans a disjoint zone with the one bounding box that contains both regions", () => {
    const bands = resolveBands([
      widget("a", 0, 0, 2, 2, "Lights"),
      widget("b", 8, 4, 2, 2, "Lights"),
    ]);

    expect(bands).toEqual([{ zone: "Lights", x: 0, y: 0, w: 10, h: 6 }]);
  });

  it("does not move a widget: the band is the members' bounding box", () => {
    const widgets = [widget("a", 2, 1, 3, 2, "Climate"), widget("b", 5, 1, 3, 2, "Climate")];
    const before = widgets.map((w) => ({ id: w.id, x: w.x, y: w.y, w: w.w, h: w.h }));

    resolveBands(widgets);

    expect(widgets.map((w) => ({ id: w.id, x: w.x, y: w.y, w: w.w, h: w.h }))).toEqual(before);
  });

  it("treats a blank zone label as unzoned", () => {
    expect(resolveBands([widget("a", 0, 0, 4, 2, "   ")])).toEqual([]);
  });

  it("groups labels that differ only by surrounding whitespace", () => {
    const bands = resolveBands([
      widget("a", 0, 0, 3, 2, "Lights"),
      widget("b", 3, 0, 3, 2, " Lights "),
    ]);

    expect(bands).toEqual([{ zone: "Lights", x: 0, y: 0, w: 6, h: 2 }]);
  });
});
