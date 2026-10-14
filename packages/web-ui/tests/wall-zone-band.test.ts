import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { WallWidget } from "@ts-ha/shared";
import { resolveBands } from "../src/app/wall/bands.js";

/**
 * The wall's zone band layer (wall-zones-and-fit D2; specs/wall-display "Wall
 * Zones", "Panel Fit"). There is no DOM harness here, so the band layer and the
 * unfittable-composition explanation are asserted structurally against
 * `WallGrid.tsx` — the same style as `wall-read-only.test.ts` — while the pure
 * decisions (which bands resolve, whether a composition fits) are covered by
 * `wall-bands.test.ts` and `wall-grid.test.ts`.
 */
const WALL_GRID = join(import.meta.dir, "..", "src/app/wall/WallGrid.tsx");
const WIDGET_FRAME = join(import.meta.dir, "..", "src/app/wall/WidgetFrame.tsx");

/** Removes block and line comments so prose is not mistaken for markup. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function gridSource(): Promise<string> {
  return stripComments(await readFile(WALL_GRID, "utf8"));
}

/**
 * The source of one top-level function, so its style object can be asserted on its
 * own — the pattern that made the band's missing radius invisible is a spread of a
 * token-named chrome object, and the assertion has to see the mapping the consumer
 * writes.
 */
function functionSource(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  expect(start, `${name} is defined`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\n}", start);
  expect(end, `${name} is closed`).toBeGreaterThan(start);
  return source.slice(start, end);
}

function widget(id: string, x: number, y: number, w: number, h: number, zone?: string): WallWidget {
  return { id, type: "clock", config: {}, x, y, w, h, zone };
}

describe("the band layer", () => {
  it("renders one labelled band from the resolved zones", async () => {
    const source = await gridSource();

    expect(source).toContain("resolveBands(widgets)");
    expect(source).toContain("bands.map(");
    // The band carries its zone's label and the band surface the pure chrome
    // decides, at the band's own grid placement.
    expect(source).toContain("{band.zone}");
    expect(source).toContain("wallBandChrome()");
    expect(source).toContain("gridPlacementStyle(band)");
  });

  it("renders nothing for a profile whose widgets declare no zone", () => {
    // The layer is exactly the resolved bands, so an unzoned profile resolves to
    // an empty list and the grid draws no band at all.
    expect(resolveBands([widget("a", 0, 0, 4, 2), widget("b", 4, 0, 4, 2)])).toEqual([]);
  });

  it("draws the band as a Hearth-radiused field, not a square one", async () => {
    const grid = await gridSource();
    const style = functionSource(grid, "bandStyle");

    // `wallBandChrome` describes the band's surface with token names; `radius` is
    // not a CSS property, so spreading the chrome would drop it and the band would
    // render square. The band maps it to a real property, exactly as `WidgetFrame`
    // maps the frame's chrome (wall-zones-and-fit D2).
    expect(style).toContain("background: chrome.background");
    expect(style).toContain("borderRadius: chrome.radius");
    expect(style).not.toContain("...wallBandChrome()");
    // No token-named key — `radius` or a chrome's `surface` — reaches the style
    // object, in this consumer or the frame's.
    expect(style).not.toMatch(/(?:^|[\s{,])radius\s*:/m);
    expect(style).not.toMatch(/(?:^|[\s{,])surface\s*:/m);

    const widgetFrame = stripComments(await readFile(WIDGET_FRAME, "utf8"));
    expect(widgetFrame).toContain("borderRadius: chrome.radius");
  });

  it("draws the band behind the widget cells and out of the touch path", async () => {
    const source = await gridSource();

    // Bands are inert (a tap passes through to the grid) and sit below the
    // widget cells, so a member keeps its own surface and stays operable.
    expect(source).toContain('pointerEvents: "none"');
    expect(source).toMatch(/zIndex: 0/);
    expect(source).toMatch(/zIndex: 1/);
  });

  it("captions a zone on the wall's own label tier", async () => {
    const source = await gridSource();

    expect(source).toContain("WALL_LABEL_FONT_SIZE");
    expect(source).toContain("--hearth-text-muted");
  });
});

describe("the unfittable-composition explanation", () => {
  it("renders the explanation when the resolver reports a too-large composition", async () => {
    const source = await gridSource();

    expect(source).toContain('outcome === "tooLarge"');
    expect(source).toContain("Too large for this panel");
  });

  it("explains the state in the wall's own message form with a route to the editor", async () => {
    const source = await gridSource();

    expect(source).toContain("WallCardMessage");
    expect(source).toContain("wallsPath(basePath)");
    expect(source).toContain("Open the wall editor");
  });

  it("contains the explanation instead of scrolling the composition", async () => {
    const source = await gridSource();
    const explanation = source.slice(source.indexOf("TOO_LARGE_STYLE"));

    expect(explanation).toContain('overflow: "hidden"');
    expect(source).not.toContain('overflowY: "auto"');
    expect(source).not.toContain('overflow: "auto"');
  });
});
