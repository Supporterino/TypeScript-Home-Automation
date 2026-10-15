import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { WALL_CARD_GLYPH_SIZE, WALL_CARD_METRICS } from "../src/app/wall/cards/metrics.js";
import { WALL_TYPE_RAMP } from "../src/app/wall/type-ramp.js";
import { formatClock } from "../src/app/wall/widgets/clock.js";

/**
 * The clock/date widget (design.md D11, W1, W2; specs/wall-display "Widget
 * Catalog" — "A clock renders without server data" — "Wall Glanceability" and
 * "Wall Visual Language"). The time is derived by the pure {@link formatClock},
 * so it is asserted directly; the renderer's composition is asserted
 * structurally, since there is no DOM harness — the same style as the wall's
 * other widget tests.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const RENDERER = join(APP_DIR, "wall/widgets/ClockWidget.tsx");
const ANATOMY = join(APP_DIR, "wall/cards/card-anatomy.tsx");

/** Removes block and line comments so prose is not mistaken for code. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function source(path: string): Promise<string> {
  return stripComments(await readFile(path, "utf8"));
}

describe("formatClock", () => {
  it("renders the local time for a fixed instant", () => {
    const now = new Date(2026, 0, 15, 14, 30, 0).getTime();
    const { time } = formatClock(now);

    expect(time).toMatch(/^\d{2}:\d{2}$/);
    const [hour, minute] = time.split(":").map((part) => Number.parseInt(part, 10));
    expect(hour).toBe(14);
    expect(minute).toBe(30);
  });

  it("renders a non-empty local date", () => {
    const now = new Date(2026, 0, 15, 14, 30, 0).getTime();
    expect(formatClock(now).date.length).toBeGreaterThan(0);
  });

  it("advances the time with the instant", () => {
    const before = new Date(2026, 0, 15, 14, 30, 0).getTime();
    const after = new Date(2026, 0, 15, 14, 31, 0).getTime();
    expect(formatClock(after).time).toBe("14:31");
    expect(formatClock(after).time).not.toBe(formatClock(before).time);
  });

  it("derives entirely from its argument — no server data or clock access", () => {
    const day = new Date(2026, 0, 15, 14, 30, 0).getTime();
    const nextDay = new Date(2026, 0, 16, 14, 30, 0).getTime();

    expect(formatClock(day)).toEqual(formatClock(day));
    expect(formatClock(nextDay).date).not.toBe(formatClock(day).date);
  });
});

describe("ClockWidget renderer", () => {
  it("leads with the ported circular affordance at the ported glyph size", async () => {
    const renderer = await source(RENDERER);

    // The leading glyph is the ported 36 px circular tinted shape (design.md W1):
    // the widget composes the vocabulary's state item and hands it the ported
    // glyph side, so it draws no affordance of its own — and no literal size.
    expect(renderer).toContain("WallCardStateItem");
    expect(renderer).toContain("WALL_CARD_GLYPH_SIZE");
    expect(renderer).not.toMatch(/size=\{\d+\}/);
    expect(WALL_CARD_GLYPH_SIZE).toBe(
      Math.round(WALL_CARD_METRICS.iconSize * WALL_CARD_METRICS.iconSymbol),
    );
  });

  it("draws the date as the vocabulary's primary line", async () => {
    const renderer = await source(RENDERER);
    const anatomy = await source(ANATOMY);

    // The date is the widget's caption, so it is handed to the vocabulary's own
    // label part (design.md W2; specs/wall-display "Supporting text is drawn at
    // the ported sizes"): the state item draws it through `WallCardLabel`, which
    // falls back to the ported primary size, and the renderer declares no type
    // treatment of its own.
    expect(renderer).toContain("label={date}");
    expect(renderer).not.toContain("fontSize");
    expect(anatomy).toContain("<WallCardLabel>{label}</WallCardLabel>");
    expect(anatomy).toContain("size ?? WALL_CARD_PRIMARY_FONT_SIZE");
  });

  it("keeps the time on the wall's hero tier, above the ported type sizes", async () => {
    const renderer = await source(RENDERER);

    // A readout's value keeps the wall's own distance tier (design.md W2;
    // specs/wall-display "A readout's value is not shrunk to the card's type
    // sizes"), and the hero tier is the top of that ramp.
    expect(renderer).toContain("reading={time}");
    expect(renderer).toContain("readingSize={WALL_HERO_FONT_SIZE}");
    // The hero tier is the top of the wall's readout ramp, above the metric tier
    // a supporting figure could be drawn on and above the ported type sizes.
    expect(WALL_TYPE_RAMP.heroMin).toBeGreaterThan(WALL_TYPE_RAMP.metricMin);
    expect(WALL_TYPE_RAMP.heroMin).toBeGreaterThan(WALL_CARD_METRICS.primarySize);
    expect(WALL_TYPE_RAMP.heroMin).toBeGreaterThan(WALL_CARD_METRICS.secondarySize);
  });
});
