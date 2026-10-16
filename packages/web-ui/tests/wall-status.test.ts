import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { WALL_CARD_GLYPH_SIZE, WALL_CARD_METRICS } from "../src/app/wall/cards/metrics.js";
import { WALL_TYPE_RAMP } from "../src/app/wall/type-ramp.js";

/**
 * The status/presence summary widget: the counts are the shared `summarizeDevices`;
 * its composition is asserted structurally.
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

    // One state item per count: the ported circular affordance beside a label over
    // the reading, so the widget draws no glyph size of its own.
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

    // "On", "Unreachable", "Stale" and "Motion" are the widget's labels, handed to the
    // vocabulary's own label part.
    expect(renderer).toContain("<WallCardStateItem");
    expect(renderer).toContain("label={label}");
    expect(anatomy).toContain("<WallCardLabel>{label}</WallCardLabel>");
    expect(anatomy).toContain("size ?? WALL_CARD_PRIMARY_FONT_SIZE");
  });

  it("keeps every count on the wall's metric tier, above the ported type sizes", async () => {
    const renderer = await source(RENDERER);

    // A readout's value keeps the wall's own distance tier.
    expect(renderer).toContain("reading={value}");
    expect(renderer).toContain("readingSize={WALL_METRIC_FONT_SIZE}");
    expect(WALL_TYPE_RAMP.metricMin).toBeGreaterThan(WALL_CARD_METRICS.primarySize);
    expect(WALL_TYPE_RAMP.metricMin).toBeGreaterThan(WALL_CARD_METRICS.secondarySize);
  });
});
