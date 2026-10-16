import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { WeatherData, WeatherUnavailable } from "@ts-ha/shared";
import { unavailableMessage } from "../src/app/lib/weather.js";
import { WALL_CARD_GLYPH_SIZE, WALL_CARD_METRICS } from "../src/app/wall/cards/metrics.js";
import {
  minimumRendererBoxHeightPx,
  rendererBoxHeightPx,
  wallFrameDrawsSurface,
} from "../src/app/wall/frame.js";
import { ROW_UNIT_MAX, ROW_UNIT_MIN } from "../src/app/wall/grid.js";
import { WALL_WIDGET_REGISTRY } from "../src/app/wall/registry.js";
import { cardHeightPx } from "../src/app/wall/span.js";
import { WALL_TYPE_RAMP } from "../src/app/wall/type-ramp.js";
import {
  WEATHER_DETAIL_COMPOSITION_HEIGHT_PX,
  WEATHER_FULL_COMPOSITION_HEIGHT_PX,
  WEATHER_STATE_ITEM_HEIGHT_PX,
  weatherCompositionHeightPx,
  weatherForecastDays,
  weatherWidgetComposition,
  weatherWidgetState,
} from "../src/app/wall/widgets/weather-model.js";

/**
 * The weather widget: the reading and its containment through the pure model; the
 * renderer's composition asserted structurally.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const RENDERER = join(APP_DIR, "wall/widgets/WeatherWidget.tsx");
const ANATOMY = join(APP_DIR, "wall/cards/card-anatomy.tsx");

/** Removes block and line comments so prose is not mistaken for code. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function source(path: string): Promise<string> {
  return stripComments(await readFile(path, "utf8"));
}

const conditions: WeatherData = {
  location: { latitude: 52.52, longitude: 13.4 },
  current: {
    temperature: 18.4,
    feelsLike: 17.9,
    humidity: 61,
    pressure: 1013,
    condition: "clear",
    description: "clear sky",
    wind: { speed: 3.2, direction: 90 },
    cloudCover: 5,
    timestamp: 1_700_000_000,
  },
  forecast: [],
};

describe("weatherWidgetState", () => {
  it("reports loading before a response arrives", () => {
    expect(weatherWidgetState(null, null)).toEqual({ status: "loading" });
  });

  it("reports a transport error without throwing", () => {
    expect(weatherWidgetState(null, "boom")).toEqual({ status: "error", message: "boom" });
  });

  it("maps each unconfigured marker to the unavailable state", () => {
    for (const reason of ["service_unregistered", "no_location"] as const) {
      const marker: WeatherUnavailable = { available: false, reason };
      expect(weatherWidgetState(marker, null)).toEqual({ status: "unavailable", reason });
    }
  });

  it("explains an unconfigured widget within its own area", () => {
    const state = weatherWidgetState({ available: false, reason: "service_unregistered" }, null);
    if (state.status !== "unavailable") throw new Error("expected the unavailable state");
    expect(unavailableMessage(state.reason).length).toBeGreaterThan(0);
  });

  it("prefers a surfaced error over a stale value", () => {
    expect(weatherWidgetState(conditions, "down")).toEqual({ status: "error", message: "down" });
  });

  it("passes conditions through when the service is configured", () => {
    expect(weatherWidgetState(conditions, null)).toEqual({ status: "ready", data: conditions });
  });
});

describe("weatherForecastDays", () => {
  it("maps forecast days for the compact wall readout", () => {
    const withForecast: WeatherData = {
      ...conditions,
      forecast: [
        {
          date: "2026-10-12",
          tempHigh: 19.6,
          tempLow: 9.2,
          condition: "rain",
          description: "light rain",
          precipitationChance: 0.4,
          wind: { speed: 2, direction: 180 },
        },
      ],
    };

    const days = weatherForecastDays(withForecast);
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({
      date: "2026-10-12",
      condition: "rain",
      high: 20,
      low: 9,
    });
    expect(days[0]?.label.length).toBeGreaterThan(0);
  });

  it("returns no forecast days when the service provides none", () => {
    expect(weatherForecastDays(conditions)).toEqual([]);
  });
});

describe("WeatherWidget renderer", () => {
  it("leads with the ported circular affordance at the ported glyph size", async () => {
    const renderer = await source(RENDERER);

    // The condition glyph, the humidity/wind glyphs and every forecast glyph are the
    // ported circular tinted shape at the ported glyph side.
    expect(renderer).toContain("WallCardIcon");
    expect(renderer).toContain("WallCardStateItem");
    expect(renderer).toContain("WALL_CARD_GLYPH_SIZE");
    expect(renderer).not.toMatch(/size=\{\d+\}/);
    expect(renderer).not.toMatch(/conditionIcon\([^)]*,\s*\d/);
    expect(WALL_CARD_GLYPH_SIZE).toBe(
      Math.round(WALL_CARD_METRICS.iconSize * WALL_CARD_METRICS.iconSymbol),
    );
  });

  it("draws the condition as the vocabulary's primary line", async () => {
    const renderer = await source(RENDERER);
    const anatomy = await source(ANATOMY);

    // The condition description is the widget's caption, handed to the vocabulary's
    // own label part.
    expect(renderer).toContain("label={current.description}");
    expect(anatomy).toContain("<WallCardLabel>{label}</WallCardLabel>");
    expect(anatomy).toContain("size ?? WALL_CARD_PRIMARY_FONT_SIZE");
  });

  it("draws every supporting figure at the ported secondary size", async () => {
    const renderer = await source(RENDERER);

    // The humidity, the wind and the forecast captions are supporting figures, drawn
    // at the ported secondary size rather than at a tier of the widget's own.
    expect(renderer).toContain("WALL_CARD_SECONDARY_FONT_SIZE");
    expect(renderer).not.toContain("WALL_BODY_FONT_SIZE");
    expect(WALL_CARD_METRICS.secondarySize).toBeLessThan(WALL_CARD_METRICS.primarySize);
  });

  it("keeps the temperature on the wall's metric tier, above the ported type sizes", async () => {
    const renderer = await source(RENDERER);

    // A readout's value keeps the wall's own distance tier, and the value stays with
    // its unit as one run.
    expect(renderer).toMatch(/reading=\{`\$\{Math\.round\(current\.temperature\)\}°C`\}/);
    expect(renderer).toContain("readingSize={WALL_METRIC_FONT_SIZE}");
    expect(WALL_TYPE_RAMP.metricMin).toBeGreaterThan(WALL_CARD_METRICS.primarySize);
    expect(WALL_TYPE_RAMP.metricMin).toBeGreaterThan(WALL_CARD_METRICS.secondarySize);
  });
});

/**
 * The renderer box a `rows`-row cell of the weather type gets at `rowUnit`,
 * derived through the wall's own functions.
 */
function weatherBoxFor(rows: number, rowUnit: number): number {
  const descriptor = WALL_WIDGET_REGISTRY.weather;
  return rendererBoxHeightPx({
    cellHeightPx: cardHeightPx({ rows, rowUnit }),
    framed: wallFrameDrawsSurface(descriptor.type, descriptor.grammar),
    titled: false,
  });
}

describe("the weather widget composes for its box", () => {
  it("resolves each composition at its own budget's threshold", () => {
    // Each threshold is the budget of the composition it selects, so the widget draws
    // a part only where the box holds it.
    expect(weatherWidgetComposition(WEATHER_FULL_COMPOSITION_HEIGHT_PX)).toBe("full");
    expect(weatherWidgetComposition(WEATHER_FULL_COMPOSITION_HEIGHT_PX - 1)).toBe("detail");
    expect(weatherWidgetComposition(WEATHER_DETAIL_COMPOSITION_HEIGHT_PX)).toBe("detail");
    expect(weatherWidgetComposition(WEATHER_DETAIL_COMPOSITION_HEIGHT_PX - 1)).toBe("readout");
    // The budgets step by the parts they add: the state item, then the detail block,
    // then the forecast block.
    expect(WEATHER_DETAIL_COMPOSITION_HEIGHT_PX).toBeGreaterThan(WEATHER_STATE_ITEM_HEIGHT_PX);
    expect(WEATHER_FULL_COMPOSITION_HEIGHT_PX).toBeGreaterThan(
      WEATHER_DETAIL_COMPOSITION_HEIGHT_PX,
    );
  });

  it("composes for the space it has, at a short box and a tall box", () => {
    const descriptor = WALL_WIDGET_REGISTRY.weather;
    // The frame's floor for the type — the box a minimum-span card is guaranteed —
    // and the type's largest legal span. The two must present different parts.
    const shortBox = minimumRendererBoxHeightPx({
      descriptor,
      rowUnit: ROW_UNIT_MIN,
      framed: wallFrameDrawsSurface(descriptor.type, descriptor.grammar),
    });
    const tallBox = weatherBoxFor(descriptor.max.h, ROW_UNIT_MAX);

    expect(weatherWidgetComposition(shortBox)).toBe("detail");
    expect(weatherWidgetComposition(tallBox)).toBe("full");
  });

  it("fits the widget's own minimum-span cell at the wall's floors", () => {
    // The composition a minimum-span card draws fits that cell. The fullest composition
    // does not fit it, so the forecast is dropped rather than clipped.
    const descriptor = WALL_WIDGET_REGISTRY.weather;
    const shortBox = minimumRendererBoxHeightPx({
      descriptor,
      rowUnit: ROW_UNIT_MIN,
      framed: wallFrameDrawsSurface(descriptor.type, descriptor.grammar),
    });

    const composition = weatherWidgetComposition(shortBox);
    expect(composition).not.toBe("full");
    expect(weatherCompositionHeightPx(composition)).toBeLessThanOrEqual(shortBox);
  });

  it("draws the condition and its temperature in every composition, and gates the rest", async () => {
    const renderer = await source(RENDERER);

    // The composition is resolved from the box the frame handed the renderer.
    expect(renderer).toContain("weatherWidgetComposition(rendererHeightPx)");
    expect(renderer).toContain("data-composition={composition}");
    // The leading affordance and its temperature reading are drawn before — and
    // outside — every gate, so what is read at distance survives every composition.
    const stateItem = renderer.indexOf("<WallCardStateItem");
    const detailsGate = renderer.indexOf("{drawsDetails && (");
    const forecastGate = renderer.indexOf("{drawsForecast &&");
    expect(stateItem).toBeGreaterThan(-1);
    expect(detailsGate).toBeGreaterThan(stateItem);
    expect(forecastGate).toBeGreaterThan(detailsGate);
    // The details are dropped in the readout composition; the forecast only where
    // the box holds the full one.
    expect(renderer).toContain('const drawsDetails = composition !== "readout"');
    expect(renderer).toContain('const drawsForecast = composition === "full"');
  });
});
