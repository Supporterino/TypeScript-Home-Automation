/**
 * Pure presentation model for the wall weather widget (specs/wall-display
 * "Widget Catalog"; design.md D6, D11) and its space-aware composition
 * (specs/wall-display "Span-Aware Card Presentation"; design.md W1). Extracted so
 * the widget's unconfigured/loading/error branches, its forecast mapping and the
 * composition it resolves from the box the frame hands it are reachable by
 * `bun test` without a DOM.
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

/**
 * A line of the widget's own text, in CSS pixels — the tier at the wall's body
 * leading, the same measure the wall's title block (`wall/span.ts`) and the scene
 * tile's label (`scene-model.ts`) take. Every line the widget draws is bounded by
 * it, so a block's budget never under-counts a wrapped or larger-tier line.
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
 * beside its label over the temperature reading. Both parts are the widget's own —
 * the affordance's shape is the ported icon size, and the text column is the
 * ported primary line over the wall's readout line at the ramp's floor, since the
 * floors are the smallest box the wall guarantees (specs/wall-display "Panel Fit").
 */
export const WEATHER_STATE_ITEM_HEIGHT_PX = Math.max(
  WEATHER_ICON_PX,
  weatherLinePx(WALL_CARD_METRICS.primarySize) + weatherLinePx(WALL_TYPE_RAMP.metricMin),
);

/**
 * The detail block's height, in CSS pixels, in its tallest form: the humidity and
 * wind figures, each the ported circular affordance, on the two rows they occupy
 * once their row wraps at a narrow cell. The widget's box is handed to it as a
 * height alone, so the block is budgeted at the form it takes in the smallest cell
 * its type permits rather than at the single row a wide card draws.
 */
const WEATHER_DETAIL_HEIGHT_PX = 2 * WEATHER_ICON_PX + WEATHER_DETAIL_GAP_PX;

/**
 * The forecast block's height, in CSS pixels: one figure per day — a caption, the
 * ported circular affordance and the high/low line — as the widget lays the
 * figures out in a row.
 */
const WEATHER_FORECAST_HEIGHT_PX =
  2 * weatherLinePx(WALL_CARD_METRICS.secondarySize) + 2 * WEATHER_FIGURE_GAP_PX + WEATHER_ICON_PX;

/**
 * The height, in CSS pixels, the widget needs to draw its condition and its
 * details but not its forecast — the smaller of its richer compositions.
 */
export const WEATHER_DETAIL_COMPOSITION_HEIGHT_PX =
  WEATHER_STATE_ITEM_HEIGHT_PX + WEATHER_BLOCK_GAP_PX + WEATHER_DETAIL_HEIGHT_PX;

/**
 * The height, in CSS pixels, the widget needs to draw every part it has — the
 * composition the forecast is kept for. Derived from the parts rather than from
 * the wall light card's much larger full form, so the widget is measured against
 * its own content.
 */
export const WEATHER_FULL_COMPOSITION_HEIGHT_PX =
  WEATHER_DETAIL_COMPOSITION_HEIGHT_PX + WEATHER_BLOCK_GAP_PX + WEATHER_FORECAST_HEIGHT_PX;

/**
 * The composition the weather widget draws at the box the frame handed it
 * (specs/wall-display "Span-Aware Card Presentation"; design.md W1): `full` where
 * the box holds every part, `detail` where it holds the condition and its details
 * but not the forecast, and `readout` where it holds the condition and its
 * temperature alone. Each step is the richest the box holds, never a smaller one
 * inflated into the space, and the widget's leading affordance and its temperature
 * reading survive in every one — they are what is read at distance.
 */
export type WeatherWidgetComposition = "full" | "detail" | "readout";

/**
 * Resolves the widget's composition from `rendererHeightPx`, the height of the box
 * the frame actually gave the renderer (`frame.ts`'s `rendererBoxHeightPx`). The
 * frame only lets a card through whose box holds the box a minimum-span card gets,
 * and that box — the cell at the type's minimum span minus the frame's inset —
 * already holds the detail composition, so a box below it cannot arise from a
 * placement the editor would author. Pure: the answer is a function of the box
 * alone, so nothing is measured at render time.
 */
export function weatherWidgetComposition(rendererHeightPx: number): WeatherWidgetComposition {
  if (rendererHeightPx >= WEATHER_FULL_COMPOSITION_HEIGHT_PX) return "full";
  if (rendererHeightPx >= WEATHER_DETAIL_COMPOSITION_HEIGHT_PX) return "detail";
  return "readout";
}

/**
 * The height, in CSS pixels, a composition needs — the budget the widget resolves
 * against, so a composition is drawn only where the box it was given holds it and
 * the widget can never overflow or clip its cell.
 */
export function weatherCompositionHeightPx(composition: WeatherWidgetComposition): number {
  if (composition === "full") return WEATHER_FULL_COMPOSITION_HEIGHT_PX;
  if (composition === "detail") return WEATHER_DETAIL_COMPOSITION_HEIGHT_PX;
  return WEATHER_STATE_ITEM_HEIGHT_PX;
}
