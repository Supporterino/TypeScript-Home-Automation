import { describe, expect, it } from "bun:test";
import {
  formatKwh,
  formatWatts,
  isEnergyRelevantEvent,
  SPARKLINE_HEIGHT,
  SPARKLINE_WIDTH,
  sparklineLabel,
  sparklinePoints,
  whToKwh,
} from "../src/app/lib/energy.js";

describe("isEnergyRelevantEvent", () => {
  it("triggers on device events that can change the aggregated totals", () => {
    for (const category of [
      "device_state",
      "device_reachability",
      "device_appeared",
      "device_disappeared",
    ] as const) {
      expect(isEnergyRelevantEvent({ category })).toBe(true);
    }
  });

  it("ignores unrelated stream events", () => {
    expect(isEnergyRelevantEvent({ category: "fell_behind" })).toBe(false);
    expect(isEnergyRelevantEvent({ category: "readiness", ready: true })).toBe(false);
    expect(isEnergyRelevantEvent({ category: "unknown" })).toBe(false);
  });
});

describe("energy formatting", () => {
  it("converts watt-hours to kilowatt-hours", () => {
    expect(whToKwh(1500)).toBe(1.5);
    expect(whToKwh(0)).toBe(0);
  });

  it("scales kWh decimal places to the magnitude", () => {
    expect(formatKwh(1250)).toBe("1.25 kWh");
    expect(formatKwh(15_000)).toBe("15.0 kWh");
    expect(formatKwh(250_000)).toBe("250 kWh");
  });

  it("formats watts as a whole number with a unit", () => {
    expect(formatWatts(42.6)).toBe("43 W");
    expect(formatWatts(0)).toBe("0 W");
  });
});

describe("sparklinePoints", () => {
  it("returns an empty string for an empty series", () => {
    expect(sparklinePoints([])).toBe("");
  });

  it("returns one point per sample", () => {
    const points = sparklinePoints([
      { timestamp: 0, powerWatts: 10 },
      { timestamp: 1, powerWatts: 20 },
      { timestamp: 2, powerWatts: 15 },
    ]).split(" ");
    expect(points).toHaveLength(3);
  });

  it("places a single sample at the horizontal midpoint", () => {
    const [point] = sparklinePoints([{ timestamp: 0, powerWatts: 10 }]).split(" ");
    expect(Number(point?.split(",")[0])).toBeCloseTo(SPARKLINE_WIDTH / 2, 5);
  });

  it("draws a higher reading higher on the canvas (smaller y)", () => {
    const [first, second] = sparklinePoints([
      { timestamp: 0, powerWatts: 5 },
      { timestamp: 1, powerWatts: 50 },
    ])
      .split(" ")
      .map((p) => Number(p.split(",")[1]));
    expect(first).toBeGreaterThan(second ?? Number.NaN);
  });

  it("renders a flat line when every sample is equal", () => {
    const ys = sparklinePoints([
      { timestamp: 0, powerWatts: 7 },
      { timestamp: 1, powerWatts: 7 },
      { timestamp: 2, powerWatts: 7 },
    ])
      .split(" ")
      .map((p) => p.split(",")[1]);
    expect(new Set(ys).size).toBe(1);
  });

  it("keeps every point inside the viewBox", () => {
    const coords = sparklinePoints([
      { timestamp: 0, powerWatts: 0 },
      { timestamp: 1, powerWatts: 9999 },
    ])
      .split(" ")
      .map((p) => p.split(",").map(Number));
    for (const [x, y] of coords) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(SPARKLINE_WIDTH);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(SPARKLINE_HEIGHT);
    }
  });

  it("describes the trend for assistive technology", () => {
    expect(sparklineLabel([])).toBe("");
    const label = sparklineLabel([
      { timestamp: 0, powerWatts: 5 },
      { timestamp: 1, powerWatts: 50 },
    ]);
    expect(label).toContain("2 samples");
    expect(label).toContain("5 W");
    expect(label).toContain("50 W");
  });
});
