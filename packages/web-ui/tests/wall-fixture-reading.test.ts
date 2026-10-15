import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sourcesOwnReading } from "../src/app/lib/data-store.js";

/**
 * The two wall widgets that source their own ambient reading prefer a
 * caller-supplied fixture (task 1.4; design.md D5; specs/web-ui "Data Sources"
 * — "A widget that sources its own reading prefers the fixture", "A component
 * that sources a reading outside the data layer MUST render a caller-supplied
 * fixture for that reading when one is present, and MUST source it exactly as
 * it does today when none is supplied").
 *
 * The decision is pure and is called directly; the wiring — that each widget's
 * only fetch site sits behind it, and that every reload path routes through
 * that site — is asserted structurally, since this suite has no DOM, in the
 * style `wall-reconnect.test.ts` and `wall-single-surface.test.ts` established.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const WEATHER_WIDGET = join(APP_DIR, "wall/widgets/WeatherWidget.tsx");
const ENERGY_WIDGET = join(APP_DIR, "wall/widgets/EnergyWidget.tsx");

/** Removes block and line comments so prose about a fetch is not mistaken for one. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function source(path: string): Promise<string> {
  return stripComments(await readFile(path, "utf8"));
}

/**
 * The widget's loader callback — the only place in either module that can issue
 * a request, so the gate's position inside it is what every path depends on.
 */
function loaderBody(content: string): string {
  const start = content.indexOf("const load = useCallback(");
  return content.slice(start, content.indexOf("}, [", start));
}

/** How many times a module calls its loader, i.e. how many paths can trigger a fetch. */
function loadCalls(content: string): number {
  return content.match(/void load\(\)/g)?.length ?? 0;
}

describe("sourcesOwnReading", () => {
  it("sources a reading exactly when none was supplied", () => {
    expect(sourcesOwnReading(undefined)).toBe(true);
    expect(sourcesOwnReading({ available: false, reason: "no_location" })).toBe(false);
  });

  it("treats an empty-but-supplied reading as supplied", () => {
    const empty = { powerWatts: 0, energyWh: 0, breakdown: [], history: [] };
    expect(sourcesOwnReading(empty)).toBe(false);
  });
});

describe("the weather widget's fixture reading", () => {
  it("renders the supplied reading and gates its only fetch behind it", async () => {
    const weather = await source(WEATHER_WIDGET);
    const load = loaderBody(weather);

    // The reading is the widget's own data, and the gate precedes the request.
    expect(weather).toContain("useState<WeatherData | WeatherUnavailable | null>(");
    expect(weather).toContain("fixtureWeather ?? null");
    expect(load).toContain("if (!sourcesOwnReading(fixtureWeather)) return;");
    expect(load).toContain("await fetchWeather()");
    expect(load.indexOf("await fetchWeather()")).toBeGreaterThan(
      load.indexOf("sourcesOwnReading(fixtureWeather)"),
    );
    expect(weather.match(/await fetchWeather\(\)/g) ?? []).toHaveLength(1);
  });

  it("keeps every reload path behind that one gated fetch site", async () => {
    const weather = await source(WEATHER_WIDGET);

    // The mount load and the reconnect refetch both call `load`, and `load` is
    // the module's only fetch, so with a reading neither can reach the network.
    expect(loadCalls(weather)).toBe(2);
  });
});

describe("the energy widget's fixture reading", () => {
  it("renders the supplied reading and gates its only fetch behind it", async () => {
    const energy = await source(ENERGY_WIDGET);
    const load = loaderBody(energy);

    expect(energy).toContain("useState<EnergyData | null>(fixtureEnergy ?? null)");
    expect(load).toContain("if (!sourcesOwnReading(fixtureEnergy)) return;");
    expect(load).toContain("await fetchEnergy()");
    expect(load.indexOf("await fetchEnergy()")).toBeGreaterThan(
      load.indexOf("sourcesOwnReading(fixtureEnergy)"),
    );
    expect(energy.match(/await fetchEnergy\(\)/g) ?? []).toHaveLength(1);
  });

  it("keeps the debounced device-event reload behind that one gated fetch site", async () => {
    const energy = await source(ENERGY_WIDGET);

    // The mount load, the reconnect refetch, and the debounced device-event
    // refetch all call `load` — the only fetch site — so a supplied reading
    // silences the reload too, not just the mount load.
    expect(loadCalls(energy)).toBe(3);
    expect(energy).toContain("return subscribe((event) => {");
  });
});
