/**
 * Pure presentation model for the wall weather widget (specs/wall-display
 * "Widget Catalog"; design.md D6, D11). Extracted so the widget's
 * unconfigured/loading/error branches — and its forecast mapping — are
 * reachable by `bun test` without a DOM.
 */
import type { WeatherData, WeatherUnavailable } from "@ts-ha/shared";
import { formatForecastDate, isWeatherUnavailable } from "../../lib/weather.js";

export type WeatherWidgetState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "unavailable"; reason: WeatherUnavailable["reason"] }
  | { status: "ready"; data: WeatherData };

/**
 * Maps a `/api/weather` fetch result to the widget's display state. An
 * unconfigured feature is a first-class state (specs/wall-display "An
 * unconfigured widget is contained"), never an error and never a throw.
 */
export function weatherWidgetState(
  value: WeatherData | WeatherUnavailable | null,
  error: string | null,
): WeatherWidgetState {
  if (error !== null) return { status: "error", message: error };
  if (value === null) return { status: "loading" };
  if (isWeatherUnavailable(value)) return { status: "unavailable", reason: value.reason };
  return { status: "ready", data: value };
}

/** One forecast day, pre-formatted for the compact wall readout (design.md D6). */
export interface WallWeatherForecastDay {
  date: string;
  label: string;
  condition: WeatherData["current"]["condition"];
  high: number;
  low: number;
}

/**
 * Maps a response's forecast to the widget's compact presentation. Returns an
 * empty list when the registered service supplied no forecast — the widget only
 * renders the section when there is one (specs/wall-display "Widget Catalog").
 */
export function weatherForecastDays(data: WeatherData): WallWeatherForecastDay[] {
  return (data.forecast ?? []).map((day) => ({
    date: day.date,
    label: formatForecastDate(day.date),
    condition: day.condition,
    high: Math.round(day.tempHigh),
    low: Math.round(day.tempLow),
  }));
}
