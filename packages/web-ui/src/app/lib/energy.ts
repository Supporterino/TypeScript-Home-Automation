/**
 * Energy view derivation: converts the endpoint's watt-hours to kWh and
 * hand-renders the trend as an inline SVG polyline.
 */

import type { EnergyHistorySample } from "@ts-ha/shared";
import type { NormalizedStreamEvent } from "../types.js";

/** Default sparkline viewBox dimensions, in SVG user units. */
export const SPARKLINE_WIDTH = 120;
export const SPARKLINE_HEIGHT = 36;

/** Inset from the viewBox edges so a peak/trough stroke is never clipped. */
const SPARKLINE_PADDING = 3;

/**
 * Event categories that can change the aggregated totals; a matching event
 * means "refetch `/api/energy`".
 */
export const ENERGY_DEVICE_EVENT_CATEGORIES = [
  "device_state",
  "device_reachability",
  "device_appeared",
  "device_disappeared",
] as const;

/** Whether a stream event should trigger an energy-endpoint refetch. */
export function isEnergyRelevantEvent(event: NormalizedStreamEvent): boolean {
  return (ENERGY_DEVICE_EVENT_CATEGORIES as readonly string[]).includes(event.category);
}

/** Converts a watt-hour reading to kilowatt-hours. */
export function whToKwh(wh: number): number {
  return wh / 1000;
}

/** Formats instantaneous power in watts, e.g. `1234 W`. */
export function formatWatts(watts: number): string {
  return `${Math.round(watts).toLocaleString("en-US")} W`;
}

/** Formats cumulative consumption in kWh, scaling decimal places to magnitude. */
export function formatKwh(wh: number): string {
  const kwh = whToKwh(wh);
  const decimals = kwh >= 100 ? 0 : kwh >= 10 ? 1 : 2;
  return `${kwh.toFixed(decimals)} kWh`;
}

/**
 * Maps a chronological power series to an SVG `points` string, oldest first.
 * Returns `""` for no samples, and a flat mid-height line when all are equal.
 */
export function sparklinePoints(
  samples: readonly EnergyHistorySample[],
  width = SPARKLINE_WIDTH,
  height = SPARKLINE_HEIGHT,
): string {
  if (samples.length === 0) return "";

  const values = samples.map((sample) => sample.powerWatts);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const usableWidth = width - SPARKLINE_PADDING * 2;
  const usableHeight = height - SPARKLINE_PADDING * 2;

  return samples
    .map((sample, index) => {
      const x =
        samples.length === 1
          ? width / 2
          : SPARKLINE_PADDING + (index / (samples.length - 1)) * usableWidth;
      const ratio = span === 0 ? 0.5 : (sample.powerWatts - min) / span;
      const y = SPARKLINE_PADDING + (1 - ratio) * usableHeight;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

/**
 * Describes a trend for assistive technology, exposed as the SVG's accessible
 * name since color and sparkline alone are not a channel.
 */
export function sparklineLabel(samples: readonly EnergyHistorySample[]): string {
  if (samples.length === 0) return "";
  const values = samples.map((sample) => sample.powerWatts);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return `Power trend over ${samples.length} samples, from ${formatWatts(min)} to ${formatWatts(max)}`;
}
