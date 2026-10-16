/**
 * Pure presentation model for the wall energy widget: maps the `/api/energy`
 * response to display strings.
 */
import type { EnergyData } from "@ts-ha/shared";
import { formatKwh, formatWatts } from "../../lib/energy.js";

/**
 * The home's usage over the extent the retained samples cover: the value with its
 * unit and the span it covers, or `absent` when nothing has been covered. There is
 * no lifetime total — a cumulative consumption figure is not a recent reading — and
 * an uncovered window is absent rather than a zero.
 */
export type EnergyUsageDisplay =
  | { status: "covered"; value: string; span: string }
  | { status: "absent" };

export interface EnergyDisplay {
  /** Instantaneous home power, formatted, e.g. `1,234 W`. */
  power: string;
  /** The home's usage over the recent rolling window, or nothing covered. */
  usage: EnergyUsageDisplay;
  /** How many devices are contributing a metering reading. */
  meteringCount: number;
}

/**
 * Labels a span of `minutes` — whole hours where the span divides cleanly into
 * them, whole minutes otherwise, so a full day and a partial window both stay
 * legible. A reported span is never exact enough to warrant a fraction, and a
 * covered span is never drawn as `last 0m` beside its value: a sub-minute
 * coverage floors at one minute.
 */
export function coveredSpanLabel(minutes: number): string {
  const whole = Math.max(1, Math.round(minutes));
  return whole >= 60 && whole % 60 === 0 ? `last ${whole / 60}h` : `last ${whole}m`;
}

/**
 * The usage over the span the response reports: the value labelled with the extent
 * the retained samples actually cover, so a partial window is never drawn as a
 * full-window figure. The coverage is the reported extent, or the window when a
 * response omits it — the wire contract reports the two together. A usage with no
 * span at all cannot be labelled truthfully, so it stays absent.
 */
function usageDisplay(data: EnergyData): EnergyUsageDisplay {
  const spanMinutes = data.coveredMinutes ?? data.windowMinutes;
  if (data.usageWh === undefined || spanMinutes === undefined) return { status: "absent" };
  return {
    status: "covered",
    value: formatKwh(data.usageWh),
    span: coveredSpanLabel(spanMinutes),
  };
}

/** Maps the `/api/energy` response to the widget's display strings. */
export function energyDisplay(data: EnergyData): EnergyDisplay {
  return {
    power: formatWatts(data.powerWatts),
    usage: usageDisplay(data),
    meteringCount: data.breakdown.length,
  };
}
