/**
 * Home-wide energy aggregation. Samples the aggregate device source on a fixed
 * interval, normalizes each declared cumulative-energy reading to watt-hours, and
 * retains a bounded in-memory ring of the home's instantaneous power total.
 */
import type {
  Capability,
  EnergyData,
  EnergyDeviceBreakdown,
  EnergyHistorySample,
} from "@ts-ha/shared";
import type { Logger } from "pino";
import type { AggregateDeviceSource } from "../device-sources/aggregate.js";
import { flattenByProperty } from "../device-sources/command-validation.js";

/** The capability property carrying a device's instantaneous power, in watts. */
const POWER_PROPERTY = "power";

/** The capability property carrying a device's cumulative consumption. */
const ENERGY_PROPERTY = "energy";

/**
 * Multipliers converting a source's declared energy unit to the canonical
 * watt-hour; an absent unit is read as the canonical `Wh`.
 */
const ENERGY_UNIT_TO_WH: Record<string, number> = {
  Wh: 1,
  kWh: 1000,
  MWh: 1_000_000,
  mWh: 0.001,
};

/** Options controlling the sampling cadence and the history retention window. */
export interface EnergyAggregatorOptions {
  /** Milliseconds between power-history samples. Always positive (config normalizes `0`). */
  sampleIntervalMs: number;
  /** Rolling history window in minutes. `0` disables history retention. */
  historyMinutes: number;
}

/**
 * Reads the current metering totals plus the retained history. Totals are computed live
 * on every call; `history` is the bounded ring populated by {@link sample}.
 */
export class EnergyAggregator {
  private readonly history: EnergyHistorySample[] = [];
  private readonly maxSamples: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly devices: AggregateDeviceSource,
    private readonly options: EnergyAggregatorOptions,
    private readonly logger: Logger,
    private readonly now: () => number = Date.now,
  ) {
    this.maxSamples =
      options.historyMinutes > 0
        ? Math.floor((options.historyMinutes * 60_000) / options.sampleIntervalMs)
        : 0;
  }

  /**
   * Begin sampling: one sample immediately, then one per interval. Idempotent while running.
   */
  start(): void {
    if (this.timer) return;
    this.sample();
    this.timer = setInterval(() => this.sample(), this.options.sampleIntervalMs);
  }

  /** Stop sampling and release the timer. Safe to call when never started. */
  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Compute the current energy view — live totals, per-device breakdown, and a copy of the
   * history — defaulting to zero totals with no metering devices.
   */
  snapshot(): EnergyData {
    const { powerWatts, energyWh, breakdown } = this.compute();
    return { powerWatts, energyWh, breakdown, history: [...this.history] };
  }

  /**
   * Append one timestamped home-power sample to the bounded ring; a no-op when history is
   * disabled (`historyMinutes === 0`).
   */
  sample(): void {
    if (this.maxSamples === 0) return;

    const { powerWatts } = this.compute();
    this.history.push({ timestamp: this.now(), powerWatts });
    while (this.history.length > this.maxSamples) {
      this.history.shift();
    }
  }

  /**
   * Derive the home's totals and per-device breakdown from the current descriptors. A
   * missing or non-finite reading is never treated as zero; an unreachable device is
   * reported `available: false` with its readings withheld.
   */
  private compute(): {
    powerWatts: number;
    energyWh: number;
    breakdown: EnergyDeviceBreakdown[];
  } {
    let powerWatts = 0;
    let energyWh = 0;
    const breakdown: EnergyDeviceBreakdown[] = [];

    for (const device of this.devices.list()) {
      // Nesting into `features` matters: Zigbee2MQTT exposes power/energy on a
      // composite, and a top-level-only scan would silently drop them from
      // the totals (same flattening the command validator and web UI use).
      const byProperty = flattenByProperty(device.capabilities);
      const powerCapability = byProperty.get(POWER_PROPERTY);
      const energyCapability = byProperty.get(ENERGY_PROPERTY);
      if (!powerCapability && !energyCapability) continue;

      const entry: EnergyDeviceBreakdown = {
        qualifiedId: device.qualifiedId,
        displayName: device.displayName,
        available: device.reachable,
      };

      if (!device.reachable) {
        breakdown.push(entry);
        continue;
      }

      if (powerCapability) {
        const watts = readFiniteNumber(device.state, powerCapability);
        if (watts !== undefined) {
          entry.powerWatts = watts;
          powerWatts += watts;
        }
      }

      if (energyCapability) {
        const value = readFiniteNumber(device.state, energyCapability);
        const wattHours =
          value === undefined ? undefined : toWattHours(value, energyCapability.unit, this.logger);
        if (wattHours !== undefined) {
          entry.energyWh = wattHours;
          energyWh += wattHours;
        }
      }

      breakdown.push(entry);
    }

    return { powerWatts, energyWh, breakdown };
  }
}

/** Read a capability's state value as a finite number, or `undefined` when absent/non-numeric. */
function readFiniteNumber(
  state: Record<string, unknown>,
  capability: Capability,
): number | undefined {
  if (!capability.property) return undefined;
  const value = state[capability.property];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Convert a declared energy reading to watt-hours using the capability's unit. */
function toWattHours(value: number, unit: string | undefined, logger: Logger): number | undefined {
  const factor = unit === undefined ? 1 : ENERGY_UNIT_TO_WH[unit];
  if (factor === undefined) {
    logger.warn({ unit }, "Unknown energy unit — reading excluded from the cumulative total");
    return undefined;
  }
  return value * factor;
}
