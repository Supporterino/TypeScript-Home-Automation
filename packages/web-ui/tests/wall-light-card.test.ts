import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Capability } from "@ts-ha/shared";
import {
  writableColorCapability,
  writableColorTemperatureCapability,
} from "../src/app/lib/capability-ranking.js";
import { WALL_MIN_TOUCH_TARGET } from "../src/app/wall/registry.js";
import { wallTileMetrics } from "../src/app/wall/scale.js";

/**
 * The wall light card's controls (tasks 2.6, 3.1; design.md D7, D12, D13;
 * specs/wall-display "Wall Device Presentation"). The colour /
 * colour-temperature selection is pure and covered directly — including that a
 * control is omitted when the capability is absent — while the tile's render
 * decisions have no DOM harness here, so they are asserted structurally against
 * the shared tile's source, the same style as `wall-card-archetypes.test.ts`.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const TILE = join(APP_DIR, "components/DeviceTile.tsx");

const rw = { readable: true, writable: true };
const ro = { readable: true, writable: false };

function onOff(property = "on"): Capability {
  return { kind: "switch", property, access: rw, valueType: "boolean" };
}

function numeric(property: string, access = rw, extra: Partial<Capability> = {}): Capability {
  return { kind: "numeric", property, access, valueType: "numeric", ...extra };
}

function light(features: Capability[]): Capability {
  return { kind: "light", access: rw, valueType: "composite", features };
}

/** Removes block and line comments so prose is not mistaken for rendered text. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function tileSource(): Promise<string> {
  return stripComments(await readFile(TILE, "utf8"));
}

/**
 * Isolates the wall light-card branch of the tile source — from the archetype
 * check to the generic fallback — so its assertions are light-card-specific and
 * never match another archetype's markup.
 */
function lightBranch(source: string): string {
  const start = source.indexOf("} else if (lightCard && actionCapability && brightnessCapability)");
  return source.slice(start, source.indexOf("} else {", start));
}

describe("writableColorTemperatureCapability", () => {
  it("finds a writable colour temperature the light card can drive", () => {
    const capabilities = [
      light([
        onOff("state"),
        numeric("brightness"),
        numeric("color_temp", rw, { range: { min: 153, max: 500 } }),
      ]),
    ];
    expect(writableColorTemperatureCapability(capabilities)?.property).toBe("color_temp");
  });

  it("returns undefined when the device declares no colour temperature", () => {
    expect(
      writableColorTemperatureCapability([onOff("state"), numeric("brightness")]),
    ).toBeUndefined();
  });

  it("returns undefined when the colour temperature is read-only", () => {
    expect(writableColorTemperatureCapability([numeric("color_temp", ro)])).toBeUndefined();
  });

  it("returns undefined for a non-numeric colour temperature", () => {
    const capabilities: Capability[] = [
      { kind: "enum", property: "color_temp", access: rw, valueType: "enum" },
    ];
    expect(writableColorTemperatureCapability(capabilities)).toBeUndefined();
  });
});

describe("writableColorCapability", () => {
  it("finds a writable hue — the canonical colour channel", () => {
    // Nanoleaf authors hue/saturation directly; a Zigbee colour light exposes
    // hue beneath its `color` composite.
    const capabilities = [numeric("hue", rw, { range: { min: 0, max: 360 } })];
    expect(writableColorCapability(capabilities)?.property).toBe("hue");
  });

  it("finds a writable numeric color", () => {
    expect(writableColorCapability([numeric("color")])?.property).toBe("color");
  });

  it("returns undefined when the device declares no colour channel", () => {
    expect(
      writableColorCapability([onOff("state"), numeric("brightness"), numeric("color_temp")]),
    ).toBeUndefined();
  });

  it("returns undefined when the colour is read-only", () => {
    expect(writableColorCapability([numeric("hue", ro)])).toBeUndefined();
  });

  it("returns undefined for a composite colour it cannot drive from one control", () => {
    const capabilities: Capability[] = [
      { kind: "composite", property: "color", access: rw, valueType: "composite" },
    ];
    expect(writableColorCapability(capabilities)).toBeUndefined();
  });
});

describe("wall light card source", () => {
  it("presents a touch-sized device-icon on/off affordance and a full-width brightness bar", async () => {
    const source = await tileSource();
    expect(source).toContain('archetype === "light"');
    expect(source).toContain("<Lightbulb");
    // The badge is the on/off affordance, its fill encoding state without colour.
    expect(source).toContain("aria-pressed={lightOn}");
    expect(source).toContain('fill="currentColor"');
    // The brightness bar is a full-width value control.
    expect(source).toContain('type="range"');
    expect(source).toContain("aria-label={brightnessCapability.property}");
    expect(source).toContain('width: "100%"');
  });

  it("turns the light on from the bar's off state and shows a percentage readout", async () => {
    const source = await tileSource();
    expect(source).toContain("if (!lightOn)");
    expect(source).toContain("deviceTileToggledValue(actionCapability, actionControl.value)");
    expect(source).toContain(
      "formatBrightnessPercent(brightnessControl.value, brightnessCapability.range)",
    );
    expect(source).toContain('"Off"');
  });

  it("offers colour controls only for a declared capability, never inert", async () => {
    const source = await tileSource();
    expect(source).toContain("writableColorTemperatureCapability(device.capabilities)");
    expect(source).toContain("writableColorCapability(device.capabilities)");
    expect(source).toContain("{colorTemperatureCapability && (");
    expect(source).toContain("{colorCapability && (");
  });

  it("sizes its toggle and value controls to the wall's touch target", async () => {
    const source = await tileSource();
    // The badge and each bar are sized from the wall's control metric, so every
    // affordance meets the kiosk-class target (specs/wall-display "Controls are
    // touch-sized"; design.md D4, D12).
    expect(source).toContain("const controlHeight = metrics?.control ?? 56");
    expect(source).toContain("width: controlHeight");
    expect(source).toContain("height: controlHeight");
    expect(wallTileMetrics("wall").control).toBeGreaterThanOrEqual(WALL_MIN_TOUCH_TARGET);
  });

  it("separates its adjacent controls by at least the wall's control floor", async () => {
    const source = await tileSource();
    // Hearth's space-3 (12px) is the wall stack's gap, ≥ the 8px control floor.
    expect(source).toContain("--hearth-space-3");
  });

  it("carries the group marker in its header for parity with the other archetypes", async () => {
    const source = await tileSource();
    const branch = lightBranch(source);
    expect(branch).toContain("{isGroup && <GroupMarker wall={wall} />}");
  });
});
