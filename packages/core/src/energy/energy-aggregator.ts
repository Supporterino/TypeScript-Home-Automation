/**
 * Home-wide energy aggregation. Samples the aggregate device source on a fixed
 * interval, normalizes each declared cumulative-energy reading to watt-hours, and
 * retains two bounded in-memory rings: the home's instantaneous power total and
 * every reachable device's cumulative-energy reading, from which a rolling-window
 * usage is derived per device.
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

const MILLIS_PER_MINUTE = 60_000;

/**
 * One timestamped sample of every reachable device's cumulative-energy reading,
 * in watt-hours, keyed by the device's qualified id. A device that is unreachable
 * or declares no reading is absent from the map rather than recorded as zero.
 */
interface CumulativeEnergySample {
  timestamp: number;
  readings: Map<string, number>;
}

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
  /** Milliseconds between history samples. Always positive (config normalizes `0`). */
  sampleIntervalMs: number;
  /** Rolling history window in minutes. `0` disables history retention. */
  historyMinutes: number;
}

/**
 * Reads the current metering totals and the rolling-window usage, plus the retained
 * history. Totals are computed live on every call; `history` is the bounded ring
 * populated by {@link sample}.
 */
export class EnergyAggregator {
  private readonly history: EnergyHistorySample[] = [];
  private readonly cumulativeHistory: CumulativeEnergySample[] = [];
  private readonly maxSamples: number;
  private readonly maxCumulativeSamples: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly devices: AggregateDeviceSource,
    private readonly options: EnergyAggregatorOptions,
    private readonly logger: Logger,
    private readonly now: () => number = Date.now,
  ) {
    this.maxSamples =
      options.historyMinutes > 0
        ? Math.floor((options.historyMinutes * MILLIS_PER_MINUTE) / options.sampleIntervalMs)
        : 0;
    // A window delta is measured between two samples, so the cumulative ring
    // retains one sample beyond the power ring: a full ring then spans the whole
    // retention window rather than one interval short of it.
    this.maxCumulativeSamples = this.maxSamples > 0 ? this.maxSamples + 1 : 0;
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
   * Compute the current energy view — live totals, per-device breakdown, a copy of the
   * history, and the rolling-window usage with its window and coverage — defaulting to
   * zero totals with no metering devices.
   *
   * `windowMinutes` is reported whenever history is enabled. `usageWh` and its
   * `coveredMinutes` are absent when no retained cumulative sample precedes the newest
   * one, or when no device reports a cumulative reading at both ends of the retained
   * span: either way the span is uncovered enough to report a change, and a zero would
   * be a false reading rather than an absent one.
   */
  snapshot(): EnergyData {
    const { powerWatts, energyWh, breakdown } = this.compute();
    const data: EnergyData = { powerWatts, energyWh, breakdown, history: [...this.history] };
    if (this.maxSamples > 0) {
      data.windowMinutes = this.options.historyMinutes;
      const usage = this.windowUsage();
      if (usage) {
        data.usageWh = usage.usageWh;
        data.coveredMinutes = usage.coveredMinutes;
      }
    }
    return data;
  }

  /**
   * Append one timestamped home-power sample and one per-device cumulative-energy
   * sample to the bounded rings; a no-op when history is disabled
   * (`historyMinutes === 0`). The cumulative ring carries only the devices that are
   * reachable and declare a reading at that instant, keyed by qualified id, so a
   * device that is unreachable or silent is absent rather than recorded as zero.
   */
  sample(): void {
    if (this.maxSamples === 0) return;

    const { powerWatts, energyReadings } = this.compute();
    const timestamp = this.now();
    this.history.push({ timestamp, powerWatts });
    this.cumulativeHistory.push({ timestamp, readings: energyReadings });
    while (this.history.length > this.maxSamples) {
      this.history.shift();
    }
    while (this.cumulativeHistory.length > this.maxCumulativeSamples) {
      this.cumulativeHistory.shift();
    }
  }

  /**
   * The home's usage over the retained span plus the minutes it covers, or `undefined`
   * when the span has no baseline or no device reports a cumulative reading at both
   * ends — in either case the caller reports usage as absent rather than as a false
   * zero.
   *
   * Usage is summed per device: only a device present at both ends contributes its
   * change, so a device that drops out mid-window leaves the window rather than
   * subtracting its consumption from it.
   */
  private windowUsage(): { usageWh: number; coveredMinutes: number } | undefined {
    const first = this.cumulativeHistory[0];
    const last = this.cumulativeHistory[this.cumulativeHistory.length - 1];
    if (first === undefined || last === undefined || last.timestamp <= first.timestamp) {
      return undefined;
    }

    let usageWh = 0;
    let contributed = false;
    for (const [qualifiedId, lastReading] of last.readings) {
      const firstReading = first.readings.get(qualifiedId);
      if (firstReading === undefined) continue;
      usageWh += lastReading - firstReading;
      contributed = true;
    }
    if (!contributed) return undefined;

    const coveredMinutes = Math.min(
      this.options.historyMinutes,
      (last.timestamp - first.timestamp) / MILLIS_PER_MINUTE,
    );
    return { usageWh, coveredMinutes };
  }

  /**
   * Derive the home's totals and per-device breakdown from the current descriptors, plus
   * the watt-hour cumulative reading of each reachable device that declares one, keyed by
   * qualified id. A missing or non-finite reading is never treated as zero; an
   * unreachable device is reported `available: false` with its readings withheld.
   */
  private compute(): {
    powerWatts: number;
    energyWh: number;
    breakdown: EnergyDeviceBreakdown[];
    energyReadings: Map<string, number>;
  } {
    let powerWatts = 0;
    let energyWh = 0;
    const breakdown: EnergyDeviceBreakdown[] = [];
    const energyReadings = new Map<string, number>();

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
          energyReadings.set(device.qualifiedId, wattHours);
        }
      }

      breakdown.push(entry);
    }

    return { powerWatts, energyWh, breakdown, energyReadings };
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
