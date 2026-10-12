import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { deviceTileObservationText } from "../src/app/wall/scale.js";

/**
 * Structural assertions for the wall card archetypes (tasks 3.1, 3.2, 3.4).
 * There is no DOM harness here, so the render decisions are asserted against
 * the shared tile's source — the same style as `wall-read-only.test.ts` — while
 * the pure decisions (which control set, which surface, the `%` formatting) are
 * covered by `card-archetype.test.ts`.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const TILE = join(APP_DIR, "components/DeviceTile.tsx");

/** Removes block and line comments so prose is not mistaken for rendered text. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function tileSource(): Promise<string> {
  return stripComments(await readFile(TILE, "utf8"));
}

describe("light card rendering", () => {
  it("renders a brightness slider and an on/off toggle in the light branch", async () => {
    const source = await tileSource();
    expect(source).toContain('archetype === "light"');
    expect(source).toContain("<Slider");
    expect(source).toContain("<CapabilityControl");
    expect(source).toContain("aria-label={brightnessCapability.property}");
    expect(source).toContain("capability={actionCapability}");
  });

  it("shows a persistent percentage readout, not only the slider's hover label", async () => {
    const source = await tileSource();
    expect(source).toContain("formatBrightnessPercent(brightnessControl.value");
    expect(source).toContain("formatBrightnessPercent(value, brightnessCapability.range)");
  });

  it("drives the toggle and the brightness through independent optimistic channels", async () => {
    const source = await tileSource();
    expect(source).toContain("onChange={actionControl.setValue}");
    expect(source).toContain("brightnessControl.setValue(value)");
  });
});

describe("readout card rendering", () => {
  it("renders a chrome-less dominant value with a quiet label", async () => {
    const source = await tileSource();
    expect(source).toContain('archetype === "readout"');
    expect(source).toContain("WALL_METRIC_FONT_SIZE");
    expect(source).toContain("WALL_BODY_FONT_SIZE");
    expect(source).toContain("humanizeDeviceName(device.displayName)");
  });

  it("draws no surface for a readout through the pure surface decision", async () => {
    const source = await tileSource();
    expect(source).toContain("cardDrawsNoSurface(archetype, wall, contained === true)");
  });

  it("carries the Hidden badge and the group marker into the chrome-less layout", async () => {
    const source = await tileSource();
    // Isolate the readout branch from the archetype check to the next `{header}`
    // render, so the assertions are readout-specific rather than matching the
    // footer/header markup the other archetypes share.
    const start = source.indexOf('archetype === "readout"');
    const branch = source.slice(start, source.indexOf("{header}", start));
    expect(branch).toContain("device.hidden");
    expect(branch).toContain("<GroupMarker");
  });
});

describe("observation indicator", () => {
  it("demotes the wall observation to a glyph-only indicator, keeping the label accessible", async () => {
    const source = await tileSource();
    expect(source).toContain("aria-label={observation.label}");
    expect(source).toContain("title={observation.label}");
    // The wall's glyph-only branch renders no child label text.
    expect(source).toContain('role="img"');
  });

  it("keeps the visible observation label — including the polled age — on the dashboard", async () => {
    const source = await tileSource();
    const allUses = [...source.matchAll(/observation\.label/g)].length;
    const attributeUses = [...source.matchAll(/\w[\w-]*=\{observation\.label\}/g)].length;
    // At least one use is a child-text render (the visible label), not an attribute.
    expect(allUses).toBeGreaterThan(attributeUses);
  });

  it("gates the visible label behind the size-keyed presentation decision", async () => {
    const source = await tileSource();
    expect(source).toContain("deviceTileObservationText(size)");
    expect(source).toContain("showLabel");
    expect(source).toContain("{showLabel && (");
  });

  it("keeps the observation glyph shape and token as the non-color channel", async () => {
    const source = await tileSource();
    expect(source).toContain("observation.icon");
    expect(source).toContain("observation.token");
  });

  it("prints no literal live/polled text on the card face", async () => {
    const source = await tileSource();
    expect(source).not.toContain("polled");
    expect(source).not.toMatch(/["'`]live["'`]/);
  });
});

describe("deviceTileObservationText", () => {
  it("demotes the observation label to non-textual on the wall only", () => {
    expect(deviceTileObservationText("wall")).toBe(false);
    expect(deviceTileObservationText("default")).toBe(true);
    expect(deviceTileObservationText()).toBe(true);
  });
});
