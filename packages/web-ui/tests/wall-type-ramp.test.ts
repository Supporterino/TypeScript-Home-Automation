import { describe, expect, it } from "bun:test";
import {
  WALL_BODY_FONT_SIZE,
  WALL_HERO_FONT_SIZE,
  WALL_LABEL_FONT_SIZE,
  WALL_METRIC_FONT_SIZE,
  WALL_TYPE_RAMP,
} from "../src/app/wall/type-ramp.js";

// Pure ramp bounds — no DOM. The wall's ambient renderers must never fall below
// the 16px body minimum, and readouts must stay within 32–64px (design.md D6;
// specs/wall-display "Wall Glanceability").

/** The numeric bounds of a `clamp(<min>px, …, <max>px)` token. */
function clampBounds(token: string): { min: number; max: number } {
  const match = token.match(/^clamp\((\d+(?:\.\d+)?)px, .*, (\d+(?:\.\d+)?)px\)$/);
  if (!match) throw new Error(`not a clamp token: ${token}`);
  return { min: Number(match[1]), max: Number(match[2]) };
}

/** The numeric value of an `<n>px` token. */
function px(token: string): number {
  const match = token.match(/^(\d+(?:\.\d+)?)px$/);
  if (!match) throw new Error(`not a px token: ${token}`);
  return Number(match[1]);
}

describe("WALL_TYPE_RAMP", () => {
  it("keeps every label and body size at or above the 16px minimum", () => {
    expect(WALL_TYPE_RAMP.labelMin).toBeGreaterThanOrEqual(16);
    expect(WALL_TYPE_RAMP.bodyMin).toBeGreaterThanOrEqual(16);
    expect(px(WALL_LABEL_FONT_SIZE)).toBeGreaterThanOrEqual(16);
    expect(px(WALL_BODY_FONT_SIZE)).toBeGreaterThanOrEqual(16);
  });

  it("bounds every readout token to the 32–64px readout range", () => {
    expect(WALL_TYPE_RAMP.readoutMin).toBeGreaterThanOrEqual(32);
    expect(WALL_TYPE_RAMP.readoutMax).toBeLessThanOrEqual(64);

    for (const token of [WALL_HERO_FONT_SIZE, WALL_METRIC_FONT_SIZE]) {
      const { min, max } = clampBounds(token);
      expect(min).toBe(WALL_TYPE_RAMP.readoutMin);
      expect(max).toBe(WALL_TYPE_RAMP.readoutMax);
      expect(min).toBeGreaterThanOrEqual(32);
      expect(max).toBeLessThanOrEqual(64);
    }
  });

  it("orders the ramp so labels sit at or below readouts", () => {
    expect(WALL_TYPE_RAMP.labelMax).toBeGreaterThanOrEqual(WALL_TYPE_RAMP.labelMin);
    expect(WALL_TYPE_RAMP.readoutMax).toBeGreaterThan(WALL_TYPE_RAMP.readoutMin);
    expect(WALL_TYPE_RAMP.bodyMin).toBeLessThanOrEqual(WALL_TYPE_RAMP.readoutMin);
  });
});
