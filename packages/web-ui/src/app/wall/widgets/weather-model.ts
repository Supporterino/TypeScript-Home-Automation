/**
 * Pure presentation model for the wall weather widget: its display state, forecast
 * mapping, and space-aware composition.
 */
import type { WeatherData, WeatherUnavailable } from "@ts-ha/shared";
import { formatForecastDate, isWeatherUnavailable } from "../../lib/weather.js";
import { WALL_CARD_METRICS } from "../cards/metrics.js";
import { WALL_TYPE_RAMP } from "../type-ramp.js";

export type WeatherWidgetState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "unavailable"; reason: WeatherUnavailable["reason"] }
  | { status: "ready"; data: WeatherData };

/**
 * Maps a `/api/weather` fetch result to the widget's display state. An unconfigured
 * feature is a first-class state, never an error.
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

/** One forecast day, pre-formatted for the compact wall readout. */
export interface WallWeatherForecastDay {
  date: string;
  label: string;
  condition: WeatherData["current"]["condition"];
  high: number;
  low: number;
}

/**
 * Maps a response's forecast to the widget's compact presentation, empty when the
 * service supplied none.
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

/**
 * A line of the widget's own text, in CSS pixels — the tier at the wall's body
 * leading.
 */
function weatherLinePx(sizePx: number): number {
  return Math.ceil(sizePx * 1.5);
}

/** The widget's leading affordance's shape side, in CSS pixels — the ported icon size. */
const WEATHER_ICON_PX = WALL_CARD_METRICS.iconSize;

/** The gap the widget lays its own blocks out with, in CSS pixels — Hearth's `--hearth-space-3`. */
const WEATHER_BLOCK_GAP_PX = 12;

/** The gap the detail figures share, in CSS pixels — Hearth's `--hearth-space-4`, the row's own gap. */
const WEATHER_DETAIL_GAP_PX = 16;

/** The gap inside a forecast figure, in CSS pixels — Hearth's `--hearth-space-1`. */
const WEATHER_FIGURE_GAP_PX = 4;

/**
 * The condition state item's height, in CSS pixels: the ported circular affordance
 * beside its label over the temperature reading.
 */
export const WEATHER_STATE_ITEM_HEIGHT_PX = Math.max(
  WEATHER_ICON_PX,
  weatherLinePx(WALL_CARD_METRICS.primarySize) + weatherLinePx(WALL_TYPE_RAMP.metricMin),
);

/**
 * The detail block's height, in CSS pixels, in its tallest form — the two figures
 * on the two rows they occupy once their row wraps at a narrow cell.
 */
const WEATHER_DETAIL_HEIGHT_PX = 2 * WEATHER_ICON_PX + WEATHER_DETAIL_GAP_PX;

/**
 * The forecast block's height, in CSS pixels: one figure per day, as the widget
 * lays the figures out in a row.
 */
const WEATHER_FORECAST_HEIGHT_PX =
  2 * weatherLinePx(WALL_CARD_METRICS.secondarySize) + 2 * WEATHER_FIGURE_GAP_PX + WEATHER_ICON_PX;

/**
 * The height, in CSS pixels, the widget needs to draw its condition and details but
 * not its forecast.
 */
export const WEATHER_DETAIL_COMPOSITION_HEIGHT_PX =
  WEATHER_STATE_ITEM_HEIGHT_PX + WEATHER_BLOCK_GAP_PX + WEATHER_DETAIL_HEIGHT_PX;

/**
 * The height, in CSS pixels, the widget needs to draw every part it has.
 */
export const WEATHER_FULL_COMPOSITION_HEIGHT_PX =
  WEATHER_DETAIL_COMPOSITION_HEIGHT_PX + WEATHER_BLOCK_GAP_PX + WEATHER_FORECAST_HEIGHT_PX;

/**
 * The composition the weather widget draws at the box the frame handed it: `full`,
 * `detail`, or `readout`, the richest the box holds.
 */
export type WeatherWidgetComposition = "full" | "detail" | "readout";

/**
 * Resolves the widget's composition from `rendererHeightPx`, the height of the box
 * the frame gave the renderer.
 */
export function weatherWidgetComposition(rendererHeightPx: number): WeatherWidgetComposition {
  if (rendererHeightPx >= WEATHER_FULL_COMPOSITION_HEIGHT_PX) return "full";
  if (rendererHeightPx >= WEATHER_DETAIL_COMPOSITION_HEIGHT_PX) return "detail";
  return "readout";
}

/**
 * The height, in CSS pixels, a composition needs — the budget the widget resolves
 * against.
 */
export function weatherCompositionHeightPx(composition: WeatherWidgetComposition): number {
  if (composition === "full") return WEATHER_FULL_COMPOSITION_HEIGHT_PX;
  if (composition === "detail") return WEATHER_DETAIL_COMPOSITION_HEIGHT_PX;
  return WEATHER_STATE_ITEM_HEIGHT_PX;
}
