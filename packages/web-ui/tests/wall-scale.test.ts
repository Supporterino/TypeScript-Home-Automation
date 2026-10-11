import { describe, expect, it } from "bun:test";
import { WALL_MIN_TOUCH_TARGET } from "../src/app/wall/registry.js";
import { wallTileMetrics } from "../src/app/wall/scale.js";

// Pure size-token logic — no DOM. The wall tile's interactive controls must
// meet the wall minimum; the default token must not change the tile's
// existing rendering (design.md D7; task 5.11).

describe("wallTileMetrics", () => {
  it("enlarges the wall token's interactive control to the wall minimum", () => {
    expect(wallTileMetrics("wall").control).toBeGreaterThanOrEqual(WALL_MIN_TOUCH_TARGET);
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
