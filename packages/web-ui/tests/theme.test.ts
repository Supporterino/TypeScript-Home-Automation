import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ambientTheme } from "../src/app/theme.js";
import { AMBIENT_COLORS, MANTINE_DEFAULT_PRIMARY } from "../src/app/tokens.js";

// Pure test — no DOM. It parses the shipped token stylesheet and imports the
// token/theme modules, so a drift between the two fails here (design.md D1;
// specs/web-ui "Visual Design System", "Self-Hosted Typography").

const APP_DIR = join(import.meta.dirname, "../src/app");
const CSS = readFileSync(join(APP_DIR, "styles/tokens.css"), "utf8");

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

const SCHEMES = {
  dark: tokensIn(blockFor(":root")),
  light: tokensIn(blockFor('[data-mantine-color-scheme="light"]')),
} as const;

const SURFACES = ["bg", "surface", "surface-2"] as const;
const STATE_COLORS = ["on", "stale", "danger", "info"] as const;

describe("Ambient Glass tokens", () => {
  it("defines the full color token set in both schemes", () => {
    for (const [scheme, tokens] of Object.entries(SCHEMES)) {
      for (const token of [...SURFACES, "hairline", "text", "text-muted", ...STATE_COLORS]) {
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

describe("Ambient Glass primary accent", () => {
  it("is the Ambient Glass sky scale, not Mantine's default blue", () => {
    expect(ambientTheme.primaryColor).toBe("ambient");
    expect(AMBIENT_COLORS).not.toContain(MANTINE_DEFAULT_PRIMARY);
  });
});

describe("token stylesheet", () => {
  it("defines both schemes", () => {
    expect(CSS).toContain(":root {");
    expect(CSS).toContain('[data-mantine-color-scheme="light"] {');
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
