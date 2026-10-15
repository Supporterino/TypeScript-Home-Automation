import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { WALL_CARD_METRICS } from "../src/app/wall/cards/metrics.js";
import {
  WALL_BAND_FONT_SIZE,
  WALL_BODY_FONT_SIZE,
  WALL_HERO_FONT_SIZE,
  WALL_LABEL_FONT_SIZE,
  WALL_METRIC_FONT_SIZE,
  WALL_TITLE_FONT_SIZE,
  WALL_TYPE_RAMP,
} from "../src/app/wall/type-ramp.js";

// Pure ramp bounds — no DOM (wall-zones-and-fit D6, D10; mushroom-wall-widgets
// W2; specs/wall-display "Wall Glanceability"). The change reduces the wall's
// component scale ~25–30 %, moves its two smallest tiers onto the ported card
// system's primary (14 px) and secondary (12 px) sizes, and retires the compact
// status-chip exception — so the floor is the ported secondary size and no tier
// sits below it. The page that declares the ramp to a reader is a declaration
// site too (`design-system/ts-ha/pages/wall.md`), so it is asserted here; Hearth
// must re-derive the same bounds, so the stylesheet is asserted against the ramp
// as well.

/** The dashboard's largest type; the wall's rendered readouts must exceed it. */
const DASHBOARD_TYPE_CEILING_PX = 34;

/**
 * One `vmin` on the wall's own target panel, in CSS pixels. The panel is
 * 1920 × 1080 (wall-zones-and-fit D7), so `vmin` is 1 % of 1080 = 10.8 px and a
 * `clamp(...)` token resolves at its `vmin` term unless a bound caps it.
 */
const PANEL_VMIN_PX = 10.8;

/** The pre-change ramp table (design.md D10's "before" column), for the reduction assertion. */
const PRE_CHANGE = {
  hero: "clamp(48px, 7vmin, 104px)",
  metric: "clamp(36px, 5vmin, 76px)",
  title: "clamp(20px, 2.5vmin, 28px)",
  label: 20,
  bodyFloor: 18,
} as const;

/** The bounds and `vmin` coefficient of a `clamp(<min>px, <coeff>vmin, <max>px)` token. */
function clampToken(token: string): { min: number; coefficient: number; max: number } {
  const match = token.match(/^clamp\((\d+(?:\.\d+)?)px, (\d+(?:\.\d+)?)vmin, (\d+(?:\.\d+)?)px\)$/);
  if (!match) throw new Error(`not a clamp token: ${token}`);
  return { min: Number(match[1]), coefficient: Number(match[2]), max: Number(match[3]) };
}

/** The size a `clamp(...)` token resolves to on the wall's own panel. */
function panelSize(token: string): number {
  const { min, coefficient, max } = clampToken(token);
  return Math.min(max, Math.max(min, coefficient * PANEL_VMIN_PX));
}

/** The numeric value of an `<n>px` token. */
function px(token: string): number {
  const match = token.match(/^(\d+(?:\.\d+)?)px$/);
  if (!match) throw new Error(`not a px token: ${token}`);
  return Number(match[1]);
}

/** The light scheme's rule selector — the boundary between the two token blocks. */
const LIGHT_RULE = '[data-theme="light"] [data-wall-chunk]';

/** Removes block comments so a token named in prose is not read as a declaration. */
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** The token declarations of one scheme in `wall/hearth.css`. */
function hearthTokens(css: string, scheme: "dark" | "light"): Record<string, string> {
  const body = stripCssComments(css);
  const boundary = body.indexOf(LIGHT_RULE);
  const block = scheme === "dark" ? body.slice(0, boundary) : body.slice(boundary);
  const tokens: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/(--hearth-[\w-]+):\s*([^;{]+);/g)) {
    if (name !== undefined && value !== undefined) tokens[name] = value.trim();
  }
  return tokens;
}

async function readHearthCss(): Promise<string> {
  return readFile(join(import.meta.dir, "..", "src/app/wall/hearth.css"), "utf8");
}

/** The design-system page that states the ramp to a reader — a declaration site this test reads. */
const WALL_PAGE = join(import.meta.dir, "..", "..", "..", "design-system/ts-ha/pages/wall.md");

async function readWallPage(): Promise<string> {
  return readFile(WALL_PAGE, "utf8");
}

/**
 * The size cell of the page's type-ramp row whose first cell is `tier`, with
 * Markdown emphasis stripped (`**12 px**` → `12 px`, `` `clamp(…)` `` → the
 * token). Returns `null` when the page carries no such row, so a table that lost
 * a tier fails here rather than silently asserting nothing.
 */
function pageRampRow(page: string, tier: string): string | null {
  for (const line of page.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").map((cell) => cell.trim());
    if (cells[1] === tier) return cells[2]?.replace(/[`*]/g, "").trim() ?? null;
  }
  return null;
}

describe("WALL_TYPE_RAMP", () => {
  it("declares its own body floor at the ported card system's secondary size", () => {
    // specs/wall-display "The ramp defines the body floor": the floor is the
    // ported secondary size, and no tier sits below it.
    expect(WALL_TYPE_RAMP.bodyMin).toBe(WALL_CARD_METRICS.secondarySize);
    expect(px(WALL_BODY_FONT_SIZE)).toBe(WALL_TYPE_RAMP.bodyMin);

    // The label tier is the ported primary size (specs/wall-display "Supporting
    // text is drawn at the ported sizes").
    expect(WALL_TYPE_RAMP.label).toBe(WALL_CARD_METRICS.primarySize);
    expect(px(WALL_LABEL_FONT_SIZE)).toBe(WALL_TYPE_RAMP.label);

    const tiers = [
      WALL_TYPE_RAMP.label,
      WALL_TYPE_RAMP.titleMin,
      WALL_TYPE_RAMP.bandMin,
      WALL_TYPE_RAMP.metricMin,
      WALL_TYPE_RAMP.heroMin,
    ];
    for (const size of tiers) expect(size).toBeGreaterThanOrEqual(WALL_TYPE_RAMP.bodyMin);
  });

  it("declares no tier below the floor — the chip exception retires", () => {
    // With the floor at the ported secondary size there is nothing left below it
    // to except, so the tier and its token are gone (mushroom-wall-widgets W2).
    expect(Object.keys(WALL_TYPE_RAMP)).not.toContain("chip");
  });

  it("renders every readout above the dashboard's 34px ceiling", () => {
    // The bounds are the walls' floors; what a viewer sees is the size the panel
    // resolves, which is what must stay above the dashboard's scale.
    expect(panelSize(WALL_HERO_FONT_SIZE)).toBeGreaterThan(DASHBOARD_TYPE_CEILING_PX);
    expect(panelSize(WALL_METRIC_FONT_SIZE)).toBeGreaterThan(DASHBOARD_TYPE_CEILING_PX);
  });
});

describe("the reduced component scale", () => {
  it("lowers the hero, metric, and title tokens below the pre-change ramp", () => {
    expect(panelSize(WALL_HERO_FONT_SIZE)).toBeLessThan(panelSize(PRE_CHANGE.hero));
    expect(panelSize(WALL_METRIC_FONT_SIZE)).toBeLessThan(panelSize(PRE_CHANGE.metric));
    expect(panelSize(WALL_TITLE_FONT_SIZE)).toBeLessThan(panelSize(PRE_CHANGE.title));
  });

  it("lowers every `vmin` coefficient so the reduction holds at any panel size", () => {
    expect(clampToken(WALL_HERO_FONT_SIZE).coefficient).toBeLessThan(
      clampToken(PRE_CHANGE.hero).coefficient,
    );
    expect(clampToken(WALL_METRIC_FONT_SIZE).coefficient).toBeLessThan(
      clampToken(PRE_CHANGE.metric).coefficient,
    );
    expect(clampToken(WALL_TITLE_FONT_SIZE).coefficient).toBeLessThan(
      clampToken(PRE_CHANGE.title).coefficient,
    );
  });

  it("lowers the label tier and the body floor to the ported sizes", () => {
    expect(WALL_TYPE_RAMP.label).toBeLessThan(PRE_CHANGE.label);
    expect(WALL_TYPE_RAMP.bodyMin).toBeLessThan(PRE_CHANGE.bodyFloor);
    expect(WALL_TYPE_RAMP.label).toBe(WALL_CARD_METRICS.primarySize);
    expect(WALL_TYPE_RAMP.bodyMin).toBe(WALL_CARD_METRICS.secondarySize);
  });

  it("keeps the token bounds and coefficients in the tokens", () => {
    const readouts = [
      { token: WALL_HERO_FONT_SIZE, min: WALL_TYPE_RAMP.heroMin, max: WALL_TYPE_RAMP.heroMax },
      {
        token: WALL_METRIC_FONT_SIZE,
        min: WALL_TYPE_RAMP.metricMin,
        max: WALL_TYPE_RAMP.metricMax,
      },
      {
        token: WALL_BAND_FONT_SIZE,
        min: WALL_TYPE_RAMP.bandMin,
        max: WALL_TYPE_RAMP.bandMax,
      },
      { token: WALL_TITLE_FONT_SIZE, min: WALL_TYPE_RAMP.titleMin, max: WALL_TYPE_RAMP.titleMax },
    ] as const;

    for (const { token, min, max } of readouts) {
      const bounds = clampToken(token);
      expect(bounds.min).toBe(min);
      expect(bounds.max).toBe(max);
      expect(bounds.max).toBeGreaterThan(bounds.min);
    }
  });
});

describe("the band-readout tier", () => {
  it("sits above the body floor and below the hero", () => {
    expect(WALL_TYPE_RAMP.bandMin).toBeGreaterThanOrEqual(WALL_TYPE_RAMP.bodyMin);
    expect(WALL_TYPE_RAMP.bandMax).toBeLessThan(WALL_TYPE_RAMP.heroMin);
  });

  it("sits between the label and metric tiers", () => {
    expect(WALL_TYPE_RAMP.bandMin).toBeGreaterThanOrEqual(WALL_TYPE_RAMP.label);
    expect(WALL_TYPE_RAMP.bandMax).toBeLessThanOrEqual(WALL_TYPE_RAMP.metricMax);
    expect(panelSize(WALL_BAND_FONT_SIZE)).toBeGreaterThan(px(WALL_LABEL_FONT_SIZE));
    expect(panelSize(WALL_BAND_FONT_SIZE)).toBeLessThan(panelSize(WALL_METRIC_FONT_SIZE));
  });

  it("orders the ramp from the body floor up to the hero readout", () => {
    expect(WALL_TYPE_RAMP.titleMin).toBeGreaterThanOrEqual(WALL_TYPE_RAMP.label);
    expect(WALL_TYPE_RAMP.titleMax).toBeLessThanOrEqual(WALL_TYPE_RAMP.metricMin);
    expect(WALL_TYPE_RAMP.bandMin).toBeLessThan(WALL_TYPE_RAMP.metricMax);
    expect(WALL_TYPE_RAMP.heroMin).toBeGreaterThanOrEqual(WALL_TYPE_RAMP.metricMin);
    expect(WALL_TYPE_RAMP.heroMax).toBeGreaterThan(WALL_TYPE_RAMP.heroMin);
    expect(WALL_TYPE_RAMP.metricMax).toBeGreaterThan(WALL_TYPE_RAMP.metricMin);
  });
});

describe("hearth.css", () => {
  it("declares numeric bounds agreeing with the ramp", async () => {
    const tokens = hearthTokens(await readHearthCss(), "dark");

    expect(px(tokens["--hearth-text-label"] ?? "")).toBe(WALL_TYPE_RAMP.label);
    expect(px(tokens["--hearth-text-body"] ?? "")).toBe(WALL_TYPE_RAMP.bodyMin);
    expect(tokens["--hearth-text-hero"]).toBe(WALL_HERO_FONT_SIZE);
    expect(tokens["--hearth-text-metric"]).toBe(WALL_METRIC_FONT_SIZE);
    expect(tokens["--hearth-text-band"]).toBe(WALL_BAND_FONT_SIZE);
    expect(tokens["--hearth-text-title"]).toBe(WALL_TITLE_FONT_SIZE);
  });

  it("drops the retired chip token", async () => {
    const tokens = hearthTokens(await readHearthCss(), "dark");

    expect(tokens["--hearth-text-chip"]).toBeUndefined();
  });

  it("states the supporting tiers as the ported type sizes", async () => {
    const tokens = hearthTokens(await readHearthCss(), "dark");

    // The label tier is the ported primary size and the floor the ported
    // secondary size, so a widget's supporting text and a device card's cannot
    // disagree (mushroom-wall-widgets W2).
    expect(px(tokens["--hearth-text-label"] ?? "")).toBe(
      px(tokens["--hearth-card-primary-size"] ?? ""),
    );
    expect(px(tokens["--hearth-text-body"] ?? "")).toBe(
      px(tokens["--hearth-card-secondary-size"] ?? ""),
    );
  });

  it("declares the band token in both schemes", async () => {
    const css = await readHearthCss();

    expect(hearthTokens(css, "dark")["--hearth-band"]).toBeDefined();
    expect(hearthTokens(css, "light")["--hearth-band"]).toBeDefined();
  });
});

describe("the design-system page's type-ramp table", () => {
  it("states every tier the ramp and the tokens declare", async () => {
    const page = await readWallPage();

    const rows = [
      { tier: "Hero", value: WALL_HERO_FONT_SIZE },
      { tier: "Metric", value: WALL_METRIC_FONT_SIZE },
      { tier: "Band", value: WALL_BAND_FONT_SIZE },
      { tier: "Title", value: WALL_TITLE_FONT_SIZE },
      { tier: "Label", value: `${WALL_TYPE_RAMP.label} px` },
      { tier: "Body (floor)", value: `${WALL_TYPE_RAMP.bodyMin} px` },
    ] as const;

    for (const { tier, value } of rows) {
      const stated = pageRampRow(page, tier);
      expect(stated, `the page must state "${value}" for ${tier}, got "${stated}"`).toBe(value);
    }
  });

  it("states the compact status-chip exception as retired", async () => {
    const stated = pageRampRow(await readWallPage(), "Chip");

    expect(stated, "the page must carry a Chip row").not.toBeNull();
    expect(stated?.toLowerCase()).toContain("retired");
    expect(Object.keys(WALL_TYPE_RAMP)).not.toContain("chip");
  });
});
