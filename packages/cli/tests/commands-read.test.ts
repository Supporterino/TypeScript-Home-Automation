import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { DebugClient } from "../src/client.js";
import { getAutomationHistory, getAutomationRelationships } from "../src/commands/automations.js";
import { formatEnergy, showEnergy } from "../src/commands/energy.js";
import { formatWeather, showWeather } from "../src/commands/weather.js";

const originalLog = console.log;

function output(log: ReturnType<typeof mock>): string {
  return log.mock.calls.map((call) => call.join(" ")).join("\n");
}

beforeEach(() => {
  console.log = mock(() => {}) as unknown as typeof console.log;
});

afterEach(() => {
  console.log = originalLog;
});

describe("automations history", () => {
  it("renders execution records as a table", async () => {
    const client = {
      getAutomationHistory: mock(async () => ({
        name: "motion-light",
        history: [
          {
            startedAt: Date.UTC(2026, 4, 1, 12, 0, 0),
            trigger: { type: "cron", expression: "0 * * * *", firedAt: new Date(0) },
            durationMs: 12,
            outcome: "success",
          },
          {
            startedAt: Date.UTC(2026, 4, 1, 13, 0, 0),
            trigger: { type: "mqtt", topic: "zigbee2mqtt/sensor", payload: {} },
            durationMs: 3,
            outcome: "failure",
            error: "boom",
          },
        ],
      })),
    } as unknown as DebugClient;
    const log = console.log as ReturnType<typeof mock>;

    await getAutomationHistory(client, "motion-light", false);

    const text = output(log);
    expect(text).toContain("STARTED");
    expect(text).toContain("OUTCOME");
    expect(text).toContain("cron 0 * * * *");
    expect(text).toContain("mqtt zigbee2mqtt/sensor");
    expect(text).toContain("failure");
    expect(text).toContain("boom");
    expect(text).toContain("2 record(s)");
  });

  it("reports an empty history", async () => {
    const client = {
      getAutomationHistory: mock(async () => ({ name: "unused", history: [] })),
    } as unknown as DebugClient;
    const log = console.log as ReturnType<typeof mock>;

    await getAutomationHistory(client, "unused", false);

    expect(output(log)).toContain('No execution records for "unused".');
  });
});

describe("automations relationships", () => {
  it("renders declared and observed relationships", async () => {
    const client = {
      getAutomationRelationships: mock(async () => ({
        name: "motion-light",
        declared: {
          requiredServices: [
            { name: "shelly", registered: true },
            { name: "weather", registered: false },
          ],
          relatedDevices: ["motion-sensor"],
          watchedStateKeys: ["night_mode"],
        },
        observed: { writtenStateKeys: ["motion-light:on"], truncated: true },
      })),
    } as unknown as DebugClient;
    const log = console.log as ReturnType<typeof mock>;

    await getAutomationRelationships(client, "motion-light", false);

    const text = output(log);
    expect(text).toContain("shelly");
    expect(text).toContain("registered");
    expect(text).toContain("weather");
    expect(text).toContain("missing");
    expect(text).toContain("motion-sensor");
    expect(text).toContain("night_mode");
    expect(text).toContain("motion-light:on");
    expect(text).toContain("(truncated)");
  });
});

describe("energy", () => {
  const energy = {
    powerWatts: 42.5,
    energyWh: 1234,
    breakdown: [
      {
        qualifiedId: "shelly:tv",
        displayName: "TV Plug",
        powerWatts: 42.5,
        energyWh: 1234,
        available: true,
      },
      { qualifiedId: "shelly:freezer", displayName: "Freezer", available: false },
    ],
    history: [],
  };

  it("formats totals and a per-device breakdown", () => {
    const text = formatEnergy(energy);
    expect(text).toContain("42.5 W");
    expect(text).toContain("1234 Wh");
    expect(text).toContain("TV Plug");
    expect(text).toContain("shelly:freezer");
    // A device with no power reading shows an em dash, not zero.
    expect(text).toContain("—");
  });

  it("prints the formatted energy snapshot", async () => {
    const client = { getEnergy: mock(async () => energy) } as unknown as DebugClient;
    const log = console.log as ReturnType<typeof mock>;

    await showEnergy(client, false);

    expect(output(log)).toContain("Power:");
  });
});

describe("weather", () => {
  const data = {
    location: { latitude: 48.1, longitude: 11.5 },
    current: {
      temperature: 18,
      feelsLike: 17,
      humidity: 60,
      pressure: 1013,
      condition: "clear",
      description: "clear sky",
      wind: { speed: 2, direction: 180 },
      cloudCover: 5,
      timestamp: 1_700_000_000,
    },
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

  it("formats current conditions and the forecast", () => {
    const text = formatWeather(data);
    expect(text).toContain("clear sky");
    expect(text).toContain("18°C");
    expect(text).toContain("2026-05-01");
    expect(text).toContain("60%");
  });

  it("reports an unconfigured service as unavailable, not an error", async () => {
    const client = {
      getWeather: mock(async () => ({ available: false, reason: "service_unregistered" })),
    } as unknown as DebugClient;
    const log = console.log as ReturnType<typeof mock>;

    await showWeather(client, false);

    expect(output(log)).toContain("Weather unavailable — no weather service is configured.");
  });

  it("reports a missing location as unavailable", () => {
    expect(formatWeather({ available: false, reason: "no_location" })).toBe(
      "Weather unavailable — no location is configured.",
    );
  });
});
