import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { WALL_CARD_GLYPH_SIZE, WALL_CARD_METRICS } from "../src/app/wall/cards/metrics.js";
import { WALL_TYPE_RAMP } from "../src/app/wall/type-ramp.js";

/**
 * The status/presence summary widget (design.md D11, W1, W2; specs/wall-display
 * "Widget Catalog" — "Wall Glanceability" and "Wall Visual Language"). The
 * widget's counts are the shared pure `summarizeDevices` over the live device
 * map, covered where that summary is (`overview.test.ts`); its composition is
 * asserted structurally here, since there is no DOM harness — the same style as
 * the wall's other widget tests.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const RENDERER = join(APP_DIR, "wall/widgets/StatusWidget.tsx");
const ANATOMY = join(APP_DIR, "wall/cards/card-anatomy.tsx");

/** Removes block and line comments so prose is not mistaken for code. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function source(path: string): Promise<string> {
  return stripComments(await readFile(path, "utf8"));
}

describe("StatusWidget renderer", () => {
  it("presents each count on the ported state item, led by the ported circular affordance", async () => {
    const renderer = await source(RENDERER);

    // One state item per count (design.md W1): the ported circular affordance at
    // the ported glyph side beside a label over the reading, so the widget draws
    // no stat, affordance or glyph size of its own. State is conveyed by the label
    // as well as the glyph, never by colour alone (specs/wall-display "Wall Visual
    // Language").
    expect(renderer).toContain("WallCardStateItem");
    expect(renderer).toContain("WALL_CARD_GLYPH_SIZE");
    expect(renderer).not.toMatch(/size=\{\d+\}/);
    expect(WALL_CARD_GLYPH_SIZE).toBe(
      Math.round(WALL_CARD_METRICS.iconSize * WALL_CARD_METRICS.iconSymbol),
    );
  });

  it("draws every label at the ported primary size", async () => {
    const renderer = await source(RENDERER);
    const anatomy = await source(ANATOMY);

    // "On", "Unreachable", "Stale" and "Motion" are the widget's labels, so they
    // are handed to the vocabulary's own label part (design.md W2;
    // specs/wall-display "Supporting text is drawn at the ported sizes"): the
    // state item draws its label through `WallCardLabel`, which falls back to the
    // ported primary size.
    expect(renderer).toContain("<WallCardStateItem");
    expect(renderer).toContain("label={label}");
    expect(anatomy).toContain("<WallCardLabel>{label}</WallCardLabel>");
    expect(anatomy).toContain("size ?? WALL_CARD_PRIMARY_FONT_SIZE");
  });

  it("keeps every count on the wall's metric tier, above the ported type sizes", async () => {
    const renderer = await source(RENDERER);

    // A readout's value keeps the wall's own distance tier (design.md W2;
    // specs/wall-display "A readout's value is not shrunk to the card's type
    // sizes").
    expect(renderer).toContain("reading={value}");
    expect(renderer).toContain("readingSize={WALL_METRIC_FONT_SIZE}");
    expect(WALL_TYPE_RAMP.metricMin).toBeGreaterThan(WALL_CARD_METRICS.primarySize);
    expect(WALL_TYPE_RAMP.metricMin).toBeGreaterThan(WALL_CARD_METRICS.secondarySize);
  });
});
