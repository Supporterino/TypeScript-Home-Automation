import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";
import type { Capability, DeviceDescriptor } from "@ts-ha/shared";
import pino from "pino";
import type { AggregateDeviceSource } from "../src/device-sources/aggregate.js";
import { EnergyAggregator } from "../src/energy/energy-aggregator.js";

const logger = pino({ level: "silent" });

// ── Helpers ───────────────────────────────────────────────────────────────

function powerCapability(): Capability {
  return {
    kind: "numeric",
    property: "power",
    access: { readable: true, writable: false },
    valueType: "numeric",
    unit: "W",
  };
}

function energyCapability(unit: string): Capability {
  return {
    kind: "numeric",
    property: "energy",
    access: { readable: true, writable: false },
    valueType: "numeric",
    unit,
  };
}

function descriptor(
  overrides: Partial<DeviceDescriptor> & { qualifiedId: string },
): DeviceDescriptor {
  return {
    source: "shelly",
    id: overrides.qualifiedId,
    displayName: overrides.qualifiedId,
    state: {},
    capabilities: [],
    reachable: true,
    observation: { mode: "push", observedAt: 0 },
    hidden: false,
    ...overrides,
  };
}

/** A minimal read-only accessor standing in for `AggregateDeviceSource.list()`. */
function accessor(devices: DeviceDescriptor[]): AggregateDeviceSource {
  return { list: () => devices } as unknown as AggregateDeviceSource;
}

/** A mutable accessor whose `list()` tracks a live array, for sampling tests. */
function mutableAccessor(devices: DeviceDescriptor[]): {
  accessor: AggregateDeviceSource;
  set(devices: DeviceDescriptor[]): void;
} {
  let current = devices;
  return {
    accessor: { list: () => current } as unknown as AggregateDeviceSource,
    set: (next) => {
      current = next;
    },
  };
}

/** A reachable device declaring a cumulative-energy reading, in watt-hours. */
function energyDevice(qualifiedId: string, energyWh: number): DeviceDescriptor {
  return descriptor({
    qualifiedId,
    state: { energy: energyWh },
    capabilities: [energyCapability("Wh")],
  });
}

/** A single reachable device declaring a cumulative-energy reading, in watt-hours. */
function scenario(plugEnergyWh: number): DeviceDescriptor[] {
  return [energyDevice("shelly:plug", plugEnergyWh)];
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("EnergyAggregator", () => {
  describe("sampling", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("samples on the configured interval in chronological order", () => {
      jest.setSystemTime(1_000_000);
      const aggregator = new EnergyAggregator(
        accessor([]),
        { sampleIntervalMs: 1000, historyMinutes: 10 },
        logger,
      );

      aggregator.start();
      jest.advanceTimersByTime(3000);

      const history = aggregator.snapshot().history;
      expect(history).toHaveLength(4);
      expect(history.map((sample) => sample.timestamp)).toEqual([
        1_000_000, 1_001_000, 1_002_000, 1_003_000,
      ]);

      aggregator.stop();
    });

    it("records the home power total at each sample", () => {
      jest.setSystemTime(1_000_000);
      const { accessor: devices, set } = mutableAccessor([
        descriptor({
          qualifiedId: "shelly:plug",
          state: { power: 10 },
          capabilities: [powerCapability()],
        }),
      ]);
      const aggregator = new EnergyAggregator(
        devices,
        { sampleIntervalMs: 1000, historyMinutes: 10 },
        logger,
      );

      aggregator.start();
      set([
        descriptor({
          qualifiedId: "shelly:plug",
          state: { power: 42 },
          capabilities: [powerCapability()],
        }),
      ]);
      jest.advanceTimersByTime(1000);

      expect(aggregator.snapshot().history.map((sample) => sample.powerWatts)).toEqual([10, 42]);

      aggregator.stop();
    });

    it("does not start a second timer when start() is called twice", () => {
      jest.setSystemTime(1_000_000);
      const aggregator = new EnergyAggregator(
        accessor([]),
        { sampleIntervalMs: 1000, historyMinutes: 10 },
        logger,
      );

      aggregator.start();
      aggregator.start();
      jest.advanceTimersByTime(1000);

      expect(aggregator.snapshot().history).toHaveLength(2);

      aggregator.stop();
    });

    it("stops sampling once stop() is called", () => {
      jest.setSystemTime(1_000_000);
      const aggregator = new EnergyAggregator(
        accessor([]),
        { sampleIntervalMs: 1000, historyMinutes: 10 },
        logger,
      );

      aggregator.start();
      aggregator.stop();
      jest.advanceTimersByTime(5000);

      expect(aggregator.snapshot().history).toHaveLength(1);
    });
  });

  describe("normalization and summing", () => {
    it("normalizes mixed declared units to watt-hours and sums power across reachable devices", () => {
      const devices = [
        descriptor({
          qualifiedId: "shelly:a",
          displayName: "A",
          state: { power: 10, energy: 2500 },
          capabilities: [powerCapability(), energyCapability("Wh")],
        }),
        descriptor({
          qualifiedId: "shelly:b",
          displayName: "B",
          state: { power: 25, energy: 1.5 },
          capabilities: [powerCapability(), energyCapability("kWh")],
        }),
        descriptor({
          qualifiedId: "shelly:c",
          displayName: "C",
          state: { energy: 500_000 },
          capabilities: [energyCapability("mWh")],
        }),
      ];
      const aggregator = new EnergyAggregator(
        accessor(devices),
        { sampleIntervalMs: 1000, historyMinutes: 0 },
        logger,
      );

      const snapshot = aggregator.snapshot();
      expect(snapshot.powerWatts).toBe(35);
      expect(snapshot.energyWh).toBe(2500 + 1500 + 500);
      expect(snapshot.breakdown.map((entry) => entry.energyWh)).toEqual([2500, 1500, 500]);
      expect(snapshot.breakdown.map((entry) => entry.qualifiedId)).toEqual([
        "shelly:a",
        "shelly:b",
        "shelly:c",
      ]);
    });

    it("reads power and energy nested under a composite capability", () => {
      const devices = [
        descriptor({
          qualifiedId: "zigbee:plug",
          displayName: "Zigbee plug",
          state: { power: 12, energy: 3 },
          capabilities: [
            {
              kind: "light",
              access: { readable: true, writable: false },
              valueType: "composite",
              features: [powerCapability(), energyCapability("kWh")],
            },
          ],
        }),
      ];
      const aggregator = new EnergyAggregator(
        accessor(devices),
        { sampleIntervalMs: 1000, historyMinutes: 0 },
        logger,
      );

      const snapshot = aggregator.snapshot();
      expect(snapshot.powerWatts).toBe(12);
      // The nested energy capability's declared kWh unit is still honored.
      expect(snapshot.energyWh).toBe(3000);
      expect(snapshot.breakdown).toHaveLength(1);
      expect(snapshot.breakdown[0]).toMatchObject({ powerWatts: 12, energyWh: 3000 });
    });

    it("excludes a device that declares no metering capability from the breakdown", () => {
      const devices = [
        descriptor({
          qualifiedId: "shelly:lamp",
          capabilities: [
            {
              kind: "switch",
              property: "on",
              access: { readable: true, writable: true },
              valueType: "boolean",
            },
          ],
          state: { on: true },
        }),
      ];
      const aggregator = new EnergyAggregator(
        accessor(devices),
        { sampleIntervalMs: 1000, historyMinutes: 0 },
        logger,
      );

      const snapshot = aggregator.snapshot();
      expect(snapshot.powerWatts).toBe(0);
      expect(snapshot.energyWh).toBe(0);
      expect(snapshot.breakdown).toEqual([]);
    });

    it("treats a missing or non-finite reading as absent rather than zero", () => {
      const devices = [
        descriptor({
          qualifiedId: "shelly:missing",
          capabilities: [powerCapability(), energyCapability("Wh")],
          state: {},
        }),
        descriptor({
          qualifiedId: "shelly:nan",
          capabilities: [powerCapability()],
          state: { power: Number.NaN },
        }),
        descriptor({
          qualifiedId: "shelly:infinity",
          capabilities: [powerCapability()],
          state: { power: Number.POSITIVE_INFINITY },
        }),
        descriptor({
          qualifiedId: "shelly:string",
          capabilities: [powerCapability()],
          state: { power: "12" },
        }),
      ];
      const aggregator = new EnergyAggregator(
        accessor(devices),
        { sampleIntervalMs: 1000, historyMinutes: 0 },
        logger,
      );

      const snapshot = aggregator.snapshot();
      expect(snapshot.powerWatts).toBe(0);
      expect(snapshot.energyWh).toBe(0);
      expect(snapshot.breakdown).toHaveLength(4);
      for (const entry of snapshot.breakdown) {
        expect(entry.available).toBe(true);
        expect(entry.powerWatts).toBeUndefined();
        expect(entry.energyWh).toBeUndefined();
      }
    });

    it("reports an unreachable device unavailable and excludes it from both sums", () => {
      const devices = [
        descriptor({
          qualifiedId: "shelly:up",
          displayName: "Up",
          state: { power: 10, energy: 1000 },
          capabilities: [powerCapability(), energyCapability("Wh")],
        }),
        descriptor({
          qualifiedId: "shelly:down",
          displayName: "Down",
          reachable: false,
          state: { power: 50, energy: 5000 },
          capabilities: [powerCapability(), energyCapability("Wh")],
        }),
      ];
      const aggregator = new EnergyAggregator(
        accessor(devices),
        { sampleIntervalMs: 1000, historyMinutes: 0 },
        logger,
      );

      const snapshot = aggregator.snapshot();
      expect(snapshot.powerWatts).toBe(10);
      expect(snapshot.energyWh).toBe(1000);

      const down = snapshot.breakdown.find((entry) => entry.qualifiedId === "shelly:down");
      expect(down?.available).toBe(false);
      expect(down?.powerWatts).toBeUndefined();
      expect(down?.energyWh).toBeUndefined();
    });

    it("returns a copy of the retained history so callers cannot mutate the ring", () => {
      const aggregator = new EnergyAggregator(
        accessor([]),
        { sampleIntervalMs: 1000, historyMinutes: 10 },
        logger,
      );
      aggregator.sample();
      const first = aggregator.snapshot();
      first.history.push({ timestamp: 999, powerWatts: 999 });
      expect(aggregator.snapshot().history).toHaveLength(1);
    });
  });

  describe("history bounds", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("caps retained samples at the window divided by the interval", () => {
      jest.setSystemTime(1_000_000);
      const aggregator = new EnergyAggregator(
        accessor([]),
        { sampleIntervalMs: 1000, historyMinutes: 1 },
        logger,
      );

      // start() takes one sample, then 120 more arrive over 120_000ms.
      aggregator.start();
      jest.advanceTimersByTime(120_000);

      const history = aggregator.snapshot().history;
      expect(history).toHaveLength(60);
      expect(history[0]?.timestamp).toBe(1_061_000);
      expect(history[59]?.timestamp).toBe(1_120_000);

      aggregator.stop();
    });

    it("keeps history empty when disabled but still reports current totals", () => {
      jest.setSystemTime(1_000_000);
      const devices = [
        descriptor({
          qualifiedId: "shelly:plug",
          state: { power: 42, energy: 1000 },
          capabilities: [powerCapability(), energyCapability("Wh")],
        }),
      ];
      const aggregator = new EnergyAggregator(
        accessor(devices),
        { sampleIntervalMs: 1000, historyMinutes: 0 },
        logger,
      );

      aggregator.start();
      jest.advanceTimersByTime(5000);

      const snapshot = aggregator.snapshot();
      expect(snapshot.history).toEqual([]);
      expect(snapshot.powerWatts).toBe(42);
      expect(snapshot.energyWh).toBe(1000);

      aggregator.stop();
    });
  });

  describe("windowed usage", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("reports the cumulative change over a fully covered window", () => {
      jest.setSystemTime(1_000_000);
      const { accessor: devices, set } = mutableAccessor(scenario(1000));
      const aggregator = new EnergyAggregator(
        devices,
        { sampleIntervalMs: 1000, historyMinutes: 1 },
        logger,
      );

      // The cumulative ring retains the power samples plus one baseline, so 61
      // samples at a 1s interval span the one-minute window exactly.
      aggregator.start();
      set(scenario(1600));
      jest.advanceTimersByTime(60_000);

      const snapshot = aggregator.snapshot();
      expect(snapshot.windowMinutes).toBe(1);
      expect(snapshot.coveredMinutes).toBe(1);
      expect(snapshot.usageWh).toBe(600);

      aggregator.stop();
    });

    it("sums each device's change across the retained span", () => {
      jest.setSystemTime(1_000_000);
      const { accessor: devices, set } = mutableAccessor([
        energyDevice("shelly:a", 1000),
        energyDevice("shelly:b", 200),
      ]);
      const aggregator = new EnergyAggregator(
        devices,
        { sampleIntervalMs: 1000, historyMinutes: 10 },
        logger,
      );

      aggregator.start();
      set([energyDevice("shelly:a", 1600), energyDevice("shelly:b", 500)]);
      jest.advanceTimersByTime(1000);

      // 600 Wh from `a` plus 300 Wh from `b`.
      const snapshot = aggregator.snapshot();
      expect(snapshot.usageWh).toBe(900);

      aggregator.stop();
    });

    it("reports a partial window with the span it actually covers", () => {
      jest.setSystemTime(1_000_000);
      const { accessor: devices, set } = mutableAccessor(scenario(1000));
      const aggregator = new EnergyAggregator(
        devices,
        { sampleIntervalMs: 1000, historyMinutes: 10 },
        logger,
      );

      aggregator.start();
      set(scenario(1300));
      jest.advanceTimersByTime(30_000);

      const snapshot = aggregator.snapshot();
      expect(snapshot.windowMinutes).toBe(10);
      expect(snapshot.coveredMinutes).toBe(0.5);
      expect(snapshot.usageWh).toBe(300);

      aggregator.stop();
    });

    it("reports usage as absent when no retained sample precedes the newest", () => {
      jest.setSystemTime(1_000_000);
      const aggregator = new EnergyAggregator(
        accessor(scenario(1000)),
        { sampleIntervalMs: 1000, historyMinutes: 1 },
        logger,
      );

      // A single sample is no baseline: the window is uncovered, so the usage is
      // absent rather than a zero.
      aggregator.start();

      const snapshot = aggregator.snapshot();
      expect(snapshot.windowMinutes).toBe(1);
      expect("usageWh" in snapshot).toBe(false);
      expect("coveredMinutes" in snapshot).toBe(false);

      aggregator.stop();
    });

    it("reports no window at all when history is disabled", () => {
      const aggregator = new EnergyAggregator(
        accessor(scenario(1000)),
        { sampleIntervalMs: 1000, historyMinutes: 0 },
        logger,
      );

      const snapshot = aggregator.snapshot();
      expect("windowMinutes" in snapshot).toBe(false);
      expect("usageWh" in snapshot).toBe(false);
      expect("coveredMinutes" in snapshot).toBe(false);
    });

    it("excludes a device that is unreachable or silent at both ends", () => {
      jest.setSystemTime(1_000_000);
      const { accessor: devices, set } = mutableAccessor([
        energyDevice("shelly:plug", 1000),
        descriptor({
          qualifiedId: "shelly:offline",
          reachable: false,
          state: { energy: 9999 },
          capabilities: [energyCapability("Wh")],
        }),
        descriptor({
          qualifiedId: "shelly:silent",
          state: {},
          capabilities: [energyCapability("Wh")],
        }),
      ]);
      const aggregator = new EnergyAggregator(
        devices,
        { sampleIntervalMs: 1000, historyMinutes: 10 },
        logger,
      );

      aggregator.start();
      set([
        energyDevice("shelly:plug", 1300),
        descriptor({
          qualifiedId: "shelly:offline",
          reachable: false,
          state: { energy: 9999 },
          capabilities: [energyCapability("Wh")],
        }),
        descriptor({
          qualifiedId: "shelly:silent",
          state: {},
          capabilities: [energyCapability("Wh")],
        }),
      ]);
      jest.advanceTimersByTime(1000);

      // Only the reachable device declaring a reading contributes: the offline
      // device's 9999 Wh and the silent device's absent reading never enter either
      // end, rather than being counted as having consumed nothing.
      const snapshot = aggregator.snapshot();
      expect(snapshot.usageWh).toBe(300);

      aggregator.stop();
    });

    it("excludes a device that drops out mid-window instead of subtracting it", () => {
      jest.setSystemTime(1_000_000);
      const { accessor: devices, set } = mutableAccessor([
        energyDevice("shelly:steady", 1000),
        energyDevice("shelly:dropping", 5000),
      ]);
      const aggregator = new EnergyAggregator(
        devices,
        { sampleIntervalMs: 1000, historyMinutes: 10 },
        logger,
      );

      aggregator.start();
      set([
        energyDevice("shelly:steady", 1300),
        descriptor({
          qualifiedId: "shelly:dropping",
          reachable: false,
          state: { energy: 5000 },
          capabilities: [energyCapability("Wh")],
        }),
      ]);
      jest.advanceTimersByTime(1000);

      // `steady` is the only device reporting at both ends, so the usage is its
      // 300 Wh change: the dropped device's 5000 Wh is excluded, not subtracted —
      // a pre-summed home reading would report 1300 - 6000 = a negative 4700.
      const snapshot = aggregator.snapshot();
      expect(snapshot.usageWh).toBe(300);
      expect(snapshot.usageWh ?? 0).toBeGreaterThanOrEqual(0);

      aggregator.stop();
    });

    it("reports usage as absent when no device reports at both ends", () => {
      jest.setSystemTime(1_000_000);
      const { accessor: devices, set } = mutableAccessor([
        energyDevice("shelly:a", 1000),
        descriptor({
          qualifiedId: "shelly:b",
          reachable: false,
          state: { energy: 5000 },
          capabilities: [energyCapability("Wh")],
        }),
      ]);
      const aggregator = new EnergyAggregator(
        devices,
        { sampleIntervalMs: 1000, historyMinutes: 10 },
        logger,
      );

      aggregator.start();
      // `a` drops out just as `b` recovers: no device is present at both ends, so
      // the window's usage is absent rather than a false zero.
      set([
        descriptor({
          qualifiedId: "shelly:a",
          reachable: false,
          state: { energy: 1000 },
          capabilities: [energyCapability("Wh")],
        }),
        energyDevice("shelly:b", 5000),
      ]);
      jest.advanceTimersByTime(1000);

      const snapshot = aggregator.snapshot();
      expect(snapshot.windowMinutes).toBe(10);
      expect("usageWh" in snapshot).toBe(false);
      expect("coveredMinutes" in snapshot).toBe(false);

      aggregator.stop();
    });
  });
});
