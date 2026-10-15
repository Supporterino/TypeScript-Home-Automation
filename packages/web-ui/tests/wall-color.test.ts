import { describe, expect, it } from "bun:test";
import {
  improveColorContrast,
  type Rgb,
  toCssColor,
  toCssColorWithAlpha,
  WALL_CARD_NEAR_GREY_SATURATION,
  WALL_CARD_NEAR_GREY_VALUE,
  WALL_CARD_SATURATION_FLOOR,
  WALL_CARD_SHAPE_ALPHA,
  WALL_CARD_SLIDER_ALPHA,
} from "../src/app/wall/cards/color.js";

/**
 * The ported device-colour handling (design.md D7; specs/wall-display "Wall
 * Visual Language"). `improveColorContrast` is Mushroom's own
 * (`src/cards/light-card/utils.ts`): saturation below 0.4 is raised to 0.4, and a
 * near-grey below 0.1 has its value lifted to 225 instead. The boundaries are
 * asserted exactly, since a card's whole colour treatment hangs off them.
 */

/** The maximum channel of an RGB triple — the value an HSV round-trip preserves. */
function maxChannel(rgb: Rgb): number {
  return Math.max(rgb[0], rgb[1], rgb[2]);
}

describe("the ported colour constants", () => {
  it("carries Mushroom's thresholds and the wall's alphas", () => {
    expect(WALL_CARD_SATURATION_FLOOR).toBe(0.4);
    expect(WALL_CARD_NEAR_GREY_SATURATION).toBe(0.1);
    expect(WALL_CARD_NEAR_GREY_VALUE).toBe(225);
    expect(WALL_CARD_SHAPE_ALPHA).toBe(0.25);
    expect(WALL_CARD_SLIDER_ALPHA).toBe(0.2);
  });
});

describe("improveColorContrast", () => {
  it("lifts a near-grey's value instead of its saturation", () => {
    // Pure grey: saturation 0 (< 0.1), so the value is pushed to 225.
    expect(improveColorContrast([128, 128, 128])).toEqual([225, 225, 225]);

    // A near-grey keeps its faint tint but is lifted to the ported value.
    const lifted = improveColorContrast([100, 100, 110]);
    expect(maxChannel(lifted)).toBe(WALL_CARD_NEAR_GREY_VALUE);
    expect(maxChannel(lifted)).toBeGreaterThan(maxChannel([100, 100, 110]));
  });

  it("raises a mid saturation to the ported floor, holding the value", () => {
    // [200, 170, 170] has saturation 0.15 and value 200; the floor makes it [200, 120, 120].
    const raised = improveColorContrast([200, 170, 170]);
    expect(maxChannel(raised)).toBe(200);
    expect(raised).toEqual([200, 120, 120]);
  });

  it("treats a saturation of exactly 0.1 as the floor branch, not the near-grey branch", () => {
    // 20 / 200 is exactly 0.1: not below it, so saturation is raised to 0.4.
    expect(improveColorContrast([200, 180, 180])).toEqual([200, 120, 120]);
  });

  it("leaves a colour at or above the ported floor unchanged", () => {
    // Fully saturated red: saturation 1.
    expect(improveColorContrast([255, 0, 0])).toEqual([255, 0, 0]);
    // Saturation of exactly 0.4: not below the floor, so untouched.
    expect(improveColorContrast([255, 153, 153])).toEqual([255, 153, 153]);
  });

  it("returns an in-range RGB triple for every channel", () => {
    for (const rgb of [
      [0, 0, 0],
      [255, 255, 255],
      [12, 240, 7],
      [100, 100, 110],
    ] as const) {
      const result = improveColorContrast(rgb);
      for (const channel of result) {
        expect(Number.isFinite(channel)).toBe(true);
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
      }
    }
  });
});

describe("the CSS colour helpers", () => {
  it("rounds channels for rgb() and rgba()", () => {
    expect(toCssColor([200, 120, 120])).toBe("rgb(200, 120, 120)");
    expect(toCssColorWithAlpha([200, 120, 120], WALL_CARD_SHAPE_ALPHA)).toBe(
      "rgba(200, 120, 120, 0.25)",
    );
    expect(toCssColorWithAlpha([200.6, 119.4, 120], WALL_CARD_SLIDER_ALPHA)).toBe(
      "rgba(201, 119, 120, 0.2)",
    );
  });
});
