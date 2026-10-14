import { describe, expect, it } from "bun:test";
import {
  WALL_BODY_FONT_SIZE,
  WALL_HERO_FONT_SIZE,
  WALL_LABEL_FONT_SIZE,
  WALL_METRIC_FONT_SIZE,
  WALL_TITLE_FONT_SIZE,
  WALL_TYPE_RAMP,
} from "../src/app/wall/type-ramp.js";

// Pure ramp bounds — no DOM. Hearth re-derives the wall's own body floor (18px,
// up from the old hard 16px) and scales its readouts above the dashboard's 34px
// ceiling so the wall stays legible from across a room (design.md D3;
// specs/wall-display "Wall Glanceability").

/** The dashboard's largest type; the wall's readouts must exceed it. */
const DASHBOARD_TYPE_CEILING_PX = 34;

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
  it("declares its own body floor at or above the re-derived 18px minimum", () => {
    expect(WALL_TYPE_RAMP.bodyMin).toBeGreaterThanOrEqual(18);
    expect(px(WALL_BODY_FONT_SIZE)).toBe(WALL_TYPE_RAMP.bodyMin);
    expect(WALL_TYPE_RAMP.label).toBeGreaterThanOrEqual(WALL_TYPE_RAMP.bodyMin);
    expect(px(WALL_LABEL_FONT_SIZE)).toBe(WALL_TYPE_RAMP.label);
  });

  it("keeps the compact status-chip exception below the body floor", () => {
    expect(WALL_TYPE_RAMP.chip).toBeLessThan(WALL_TYPE_RAMP.bodyMin);
    expect(WALL_TYPE_RAMP.chip).toBeGreaterThanOrEqual(16);
  });

  it("scales every readout above the dashboard's 34px ceiling", () => {
    expect(WALL_TYPE_RAMP.heroMin).toBeGreaterThan(DASHBOARD_TYPE_CEILING_PX);
    expect(WALL_TYPE_RAMP.metricMin).toBeGreaterThan(DASHBOARD_TYPE_CEILING_PX);

    const readouts = [
      { token: WALL_HERO_FONT_SIZE, min: WALL_TYPE_RAMP.heroMin, max: WALL_TYPE_RAMP.heroMax },
      {
        token: WALL_METRIC_FONT_SIZE,
        min: WALL_TYPE_RAMP.metricMin,
        max: WALL_TYPE_RAMP.metricMax,
      },
    ] as const;

    for (const { token, min, max } of readouts) {
      const bounds = clampBounds(token);
      expect(bounds.min).toBe(min);
      expect(bounds.max).toBe(max);
      expect(bounds.min).toBeGreaterThan(DASHBOARD_TYPE_CEILING_PX);
    }
  });

  it("bounds the title tier between the label and metric tiers", () => {
    const { min, max } = clampBounds(WALL_TITLE_FONT_SIZE);
    expect(min).toBe(WALL_TYPE_RAMP.titleMin);
    expect(max).toBe(WALL_TYPE_RAMP.titleMax);
    expect(WALL_TYPE_RAMP.titleMin).toBeGreaterThanOrEqual(WALL_TYPE_RAMP.label);
    expect(WALL_TYPE_RAMP.titleMax).toBeLessThanOrEqual(WALL_TYPE_RAMP.metricMin);
  });

  it("orders the ramp from the body floor up to the hero readout", () => {
    expect(WALL_TYPE_RAMP.metricMin).toBeGreaterThanOrEqual(WALL_TYPE_RAMP.titleMax);
    expect(WALL_TYPE_RAMP.heroMin).toBeGreaterThanOrEqual(WALL_TYPE_RAMP.metricMin);
    expect(WALL_TYPE_RAMP.heroMax).toBeGreaterThan(WALL_TYPE_RAMP.heroMin);
    expect(WALL_TYPE_RAMP.metricMax).toBeGreaterThan(WALL_TYPE_RAMP.metricMin);
  });
});
