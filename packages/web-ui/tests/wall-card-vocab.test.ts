import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { WALL_MIN_CONTROL_GAP } from "../src/app/wall/registry.js";
import { WALL_CARD_GLYPH_SIZE, wallControlGapPx } from "../src/app/wall/widgets/card-vocab.js";

/**
 * The shared Hearth card vocabulary (design.md D11; specs/wall-display "Widget
 * Catalog", "Touch Operation" — "Adjacent controls are separated"). There is no
 * DOM harness here, so the adjacent-control floor is covered through the pure
 * helper, and each redesigned widget is asserted structurally: it composes the
 * vocabulary and carries no Lumen design token — the same style as
 * `wall-scene-tile.test.ts`.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const WIDGETS = join(APP_DIR, "wall/widgets");

const PRESENTATION_WIDGETS = [
  "ClockWidget.tsx",
  "WeatherWidget.tsx",
  "EnergyWidget.tsx",
  "StatusWidget.tsx",
  "RoomWidget.tsx",
  "FavoritesWidget.tsx",
  "SceneWidget.tsx",
] as const;

const VOCAB_ELEMENTS = [
  "WallCardGlyph",
  "WallCardLabel",
  "WallCardMetric",
  "WallCardStat",
  "WallCardHead",
  "WallCardAffordance",
] as const;

/**
 * A Lumen design token — a Tailwind class or a `var(--…)` outside the Hearth
 * namespace. `(?<!hearth-)` keeps `var(--hearth-text-muted)` / `…-font-display`
 * from tripping the text/font alternatives.
 */
const LUMEN_TOKEN =
  /(?<!hearth-)(?:text-(?:muted|danger|info|stale|ink)\b|font-display|rounded-(?:tile|pill|input)|motion-toggle|var\(--(?:info|on|off|stale|danger|accent|surface|hairline|canvas|text|bg|font|e[0-9]|radius|motion)\b)/;

/** Removes block and line comments so prose is not mistaken for code. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function source(path: string): Promise<string> {
  return stripComments(await readFile(path, "utf8"));
}

describe("wallControlGapPx", () => {
  it("keeps at least the wall's 8px adjacent-control floor", () => {
    expect(wallControlGapPx()).toBeGreaterThanOrEqual(WALL_MIN_CONTROL_GAP);
    expect(wallControlGapPx()).toBeGreaterThanOrEqual(8);
  });

  it("sizes the card glyph for a distance read", () => {
    expect(WALL_CARD_GLYPH_SIZE).toBeGreaterThanOrEqual(16);
  });
});

describe("the card vocabulary", () => {
  it("exposes the glyph, title, metric, and affordance-slot elements", async () => {
    const vocab = await source(join(WIDGETS, "card-vocab.tsx"));
    for (const element of VOCAB_ELEMENTS) {
      expect(vocab).toContain(`function ${element}`);
    }
  });

  it("draws only Hearth tokens, never a Lumen token or a literal colour", async () => {
    const vocab = await source(join(WIDGETS, "card-vocab.tsx"));
    expect(vocab).toContain("var(--hearth-");
    expect(vocab).not.toMatch(LUMEN_TOKEN);
    expect(vocab).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("separates adjacent controls through the vocabulary's own gap", async () => {
    const vocab = await source(join(WIDGETS, "card-vocab.tsx"));
    expect(vocab).toContain("wallControlGapPx()");
    expect(vocab).toContain("WALL_MIN_CONTROL_GAP");
  });
});

describe("redesigned widgets use the Hearth card vocabulary", () => {
  for (const name of PRESENTATION_WIDGETS) {
    it(`${name} composes the vocabulary and carries no Lumen token`, async () => {
      const widget = await source(join(WIDGETS, name));
      expect(widget).toContain('from "./card-vocab.js"');
      expect(widget).not.toMatch(LUMEN_TOKEN);
    });
  }
});
