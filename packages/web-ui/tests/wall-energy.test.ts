import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { EnergyData } from "@ts-ha/shared";
import { ENERGY_DEVICE_EVENT_CATEGORIES, isEnergyRelevantEvent } from "../src/app/lib/energy.js";
import { WALL_CARD_GLYPH_SIZE, WALL_CARD_METRICS } from "../src/app/wall/cards/metrics.js";
import { WALL_TYPE_RAMP } from "../src/app/wall/type-ramp.js";
import { coveredSpanLabel, energyDisplay } from "../src/app/wall/widgets/energy-model.js";

/**
 * The energy widget: the reading mapping and refetch trigger are pure; the
 * renderer's composition is asserted structurally.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const RENDERER = join(APP_DIR, "wall/widgets/EnergyWidget.tsx");
const MODEL = join(APP_DIR, "wall/widgets/energy-model.ts");
const ANATOMY = join(APP_DIR, "wall/cards/card-anatomy.tsx");

/** Removes block and line comments so prose is not mistaken for code. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function source(path: string): Promise<string> {
  return stripComments(await readFile(path, "utf8"));
}

describe("coveredSpanLabel", () => {
  it("labels whole hours as hours and every other span in minutes", () => {
    expect(coveredSpanLabel(1440)).toBe("last 24h");
    expect(coveredSpanLabel(360)).toBe("last 6h");
    expect(coveredSpanLabel(60)).toBe("last 1h");
    expect(coveredSpanLabel(90)).toBe("last 90m");
    expect(coveredSpanLabel(45)).toBe("last 45m");
  });

  it("rounds a reported span to the minute it is nearest", () => {
    // The aggregator derives the extent from sample timestamps, so a span is rarely
    // exactly whole: the label is the nearest minute rather than a fraction.
    expect(coveredSpanLabel(359.6)).toBe("last 6h");
    expect(coveredSpanLabel(7.4)).toBe("last 7m");
  });

  it("floors a sub-minute span at one minute rather than drawing last 0m", () => {
    // A supported short sample interval (ENERGY_SAMPLE_MS < 60000) covers a span
    // below half a minute; the span is still genuinely covered, so it labels as a
    // whole minute beside its value instead of `last 0m` next to a zero-looking
    // number.
    expect(coveredSpanLabel(1 / 6)).toBe("last 1m");
    expect(coveredSpanLabel(0)).toBe("last 1m");
  });
});

/** The endpoint's response, with the windowed usage fields overridable. */
function energy(overrides: Partial<EnergyData> = {}): EnergyData {
  return {
    powerWatts: 1234.4,
    energyWh: 1250,
    breakdown: [
      {
        qualifiedId: "shelly:kitchen",
        displayName: "Kitchen",
        powerWatts: 1234.4,
        energyWh: 1250,
        available: true,
      },
    ],
    history: [],
    ...overrides,
  };
}

describe("energyDisplay", () => {
  it("maps the power and the metering-device count to display strings", () => {
    expect(energyDisplay(energy())).toEqual({
      power: "1,234 W",
      usage: { status: "absent" },
      meteringCount: 1,
    });
  });

  it("renders zero totals and no metering devices without error", () => {
    const empty: EnergyData = { powerWatts: 0, energyWh: 0, breakdown: [], history: [] };
    expect(energyDisplay(empty)).toEqual({
      power: "0 W",
      usage: { status: "absent" },
      meteringCount: 0,
    });
  });

  it("maps a full window's usage to its value labelled with the window", () => {
    const display = energyDisplay(
      energy({ usageWh: 1250, windowMinutes: 1440, coveredMinutes: 1440 }),
    );

    expect(display.usage).toEqual({ status: "covered", value: "1.25 kWh", span: "last 24h" });
  });

  it("labels a partial window with the span it actually covers", () => {
    const display = energyDisplay(
      energy({ usageWh: 900, windowMinutes: 1440, coveredMinutes: 360 }),
    );

    // The reading is the extent the samples cover — never presented as a full-window
    // figure, and never labelled with the window it has not filled.
    expect(display.usage).toEqual({ status: "covered", value: "0.90 kWh", span: "last 6h" });
  });

  it("presents an uncovered window as absent rather than as a zero", () => {
    // Nothing has been covered: the response carries no usage, so the widget draws no
    // reading at all rather than a zero or a placeholder.
    expect(energyDisplay(energy({ windowMinutes: 1440 })).usage).toEqual({ status: "absent" });
    expect(energyDisplay(energy()).usage).toEqual({ status: "absent" });
  });

  it("presents no cumulative lifetime total", () => {
    // `energyWh` is the lifetime total the dashboard draws; the wall's reading is the
    // windowed usage alone.
    const display = energyDisplay(
      energy({ energyWh: 987_654, usageWh: 1250, windowMinutes: 1440, coveredMinutes: 1440 }),
    );

    expect(Object.keys(display).sort()).toEqual(["meteringCount", "power", "usage"]);
    expect(JSON.stringify(display)).not.toContain("987.65");
  });
});

describe("energy refetch trigger", () => {
  it("refetches on every device event category and nothing else", () => {
    for (const category of ENERGY_DEVICE_EVENT_CATEGORIES) {
      expect(isEnergyRelevantEvent({ category })).toBe(true);
    }
    expect(isEnergyRelevantEvent({ category: "readiness", ready: true })).toBe(false);
    expect(isEnergyRelevantEvent({ category: "unknown" })).toBe(false);
  });
});

describe("EnergyWidget renderer", () => {
  it("presents each reading on the ported state item, led by the ported circular affordance", async () => {
    const renderer = await source(RENDERER);

    // One state item per reading: the ported circular affordance beside a label over
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

    // "Power" and the covered span are the widget's labels, handed to the vocabulary's
    // own label part.
    expect(renderer).toContain("<WallCardStateItem");
    expect(renderer).toContain("label={label}");
    expect(anatomy).toContain("<WallCardLabel>{label}</WallCardLabel>");
    expect(anatomy).toContain("size ?? WALL_CARD_PRIMARY_FONT_SIZE");
  });

  it("keeps each metric's value on the wall's metric tier, above the ported type sizes", async () => {
    const renderer = await source(RENDERER);

    // A readout's value keeps the wall's own distance tier.
    expect(renderer).toContain("reading={value}");
    expect(renderer).toContain("readingSize={WALL_METRIC_FONT_SIZE}");
    expect(WALL_TYPE_RAMP.metricMin).toBeGreaterThan(WALL_CARD_METRICS.primarySize);
    expect(WALL_TYPE_RAMP.metricMin).toBeGreaterThan(WALL_CARD_METRICS.secondarySize);
  });

  it("presents the windowed usage labelled with its covered span, and no lifetime total", async () => {
    const renderer = await source(RENDERER);

    // The usage is drawn in place of the cumulative total, labelled with the span the
    // samples cover.
    expect(renderer).toContain('display.usage.status === "covered"');
    expect(renderer).toContain("label={display.usage.span}");
    expect(renderer).toContain("value={display.usage.value}");
    // No lifetime consumption figure reaches the wall: neither the model's retired
    // `consumption` string nor the endpoint's `energyWh` is drawn here.
    expect(renderer).not.toContain("consumption");
    expect(renderer).not.toContain("energyWh");
    expect(renderer).not.toContain("Total");
  });

  it("draws no usage reading at all when nothing has been covered", async () => {
    const renderer = await source(RENDERER);
    const model = await source(MODEL);

    // An uncovered window is absent rather than a zero or a placeholder line, so the
    // usage is guarded by its own presence and the model names the absent state.
    expect(renderer).toContain('display.usage.status === "covered" &&');
    expect(model).toContain('{ status: "absent" }');
    expect(renderer).not.toContain("—");
  });
});
