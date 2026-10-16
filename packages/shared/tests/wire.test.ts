import { describe, expect, it } from "bun:test";
import type {
  EnergyData,
  RoomBatchCommandResponse,
  RoomCommandOutcome,
  WeatherData,
} from "../src/index.js";

describe("room batch command response", () => {
  it("carries each outcome literal on a per-device result", () => {
    const outcomes: RoomCommandOutcome[] = ["applied", "skipped", "failed"];
    const response: RoomBatchCommandResponse = outcomes.map((outcome, index) => ({
      qualifiedId: `shelly:plug-${index}`,
      outcome,
    }));

    expect(response.map((result) => result.outcome)).toEqual(["applied", "skipped", "failed"]);
    expect(response.every((result) => typeof result.qualifiedId === "string")).toBe(true);
  });
});

describe("energy and weather wire shapes", () => {
  it("accepts a no-metering energy payload", () => {
    const data: EnergyData = { powerWatts: 0, energyWh: 0, breakdown: [], history: [] };
    expect(data.breakdown).toEqual([]);
  });

  it("accepts a rolling-window usage with its window and coverage", () => {
    const data: EnergyData = {
      powerWatts: 35,
      energyWh: 4000,
      usageWh: 600,
      windowMinutes: 1440,
      coveredMinutes: 360,
      breakdown: [],
      history: [],
    };
    expect(data.usageWh).toBe(600);
    expect(data.coveredMinutes).toBeLessThan(data.windowMinutes ?? 0);
  });

  it("reuses the existing weather types on a weather payload", () => {
    const data: WeatherData = {
      location: { latitude: 52.52, longitude: 13.405 },
      current: {
        temperature: 20,
        feelsLike: 20,
        humidity: 50,
        pressure: 1013,
        condition: "clear",
        description: "clear sky",
        wind: { speed: 1, direction: 180 },
        cloudCover: 0,
        timestamp: 0,
      },
      forecast: [],
    };
    expect(data.location.latitude).toBe(52.52);
  });
});
