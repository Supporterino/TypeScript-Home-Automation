import { describe, expect, it } from "bun:test";
import { WALL_MIN_TOUCH_TARGET } from "../src/app/wall/registry.js";
import { deviceTilePresentation, deviceTileText, wallTileMetrics } from "../src/app/wall/scale.js";
import { WALL_TYPE_RAMP } from "../src/app/wall/type-ramp.js";

// Pure size-token logic — no DOM. The wall tile's interactive controls must
// meet the wall minimum and its text must meet Hearth's re-derived body floor;
// the default token must not change the tile's existing rendering (design.md
// D3, D4, D7). The presentation helper is the single availability decision for
// the wall's affordances (design.md D4).

/** The numeric value of an `<n>px` token. */
function px(token: string): number {
  const match = token.match(/^(\d+(?:\.\d+)?)px$/);
  if (!match) throw new Error(`not a px token: ${token}`);
  return Number(match[1]);
}

describe("deviceTilePresentation", () => {
  it("suppresses the favorite, visibility, and detail affordances on the wall", () => {
    const wall = deviceTilePresentation("wall");
    expect(wall.favorite).toBe(false);
    expect(wall.visibility).toBe(false);
    expect(wall.detail).toBe(false);
  });

  it("makes the whole wall card the actuation target and offers no read-only navigation", () => {
    const wall = deviceTilePresentation("wall");
    expect(wall.wholeCardActuation).toBe(true);
    expect(wall.readOnlyNavigation).toBe(false);
  });

  it("keeps every affordance on the dashboard (default) presentation", () => {
    const dashboard = deviceTilePresentation("default");
    expect(dashboard.favorite).toBe(true);
    expect(dashboard.visibility).toBe(true);
    expect(dashboard.detail).toBe(true);
  });

  it("keeps dashboard read-only tiles navigable and not whole-card actuating", () => {
    const dashboard = deviceTilePresentation("default");
    expect(dashboard.readOnlyNavigation).toBe(true);
    expect(dashboard.wholeCardActuation).toBe(false);
  });

  it("defaults to the dashboard presentation when no size is given", () => {
    expect(deviceTilePresentation()).toEqual(deviceTilePresentation("default"));
  });
});

describe("deviceTileText", () => {
  it("keeps every wall chip and body size at or above the Hearth body floor", () => {
    const wall = deviceTileText("wall");
    expect(px(wall.chip)).toBeGreaterThanOrEqual(WALL_TYPE_RAMP.bodyMin);
    expect(px(wall.body)).toBeGreaterThanOrEqual(WALL_TYPE_RAMP.bodyMin);
  });

  it("reproduces the dashboard tile's existing sizes exactly", () => {
    const dashboard = deviceTileText("default");
    expect(dashboard.chip).toBe("xs");
    expect(dashboard.body).toBe("sm");
  });

  it("defaults to the dashboard text sizes when no size is given", () => {
    expect(deviceTileText()).toEqual(deviceTileText("default"));
  });
});

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
