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
});
