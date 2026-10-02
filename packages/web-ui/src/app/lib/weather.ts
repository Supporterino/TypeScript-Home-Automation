/**
 * Weather view derivation (specs/weather-services; specs/web-ui "Weather
 * View"; design.md D8). Pure and DOM-free so the presentation rules it
 * encodes — the unconfigured marker, compass labels — are reachable by
 * `bun test`.
 */

import type { WeatherData, WeatherUnavailable } from "@ts-ha/shared";

const COMPASS_POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** Compass label for a wind direction in degrees (0 = north). */
export function windDirectionLabel(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360;
  return COMPASS_POINTS[Math.round(normalized / 45) % COMPASS_POINTS.length] ?? "N";
}

/**
 * Whether the endpoint reported the feature as unconfigured rather than
 * returning conditions. The two cases — no service registered, no resolvable
 * location — are the same user-facing state (design.md D8).
 */
export function isWeatherUnavailable(
  value: WeatherData | WeatherUnavailable,
): value is WeatherUnavailable {
  return "available" in value && value.available === false;
}

/** Human-readable explanation for the unconfigured state, per reason. */
export function unavailableMessage(reason: WeatherUnavailable["reason"]): string {
  return reason === "no_location"
    ? "No weather location is configured. Set WEATHER_LATITUDE and WEATHER_LONGITUDE, or call the API with a location override."
    : "No weather service is registered. Add a weather service to your engine's services map to show conditions here.";
}

/** Formats a `YYYY-MM-DD` forecast date as a local weekday label, falling back to the raw string. */
export function formatForecastDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
