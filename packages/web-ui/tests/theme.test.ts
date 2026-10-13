import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Pure test — no DOM. It parses the shipped Tailwind entry stylesheet
// (`styles/app.css`, the single source of the Lumen tokens) and asserts the
// design-system contract directly against the declared blocks, so a token
// drift fails here (design.md D3, D4; specs/web-ui "Visual Design System",
// "Self-Hosted Typography").

const APP_DIR = join(import.meta.dirname, "../src/app");
const CSS = readFileSync(join(APP_DIR, "styles/app.css"), "utf8");

/** The stock primary blue the Lumen accent replaced — the accent must not be it. */
const LEGACY_STOCK_BLUE = "#228be6";

/** Extracts the declaration body of the first `${selector} { ... }` block. */
function blockFor(selector: string): string {
  const start = CSS.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`selector block not found: ${selector}`);
  const open = CSS.indexOf("{", start);
  const close = CSS.indexOf("}", open);
  return CSS.slice(open + 1, close);
}

/** Parses `--name: value;` declarations from a block body into a record. */
function tokensIn(body: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens[match[1].replace(/^--/, "")] = match[2].trim();
  }
  return tokens;
}

function parseHex(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** The bitwise inverse of a `#rrggbb` colour, used to prove light is designed. */
function invertHex(hex: string): string {
  const [r, g, b] = parseHex(hex);
  const toHex = (n: number): string => (255 - n).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const SCHEMES = {
  dark: tokensIn(blockFor(":root")),
  light: tokensIn(blockFor('[data-theme="light"]')),
} as const;

const SURFACES = ["bg", "surface", "surface-2"] as const;
const STATE_COLORS = ["on", "stale", "danger", "info"] as const;
const COLOUR_TOKENS = [
  "bg",
  "surface",
  "surface-2",
  "surface-3",
  "hairline",
  "text",
  "text-muted",
  "on",
  "stale",
  "danger",
  "info",
  "accent",
  "accent-fg",
  "focus",
] as const;

describe("Lumen colour tokens", () => {
  it("defines the full colour token set in both schemes", () => {
    for (const [scheme, tokens] of Object.entries(SCHEMES)) {
      for (const token of COLOUR_TOKENS) {
        expect(tokens[token], `${scheme} is missing --${token}`).toBeTruthy();
      }
    }
  });

  it("keeps body text at WCAG AA (4.5:1) on every surface in both schemes", () => {
    for (const [scheme, tokens] of Object.entries(SCHEMES)) {
      for (const surface of SURFACES) {
        const ratio = contrast(tokens.text, tokens[surface]);
        expect(
          ratio,
          `${scheme}: --text on --${surface} = ${ratio.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps secondary text at WCAG AA on tile and raised surfaces", () => {
    for (const [scheme, tokens] of Object.entries(SCHEMES)) {
      for (const surface of ["surface", "surface-2"] as const) {
        const ratio = contrast(tokens["text-muted"], tokens[surface]);
        expect(
          ratio,
          `${scheme}: --text-muted on --${surface} = ${ratio.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps semantic state colors above the 3:1 non-text contrast threshold", () => {
    for (const [scheme, tokens] of Object.entries(SCHEMES)) {
      for (const state of STATE_COLORS) {
        const ratio = contrast(tokens[state], tokens.surface);
        expect(
          ratio,
          `${scheme}: --${state} on --surface = ${ratio.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe("Lumen theme selection sources", () => {
  it("declares the two schemes separately, not by inverting one into the other", () => {
    expect(CSS).toContain(":root {");
    expect(CSS).toContain('[data-theme="light"] {');

    for (const token of COLOUR_TOKENS) {
      const dark = SCHEMES.dark[token];
      const light = SCHEMES.light[token];
      // Each scheme must carry its own value — light is not just dark re-used.
      if (dark?.startsWith("#") && light?.startsWith("#")) {
        expect(light, `--${token} is identical in both schemes`).not.toBe(dark);
        expect(light, `--${token} is a mechanical inversion of the dark value`).not.toBe(
          invertHex(dark),
        );
      }
    }
  });

  it("picks an accent that is not the legacy stock blue", () => {
    expect(SCHEMES.dark.accent.toLowerCase()).not.toBe(LEGACY_STOCK_BLUE);
    expect(SCHEMES.light.accent.toLowerCase()).not.toBe(LEGACY_STOCK_BLUE);
  });

  it("suppresses non-essential motion under prefers-reduced-motion", () => {
    const marker = "@media (prefers-reduced-motion: reduce)";
    expect(CSS).toContain(marker);

    const block = CSS.slice(CSS.indexOf(marker));
    expect(block).toContain("animation: none");
    expect(block).toContain("transition-duration");
  });

  it("self-hosts the display face from a relative woff2 url", () => {
    expect(CSS).toContain("@font-face");
    expect(CSS).toContain('url("../fonts/plus-jakarta-sans-latin.woff2")');
    expect(CSS).not.toMatch(/url\(\s*["']?https?:/);
    expect(existsSync(join(APP_DIR, "fonts/plus-jakarta-sans-latin.woff2"))).toBe(true);
  });
});
