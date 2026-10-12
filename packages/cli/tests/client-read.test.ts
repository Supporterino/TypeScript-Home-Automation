import { afterEach, describe, expect, it, mock } from "bun:test";
import type { CurrentWeather, DeviceDescriptor, WeatherData } from "@ts-ha/shared";
import { DebugClient } from "../src/client.js";
import { isStreamAuthError } from "../src/event-stream.js";

// specs/cli "Engine Communication" (task 2.1) — read surfaces added in Phase 2.

const originalFetch = globalThis.fetch;

function mockFetch(body: unknown, status = 200): ReturnType<typeof mock> {
  const fn = mock(
    async () =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

function calls(fn: ReturnType<typeof mock>): [string, RequestInit][] {
  return fn.mock.calls as [string, RequestInit][];
}

function descriptor(overrides: Partial<DeviceDescriptor> = {}): DeviceDescriptor {
  return {
    source: "zigbee",
    id: "0x1",
    qualifiedId: "zigbee:0x1",
    displayName: "Light",
    state: {},
    capabilities: [],
    reachable: true,
    observation: { mode: "push", observedAt: 0 },
    hidden: false,
    ...overrides,
  };
}

function weatherData(): WeatherData {
  const current: CurrentWeather = {
    temperature: 18,
    feelsLike: 17,
    humidity: 60,
    pressure: 1013,
    condition: "clear",
    description: "clear sky",
    wind: { speed: 2, direction: 180 },
    cloudCover: 5,
    timestamp: 1_700_000_000,
  };
  return {
    location: { latitude: 48.1, longitude: 11.5 },
    current,
    forecast: [
      {
        date: "2026-05-01",
        tempHigh: 20,
        tempLow: 10,
        condition: "rain",
        description: "light rain",
        precipitationChance: 0.6,
        wind: { speed: 3, direction: 90 },
      },
    ],
  };
}

describe("DebugClient read surfaces", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches an automation's execution history", async () => {
    const history = {
      name: "motion-light",
      history: [
        {
          startedAt: 1_700_000_000_000,
          trigger: { type: "cron" as const, expression: "0 * * * *", firedAt: new Date(0) },
          durationMs: 5,
          outcome: "success" as const,
        },
      ],
    };
    mockFetch(history);

    const client = new DebugClient("engine");
    const result = await client.getAutomationHistory("motion-light");
    expect(result.name).toBe("motion-light");
    expect(result.history).toHaveLength(1);
    expect(result.history[0].durationMs).toBe(5);
    expect(result.history[0].outcome).toBe("success");
    expect(calls(globalThis.fetch as unknown as ReturnType<typeof mock>)[0][0]).toBe(
      "http://engine/api/automations/motion-light/history",
    );
  });

  it("fetches an automation's relationships", async () => {
    const relationships = {
      name: "motion-light",
      declared: { requiredServices: [], relatedDevices: ["sensor"], watchedStateKeys: ["night"] },
      observed: { writtenStateKeys: ["motion-light:on"], truncated: false },
    };
    mockFetch(relationships);

    const client = new DebugClient("engine");
    await expect(client.getAutomationRelationships("motion-light")).resolves.toEqual(relationships);
  });

  it("fetches the energy snapshot", async () => {
    const energy = {
      powerWatts: 42,
      energyWh: 1000,
      breakdown: [{ qualifiedId: "shelly:tv", displayName: "TV", powerWatts: 42, available: true }],
      history: [],
    };
    mockFetch(energy);

    const client = new DebugClient("engine");
    await expect(client.getEnergy()).resolves.toEqual(energy);
    expect(calls(globalThis.fetch as unknown as ReturnType<typeof mock>)[0][0]).toBe(
      "http://engine/api/energy",
    );
  });

  it("returns weather data on success", async () => {
    mockFetch(weatherData());

    const client = new DebugClient("engine");
    const result = await client.getWeather();

    expect("available" in result).toBe(false);
    expect(calls(globalThis.fetch as unknown as ReturnType<typeof mock>)[0][0]).toBe(
      "http://engine/api/weather",
    );
  });

  it("maps a 404 weather response to the service_unregistered marker", async () => {
    mockFetch({ available: false, reason: "service_unregistered" }, 404);

    const client = new DebugClient("engine");
    await expect(client.getWeather()).resolves.toEqual({
      available: false,
      reason: "service_unregistered",
    });
  });

  it("maps a 400 weather response to the no_location marker", async () => {
    mockFetch({ available: false, reason: "no_location" }, 400);

    const client = new DebugClient("engine");
    await expect(client.getWeather()).resolves.toEqual({
      available: false,
      reason: "no_location",
    });
  });

  it("throws for a weather failure that is not an unavailable marker", async () => {
    mockFetch({ error: "Weather service unavailable" }, 502);

    const client = new DebugClient("engine");
    await expect(client.getWeather()).rejects.toThrow("Weather service unavailable");
  });

  it("fetches rooms with members", async () => {
    const rooms = { rooms: [{ id: "living", name: "Living Room", members: [] }], count: 1 };
    mockFetch(rooms);

    const client = new DebugClient("engine");
    await expect(client.getRooms()).resolves.toEqual(rooms);
    expect(calls(globalThis.fetch as unknown as ReturnType<typeof mock>)[0][0]).toBe(
      "http://engine/api/rooms",
    );
  });

  it("fetches unassigned devices", async () => {
    const unassigned = { devices: [descriptor()], count: 1 };
    mockFetch(unassigned);

    const client = new DebugClient("engine");
    await expect(client.getUnassignedDevices()).resolves.toEqual(unassigned);
    expect(calls(globalThis.fetch as unknown as ReturnType<typeof mock>)[0][0]).toBe(
      "http://engine/api/rooms/unassigned",
    );
  });

  it("fetches wall profiles and a named wall", async () => {
    const walls = {
      walls: [{ name: "hall", version: 1, config: { widgets: [] } }],
      count: 1,
    };
    mockFetch(walls);

    const client = new DebugClient("engine");
    await expect(client.getWalls()).resolves.toEqual(walls);

    const wall = { name: "hall", version: 1, config: { widgets: [] } };
    const fetchMock = mockFetch(wall);
    await expect(client.getWall("hall")).resolves.toEqual(wall);
    expect(calls(fetchMock)[0][0]).toBe("http://engine/api/walls/hall");
  });

  it("delegates the event stream with host and token", async () => {
    const fetchMock = mock(async () => new Response("", { status: 401 }));

    const client = new DebugClient("engine:8080", "secret");
    const error = await client
      .streamEvents({
        signal: new AbortController().signal,
        onEvent: () => {},
        fetchImpl: fetchMock as unknown as typeof fetch,
      })
      .catch((err: unknown) => err);
    expect(isStreamAuthError(error)).toBe(true);

    const [url, init] = calls(fetchMock)[0];
    expect(url).toBe("http://engine:8080/api/events");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
  });
});
