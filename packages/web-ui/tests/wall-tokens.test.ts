import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { WALL_CARD_GLYPH_SIZE, WALL_CARD_METRICS } from "../src/app/wall/cards/metrics.js";

/**
 * The ported device-card token table: the metrics in `wall/cards/metrics.ts`,
 * mirrored by Hearth's own tokens in `wall/hearth.css`.
 */

/** The light scheme's rule selector — the boundary between the two token blocks. */
const LIGHT_RULE = '[data-theme="light"] [data-wall-chunk]';

/** Removes block comments so a token named in prose is not read as a declaration. */
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** The token declarations of the dark (authoritative) scheme in `wall/hearth.css`. */
function darkTokens(css: string): Record<string, string> {
  const body = stripCssComments(css);
  const boundary = body.indexOf(LIGHT_RULE);
  const block = body.slice(0, boundary);
  const tokens: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/(--hearth-[\w-]+):\s*([^;{]+);/g)) {
    if (name !== undefined && value !== undefined) tokens[name] = value.trim();
  }
  return tokens;
}

async function readHearthCss(): Promise<string> {
  return readFile(join(import.meta.dir, "..", "src/app/wall/hearth.css"), "utf8");
}

/** The design-system page that states the ported card metrics to a reader. */
const WALL_PAGE = join(import.meta.dir, "..", "..", "..", "design-system/ts-ha/pages/wall.md");

async function readWallPage(): Promise<string> {
  return readFile(WALL_PAGE, "utf8");
}

/**
 * The value cell of the page's table row whose first cell is `firstCell`, or `null`
 * when the page has no such row.
 */
function pageMetricValue(page: string, firstCell: string): string | null {
  for (const line of page.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").map((cell) => cell.trim());
    if (cells[1] === firstCell) return cells[2] ?? null;
  }
  return null;
}

/**
 * Every ported metric and the token name it is declared under, with the value as the
 * CSS text the token must carry.
 */
const PORTED_TOKENS: readonly { token: string; value: string }[] = [
  { token: "--hearth-card-icon-size", value: `${WALL_CARD_METRICS.iconSize}px` },
  { token: "--hearth-card-icon-symbol", value: `${WALL_CARD_METRICS.iconSymbol}em` },
  { token: "--hearth-card-primary-size", value: `${WALL_CARD_METRICS.primarySize}px` },
  { token: "--hearth-card-primary-weight", value: `${WALL_CARD_METRICS.primaryWeight}` },
  { token: "--hearth-card-primary-leading", value: `${WALL_CARD_METRICS.primaryLeading}px` },
  { token: "--hearth-card-primary-tracking", value: `${WALL_CARD_METRICS.primaryTracking}px` },
  { token: "--hearth-card-secondary-size", value: `${WALL_CARD_METRICS.secondarySize}px` },
  { token: "--hearth-card-secondary-weight", value: `${WALL_CARD_METRICS.secondaryWeight}` },
  { token: "--hearth-card-secondary-leading", value: `${WALL_CARD_METRICS.secondaryLeading}px` },
  { token: "--hearth-card-secondary-tracking", value: `${WALL_CARD_METRICS.secondaryTracking}px` },
  { token: "--hearth-card-control-height", value: `${WALL_CARD_METRICS.controlHeight}px` },
  { token: "--hearth-card-control-radius", value: `${WALL_CARD_METRICS.controlRadius}px` },
  { token: "--hearth-card-control-spacing", value: `${WALL_CARD_METRICS.controlSpacing}px` },
  { token: "--hearth-card-padding", value: `${WALL_CARD_METRICS.padding}px` },
  { token: "--hearth-card-radius", value: `${WALL_CARD_METRICS.radius}px` },
  { token: "--hearth-card-slider-height", value: `${WALL_CARD_METRICS.sliderHeight}px` },
  { token: "--hearth-card-slider-radius", value: `${WALL_CARD_METRICS.sliderRadius}px` },
  { token: "--hearth-card-slider-thumb", value: `${WALL_CARD_METRICS.sliderThumb}px` },
  { token: "--hearth-card-slider-thumb-radius", value: `${WALL_CARD_METRICS.sliderThumbRadius}px` },
];

/**
 * Every ported metric as the design-system page must state it: the page's value cells
 * add a human note after the number, so the prefix is asserted.
 */
const PORTED_PAGE_ROWS: readonly { readonly row: string; readonly value: string }[] = [
  { row: "`--hearth-card-icon-size`", value: `${WALL_CARD_METRICS.iconSize} px` },
  { row: "glyph", value: `${WALL_CARD_GLYPH_SIZE} px` },
  { row: "`--hearth-card-primary-size`", value: `${WALL_CARD_METRICS.primarySize} px` },
  { row: "`--hearth-card-primary-weight`", value: `${WALL_CARD_METRICS.primaryWeight}` },
  { row: "`--hearth-card-primary-leading`", value: `${WALL_CARD_METRICS.primaryLeading} px` },
  { row: "`--hearth-card-primary-tracking`", value: `${WALL_CARD_METRICS.primaryTracking} px` },
  { row: "`--hearth-card-secondary-size`", value: `${WALL_CARD_METRICS.secondarySize} px` },
  { row: "`--hearth-card-secondary-weight`", value: `${WALL_CARD_METRICS.secondaryWeight}` },
  { row: "`--hearth-card-secondary-leading`", value: `${WALL_CARD_METRICS.secondaryLeading} px` },
  { row: "`--hearth-card-secondary-tracking`", value: `${WALL_CARD_METRICS.secondaryTracking} px` },
  { row: "`--hearth-card-control-height`", value: `${WALL_CARD_METRICS.controlHeight} px` },
  { row: "`--hearth-card-control-radius`", value: `${WALL_CARD_METRICS.controlRadius} px` },
  { row: "`--hearth-card-control-spacing`", value: `${WALL_CARD_METRICS.controlSpacing} px` },
  { row: "`--hearth-card-padding`", value: `${WALL_CARD_METRICS.padding} px` },
  { row: "`--hearth-card-radius`", value: `${WALL_CARD_METRICS.radius} px` },
  { row: "`--hearth-card-slider-height`", value: `${WALL_CARD_METRICS.sliderHeight} px` },
  { row: "`--hearth-card-slider-radius`", value: `${WALL_CARD_METRICS.sliderRadius} px` },
  { row: "`--hearth-card-slider-thumb`", value: `${WALL_CARD_METRICS.sliderThumb} px` },
  {
    row: "`--hearth-card-slider-thumb-radius`",
    value: `${WALL_CARD_METRICS.sliderThumbRadius} px`,
  },
];

describe("the ported card metrics", () => {
  it("ports Mushroom's values", () => {
    expect(WALL_CARD_METRICS.iconSize).toBe(36);
    expect(WALL_CARD_METRICS.iconSymbol).toBe(0.667);
    expect(WALL_CARD_METRICS.iconShapeRadius).toBe("50%");
    expect(WALL_CARD_METRICS.primarySize).toBe(14);
    expect(WALL_CARD_METRICS.primaryWeight).toBe(500);
    expect(WALL_CARD_METRICS.primaryLeading).toBe(20);
    expect(WALL_CARD_METRICS.primaryTracking).toBe(0.1);
    expect(WALL_CARD_METRICS.secondarySize).toBe(12);
    expect(WALL_CARD_METRICS.secondaryWeight).toBe(400);
    expect(WALL_CARD_METRICS.secondaryLeading).toBe(16);
    expect(WALL_CARD_METRICS.secondaryTracking).toBe(0.4);
    expect(WALL_CARD_METRICS.controlHeight).toBe(42);
    expect(WALL_CARD_METRICS.controlRadius).toBe(12);
    expect(WALL_CARD_METRICS.controlSpacing).toBe(12);
    expect(WALL_CARD_METRICS.padding).toBe(10);
    expect(WALL_CARD_METRICS.radius).toBe(12);
    expect(WALL_CARD_METRICS.sliderHeight).toBe(42);
    expect(WALL_CARD_METRICS.sliderRadius).toBe(12);
    expect(WALL_CARD_METRICS.sliderThumb).toBe(10);
    expect(WALL_CARD_METRICS.sliderThumbRadius).toBe(3);
  });

  it("derives the 24px glyph from the icon size at the ported symbol ratio", () => {
    expect(WALL_CARD_GLYPH_SIZE).toBe(24);
  });
});

describe("hearth.css card tokens", () => {
  it("declares every ported metric with the ported value", async () => {
    const tokens = darkTokens(await readHearthCss());

    for (const { token, value } of PORTED_TOKENS) {
      expect(tokens[token]).toBe(value);
    }
  });

  it("declares the icon shape as a circle and the slider's thumb colour", async () => {
    const tokens = darkTokens(await readHearthCss());

    expect(tokens["--hearth-card-icon-shape"]).toBe("50%");
    expect(tokens["--hearth-card-slider-thumb-color"]).toBe("var(--hearth-text)");
  });

  it("declares each ported token once, as the wall's own (Wall Visual Language)", async () => {
    const css = stripCssComments(await readHearthCss());

    for (const { token } of PORTED_TOKENS) {
      const declarations = css.match(new RegExp(`${token}:`, "g")) ?? [];
      expect(declarations).toHaveLength(1);
    }
  });

  it("declares the accent's 20%-alpha field in both schemes", async () => {
    const css = stripCssComments(await readHearthCss());
    const boundary = css.indexOf(LIGHT_RULE);
    const dark = css.slice(0, boundary);
    const light = css.slice(boundary);

    expect(dark).toContain("--hearth-accent-faint:");
    expect(light).toContain("--hearth-accent-faint:");
  });

  it("re-draws the slider chrome from the ported tokens", async () => {
    const css = stripCssComments(await readHearthCss());

    expect(css).toContain(".hearth-card-slider");
    expect(css).toContain("::-webkit-slider-thumb");
    expect(css).toContain("var(--hearth-card-slider-thumb)");
    expect(css).toContain("var(--hearth-card-slider-thumb-radius)");
    expect(css).toContain("var(--hearth-card-slider-thumb-color)");
    expect(css).toContain("var(--hearth-card-slider-height)");
  });
});

describe("the design-system page's ported metric table", () => {
  it("states every value hearth.css and metrics.ts declare", async () => {
    const page = await readWallPage();

    for (const { row, value } of PORTED_PAGE_ROWS) {
      const stated = pageMetricValue(page, row);
      expect(stated, `the page must carry a row for ${row}`).not.toBeNull();
      expect(stated?.startsWith(value), `${row} must state "${value}", got "${stated}"`).toBe(true);
    }
  });

  it("states the icon shape as a circle and the 36/24 icon pair", async () => {
    const page = await readWallPage();

    expect(pageMetricValue(page, "`--hearth-card-icon-shape`")).toContain(
      WALL_CARD_METRICS.iconShapeRadius,
    );
    // The 36 px icon and its 24 px glyph, stated as the rounded symbol ratio.
    expect(pageMetricValue(page, "glyph")).toContain(`${WALL_CARD_METRICS.iconSize} px`);
    expect(pageMetricValue(page, "glyph")).toContain(`${WALL_CARD_GLYPH_SIZE} px`);
  });
});
