import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { EnergyData, WeatherData } from "@ts-ha/shared";
import {
  type DataStoreFixtures,
  seedDataStore,
  sourcesFromApi,
} from "../src/app/lib/data-store.js";
import { FAVORITES_STATE_KEY, favoritesFromState } from "../src/app/lib/favorites.js";
import type {
  Automation,
  DeviceDescriptor,
  RoomWithMembers,
  TransportState,
} from "../src/app/types.js";
import { collectAppModules } from "./import-graph.js";

/**
 * The data layer's fixture seam (tasks 1.1-1.3; design.md D5; specs/web-ui
 * "Data Sources" — "Components render from an explicitly supplied fixture
 * set", "A deployment cannot select fixture data", "Supplying fixtures does
 * not change the API path").
 *
 * The seed and the sourcing decision are pure functions of the fixture set and
 * are called directly here. The wiring — that the provider consults them, and
 * that the snapshot fetch and the stream subscription now sit behind the
 * fixture gate — is asserted structurally, since this suite has no DOM, in the
 * style `wall-reconnect.test.ts` and `wall-single-surface.test.ts` established.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const DATA_STORE = join(APP_DIR, "lib/data-store.tsx");

/**
 * Runtime reads that could select fixture data behind the caller's back, in a
 * deployment or a development session alike.
 */
const RUNTIME_SELECTION_TOKENS: readonly RegExp[] = [
  /\bprocess\.env\b/,
  /\bimport\.meta\.env\b/,
  /\blocation\s*\.\s*(?:search|hash|href)\b/,
  /\bURLSearchParams\b/,
  /\bdocument\s*\.\s*cookie\b/,
  /\b(?:localStorage|sessionStorage)\b/,
];

/** Every token that makes up the fixture seam; all of them are web-ui-internal. */
const FIXTURE_SEAM_TOKENS: readonly RegExp[] = [
  /\bfixtures\b/,
  /\bDataStoreFixtures\b/,
  /\bseedDataStore\b/,
  /\bsourcesFromApi\b/,
];

function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function dataStoreSource(): Promise<string> {
  return stripComments(await readFile(DATA_STORE, "utf8"));
}

function device(qualifiedId: string, displayName = qualifiedId): DeviceDescriptor {
  return {
    source: "zigbee",
    id: qualifiedId,
    qualifiedId,
    displayName,
    state: { on: true },
    capabilities: [],
    reachable: true,
    observation: { mode: "push", observedAt: 0 },
    hidden: false,
  };
}

function room(id: string, name: string, members: string[]): RoomWithMembers {
  return {
    id,
    name,
    members: members.map((qualifiedId) => ({
      qualifiedId,
      available: true,
      device: device(qualifiedId),
    })),
  };
}

function scene(name: string): Automation {
  return { name, enabled: true, triggers: [{ type: "cron" }] };
}

function weather(): WeatherData {
  return {
    location: { latitude: 52.52, longitude: 13.405 },
    current: {
      temperature: 18.4,
      feelsLike: 17.1,
      humidity: 62,
      pressure: 1013,
      condition: "clouds",
      description: "partly cloudy",
      wind: { speed: 3.4, direction: 225 },
      cloudCover: 40,
      timestamp: 1_760_000_000,
    },
    forecast: [],
  };
}

function energy(): EnergyData {
  return { powerWatts: 1_234, energyWh: 12_480, breakdown: [], history: [] };
}

function createFixtures(
  transport: TransportState = "live",
  readings: Partial<DataStoreFixtures> = {},
): DataStoreFixtures {
  return {
    devices: [device("zigbee:0x1", "Kitchen light"), device("zigbee:0x2"), device("zigbee:0x9")],
    state: { night_mode: true, [FAVORITES_STATE_KEY]: ["zigbee:0x1"] },
    rooms: [room("living-room", "Living Room", ["zigbee:0x1", "zigbee:0x2"])],
    automations: [scene("evening-scene")],
    transport,
    ...readings,
  };
}

describe("seedDataStore", () => {
  it("starts from the empty defaults the API path has always used when no fixture set is supplied", () => {
    const seed = seedDataStore(undefined);

    expect(seed.devicesByQualifiedId.size).toBe(0);
    expect(seed.roomDefs.size).toBe(0);
    expect(seed.roomAssignments.size).toBe(0);
    expect(seed.state).toEqual({});
    expect(seed.automations).toEqual([]);
    expect(seed.transport).toBe("connecting");
    expect(seed.weather).toBeUndefined();
    expect(seed.energy).toBeUndefined();
  });

  it("keys the fixture devices by qualified identifier", () => {
    const fixtures = createFixtures();
    const seed = seedDataStore(fixtures);

    expect([...seed.devicesByQualifiedId.keys()]).toEqual([
      "zigbee:0x1",
      "zigbee:0x2",
      "zigbee:0x9",
    ]);
    expect(seed.devicesByQualifiedId.get("zigbee:0x1")).toBe(fixtures.devices[0]);
  });

  it("splits a fixture room into a definition and one assignment per member", () => {
    const seed = seedDataStore(createFixtures());

    expect(seed.roomDefs.get("living-room")).toEqual({ id: "living-room", name: "Living Room" });
    expect([...seed.roomAssignments.entries()]).toEqual([
      ["zigbee:0x1", "living-room"],
      ["zigbee:0x2", "living-room"],
    ]);
  });

  it("carries the fixture state, automations, and transport through unchanged", () => {
    const fixtures = createFixtures();
    const seed = seedDataStore(fixtures);

    expect(seed.state).toBe(fixtures.state);
    expect(seed.automations).toBe(fixtures.automations);
    expect(seed.transport).toBe("live");
  });

  it("seeds a store whose favorites derive from the fixture state", () => {
    const seed = seedDataStore(createFixtures());

    expect(favoritesFromState(seed.state)).toEqual(["zigbee:0x1"]);
  });

  it("carries a supplied weather and energy reading through, and none when absent", () => {
    const readings = { weather: weather(), energy: energy() };
    const seeded = seedDataStore(createFixtures("live", readings));

    expect(seeded.weather).toBe(readings.weather);
    expect(seeded.energy).toBe(readings.energy);

    // The two fields are optional: a fixture set without them leaves both
    // widgets sourcing their own reading exactly as they do today.
    const withoutReadings = seedDataStore(createFixtures());
    expect(withoutReadings.weather).toBeUndefined();
    expect(withoutReadings.energy).toBeUndefined();
  });
});

describe("sourcesFromApi", () => {
  it("sources from the API only when the caller supplied no fixture set", () => {
    expect(sourcesFromApi(undefined)).toBe(true);
    expect(sourcesFromApi(createFixtures())).toBe(false);
  });
});

describe("DataStoreProvider fixture wiring", () => {
  it("seeds every value the wall's widgets read from the fixture set", async () => {
    const store = await dataStoreSource();

    expect(store).toContain("seedDataStore(fixtures)");
    for (const field of [
      "automations",
      "devicesByQualifiedId",
      "roomAssignments",
      "roomDefs",
      "state",
      "transport",
    ]) {
      expect(store).toContain(`seed.${field}`);
    }
  });

  it("gates the snapshot fetch and the stream subscription on the fixture decision", async () => {
    const store = await dataStoreSource();
    const gate = store.indexOf("if (!sourcesFromApi(fixtures)) return;");

    expect(gate).toBeGreaterThanOrEqual(0);
    expect(store.indexOf("await refresh()")).toBeGreaterThan(gate);
    expect(store.indexOf("openEventStream()")).toBeGreaterThan(gate);
  });

  it("declares the fixture set only as the provider's optional React prop", async () => {
    const store = await dataStoreSource();

    expect(store).toContain("fixtures?: DataStoreFixtures");
    expect(store).toContain("seedDataStore(fixtures)");
  });

  it("exposes the fixture readings read-only through its context value", async () => {
    const store = await dataStoreSource();

    // Declared on the consumed value and populated from the seed: the two wall
    // widgets read them, and there is no setter to write them back.
    expect(store).toContain("fixtureWeather: WeatherData | WeatherUnavailable | undefined;");
    expect(store).toContain("fixtureEnergy: EnergyData | undefined;");
    expect(store).toContain("fixtureWeather: seed.weather");
    expect(store).toContain("fixtureEnergy: seed.energy");
  });

  it("keeps the widget-side reading decision free of any runtime selection", async () => {
    const store = await dataStoreSource();

    // `sourcesOwnReading`'s only input is the reading itself, so it sits inside
    // the same scan the sourcing decision does.
    expect(store).toContain("export function sourcesOwnReading<T>(reading: T | undefined)");
    expect(RUNTIME_SELECTION_TOKENS.filter((token) => token.test(store))).toEqual([]);
  });
});

describe("fixture seam reachability", () => {
  it("reads no environment variable, query parameter, or configuration key", async () => {
    const store = await dataStoreSource();

    expect(RUNTIME_SELECTION_TOKENS.filter((token) => token.test(store))).toEqual([]);
  });

  it("scans the module graph the entrypoint actually ships (guard is not vacuous)", async () => {
    // The shipped app is the entrypoint's own module graph, so that is what is
    // scanned: a module the build never reaches cannot supply a fixture set.
    const graph = await collectAppModules();

    expect(graph.files.length).toBeGreaterThan(100);
    expect(graph.files).toContain(DATA_STORE);
    expect(graph.files.some((file) => file.endsWith("/App.tsx"))).toBe(true);
  });

  it("recognises a runtime selection when one is present (the scan is not vacuous)", () => {
    const planted =
      'const env = process.env.WALL_FIXTURES ?? new URLSearchParams(location.search).get("fixtures");';
    const stored = 'const kept = localStorage.getItem("fixtures");';

    expect(RUNTIME_SELECTION_TOKENS.filter((token) => token.test(planted))).toHaveLength(3);
    expect(RUNTIME_SELECTION_TOKENS.filter((token) => token.test(stored))).toHaveLength(1);
  });

  it("supplies a fixture set from no shipped module but the harness", async () => {
    // Reachability, not a directory sweep: the harness is a development-only
    // surface in its own documents (and `wall-harness-guard.test.ts` asserts it
    // is unreachable from the entrypoint), so every module *this* walk reaches
    // is one of the shipped app's own — and none of them may supply fixtures.
    // The store itself is the declaration site, so it is the one exclusion.
    const graph = await collectAppModules();
    const offenders: string[] = [];
    for (const file of graph.files) {
      if (file === DATA_STORE) continue;
      const content = stripComments(await readFile(file, "utf8"));
      if (FIXTURE_SEAM_TOKENS.some((token) => token.test(content))) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });
});
