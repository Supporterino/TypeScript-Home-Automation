import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { WallWidget } from "@ts-ha/shared";
import { resolveBands } from "../src/app/wall/bands.js";
import { wallBandChrome } from "../src/app/wall/frame.js";

/**
 * The wall's zone band layer: the band layer and the unfittable-composition
 * explanation asserted structurally against `WallGrid.tsx`.
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
 * The source of one top-level function, so its style object can be asserted on its own.
 */
function functionSource(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  expect(start, `${name} is defined`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\n}", start);
  expect(end, `${name} is closed`).toBeGreaterThan(start);
  return source.slice(start, end);
}

/** The source of one top-level declaration, up to the next top-level one. */
function declarationSource(source: string, name: string): string {
  const start = source.indexOf(`const ${name}`);
  expect(start, `${name} is defined`).toBeGreaterThanOrEqual(0);
  const ends = ["\nconst ", "\nexport function ", "\nfunction "]
    .map((marker) => source.indexOf(marker, start + 1))
    .filter((index) => index !== -1);
  return source.slice(start, ends.length === 0 ? undefined : Math.min(...ends));
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

    // `wallBandChrome` describes the band's surface with token names; `radius` is not a CSS
    // property, so spreading the chrome would drop it and the band would render square.
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

  it("draws the band at the ported card surface — its radius and its padding", async () => {
    const grid = await gridSource();
    const style = functionSource(grid, "bandStyle");
    const chrome = wallBandChrome();

    // A band and the card standing on it are the same surface: the band maps the chrome's
    // own radius and padding, neither a literal nor Hearth's own scale.
    expect(style).toContain("padding: chrome.padding");
    expect(style).not.toContain("--hearth-space-4");
    expect(style).not.toContain("--hearth-radius-md");
    expect(chrome.radius).toBe("var(--hearth-card-radius)");
    expect(chrome.padding).toBe("var(--hearth-card-padding)");
  });

  it("draws the band behind the widget cells and out of the touch path", async () => {
    const source = await gridSource();

    // Bands are inert (a tap passes through to the grid) and sit below the
    // widget cells, so a member keeps its own surface and stays operable.
    expect(source).toContain('pointerEvents: "none"');
    expect(source).toMatch(/zIndex: 0/);
    expect(source).toMatch(/zIndex: 1/);
  });

  it("captions a zone on the wall's own label tier, with the ported treatment", async () => {
    const source = await gridSource();
    const caption = declarationSource(source, "BAND_CAPTION_STYLE");

    // The caption is the wall's chrome, and a container label rather than a readout: it keeps
    // the wall's label tier and quiet colour and adopts the ported family/weight/tracking.
    expect(caption).toContain("...wallChromeTextStyle()");
    expect(caption).toContain("fontSize: WALL_LABEL_FONT_SIZE");
    expect(caption).toContain("--hearth-text-muted");
    expect(caption).not.toContain("uppercase");
    expect(caption).not.toContain("textTransform");
    expect(caption).not.toContain("fontWeight");
    expect(source).toContain("WALL_LABEL_FONT_SIZE");
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

  it("draws the explanation's route and heading with the ported chrome treatment", async () => {
    const source = await gridSource();
    const heading = declarationSource(source, "TOO_LARGE_HEADING_STYLE");

    // The panel's own explanation is the wall's chrome: its route is the same ported route
    // affordance the links draw, and its heading keeps the wall's title tier.
    expect(source).toContain("<WallCardRoute to={wallsPath(basePath)}");
    expect(source).toContain("WallCardRoute");
    expect(source).not.toContain("TOO_LARGE_ROUTE_STYLE");
    expect(source).not.toContain("<Link to={wallsPath(basePath)}");
    expect(heading).toContain("...wallChromeTextStyle()");
    expect(heading).toContain("fontSize: WALL_TITLE_FONT_SIZE");
    expect(heading).not.toContain("hearth-weight-bold");
  });

  it("contains the explanation instead of scrolling the composition", async () => {
    const source = await gridSource();
    const explanation = source.slice(source.indexOf("TOO_LARGE_STYLE"));

    expect(explanation).toContain('overflow: "hidden"');
    expect(source).not.toContain('overflowY: "auto"');
    expect(source).not.toContain('overflow: "auto"');
  });
});
