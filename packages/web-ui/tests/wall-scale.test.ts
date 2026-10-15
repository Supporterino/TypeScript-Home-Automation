import { describe, expect, it } from "bun:test";
import { WALL_MIN_TOUCH_TARGET } from "../src/app/wall/registry.js";
import { wallReadoutFontSize, wallTileMetrics } from "../src/app/wall/scale.js";
import {
  WALL_BAND_FONT_SIZE,
  WALL_METRIC_FONT_SIZE,
  WALL_TYPE_RAMP,
} from "../src/app/wall/type-ramp.js";

// Pure size-token logic — no DOM. The wall's own affordances must meet the wall
// minimum, and its readout tier must stay above the wall's body floor; the
// default token must not change any existing desktop rendering (design.md D2,
// D7). The device tile this module once scaled has retired to the ported cards
// under `wall/cards/` (design.md D1), so only the wall's affordance size and the
// readout tier remain here.

describe("wallTileMetrics", () => {
  it("sizes the wall token's control to the ported card's control height", () => {
    expect(wallTileMetrics("wall").control).toBeGreaterThanOrEqual(WALL_MIN_TOUCH_TARGET);
    expect(wallTileMetrics("wall").control).toBe(42);
  });

  it("keeps the default token below the wall minimum so it does not enlarge existing views", () => {
    expect(wallTileMetrics("default").control).toBeLessThan(WALL_MIN_TOUCH_TARGET);
  });

  it("defaults to the default token when no size is given", () => {
    expect(wallTileMetrics()).toEqual(wallTileMetrics("default"));
  });

  it("gives the wall token a larger control than the default token", () => {
    expect(wallTileMetrics("wall").control).toBeGreaterThan(wallTileMetrics("default").control);
  });
});

describe("wallReadoutFontSize", () => {
  it("keeps a grouped readout — one at or near its minimum span — on the band tier", () => {
    expect(wallReadoutFontSize("compact")).toBe(WALL_BAND_FONT_SIZE);
    expect(wallReadoutFontSize("regular")).toBe(WALL_BAND_FONT_SIZE);
  });

  it("grows a readout with a large span onto the metric tier", () => {
    expect(wallReadoutFontSize("roomy")).toBe(WALL_METRIC_FONT_SIZE);
    expect(wallReadoutFontSize("roomy")).not.toBe(wallReadoutFontSize("compact"));
  });

  it("keeps both readout tiers above the wall's body floor", () => {
    expect(WALL_TYPE_RAMP.bandMin).toBeGreaterThanOrEqual(WALL_TYPE_RAMP.bodyMin);
    expect(WALL_TYPE_RAMP.metricMin).toBeGreaterThanOrEqual(WALL_TYPE_RAMP.bodyMin);
  });
});
