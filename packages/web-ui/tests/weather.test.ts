import { describe, expect, it } from "bun:test";
import type { WeatherData } from "@ts-ha/shared";
import {
  formatForecastDate,
  isWeatherUnavailable,
  unavailableMessage,
  windDirectionLabel,
} from "../src/app/lib/weather.js";

describe("windDirectionLabel", () => {
  it("maps cardinal and intercardinal degrees", () => {
    expect(windDirectionLabel(0)).toBe("N");
    expect(windDirectionLabel(45)).toBe("NE");
    expect(windDirectionLabel(90)).toBe("E");
    expect(windDirectionLabel(180)).toBe("S");
    expect(windDirectionLabel(270)).toBe("W");
  });

  it("normalizes out-of-range and negative degrees", () => {
    expect(windDirectionLabel(360)).toBe("N");
    expect(windDirectionLabel(-90)).toBe("W");
    expect(windDirectionLabel(450)).toBe("E");
  });
});

describe("isWeatherUnavailable", () => {
  it("recognizes both unconfigured markers", () => {
    expect(isWeatherUnavailable({ available: false, reason: "service_unregistered" })).toBe(true);
    expect(isWeatherUnavailable({ available: false, reason: "no_location" })).toBe(true);
  });

  it("does not treat conditions as unavailable", () => {
    expect(isWeatherUnavailable({} as WeatherData)).toBe(false);
  });
});

describe("unavailableMessage", () => {
  it("explains the missing-location case", () => {
    expect(unavailableMessage("no_location")).toContain("location");
  });

  it("explains the missing-service case", () => {
    expect(unavailableMessage("service_unregistered")).toContain("service");
  });
});

describe("formatForecastDate", () => {
  it("formats a valid ISO date as a local label", () => {
    const formatted = formatForecastDate("2026-10-02");
    expect(formatted).not.toBe("2026-10-02");
    expect(formatted.length).toBeGreaterThan(0);
  });

  it("falls back to the raw string for a malformed date", () => {
    expect(formatForecastDate("not-a-date")).toBe("not-a-date");
  });
});
