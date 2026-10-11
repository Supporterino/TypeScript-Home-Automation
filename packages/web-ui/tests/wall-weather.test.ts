import { describe, expect, it } from "bun:test";
import type { WeatherData, WeatherUnavailable } from "@ts-ha/shared";
import { unavailableMessage } from "../src/app/lib/weather.js";
import { weatherForecastDays, weatherWidgetState } from "../src/app/wall/widgets/weather-model.js";

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
