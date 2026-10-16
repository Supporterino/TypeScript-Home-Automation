/**
 * Pure presentation model for the wall energy widget: maps the `/api/energy`
 * response to display strings.
 */
import type { EnergyData } from "@ts-ha/shared";
import { formatKwh, formatWatts } from "../../lib/energy.js";

export interface EnergyDisplay {
  /** Instantaneous home power, formatted, e.g. `1,234 W`. */
  power: string;
  /** Cumulative home consumption, formatted, e.g. `1.25 kWh`. */
  consumption: string;
  /** How many devices are contributing a metering reading. */
  meteringCount: number;
}

/** Maps the `/api/energy` response to the widget's display strings. */
export function energyDisplay(data: EnergyData): EnergyDisplay {
  return {
    power: formatWatts(data.powerWatts),
    consumption: formatKwh(data.energyWh),
    meteringCount: data.breakdown.length,
  };
}
