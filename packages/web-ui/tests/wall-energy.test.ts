import { describe, expect, it } from "bun:test";
import type { EnergyData } from "@ts-ha/shared";
import { ENERGY_DEVICE_EVENT_CATEGORIES, isEnergyRelevantEvent } from "../src/app/lib/energy.js";
import { energyDisplay } from "../src/app/wall/widgets/energy-model.js";

describe("energyDisplay", () => {
  it("maps totals and the metering-device count to display strings", () => {
    const data: EnergyData = {
      powerWatts: 1234.4,
      energyWh: 1250,
      breakdown: [
        {
          qualifiedId: "shelly:kitchen",
          displayName: "Kitchen",
          powerWatts: 1234.4,
          energyWh: 1250,
          available: true,
        },
      ],
      history: [],
    };

    expect(energyDisplay(data)).toEqual({
      power: "1,234 W",
      consumption: "1.25 kWh",
      meteringCount: 1,
    });
  });

  it("renders zero totals and no metering devices without error", () => {
    const empty: EnergyData = { powerWatts: 0, energyWh: 0, breakdown: [], history: [] };
    expect(energyDisplay(empty)).toEqual({
      power: "0 W",
      consumption: "0.00 kWh",
      meteringCount: 0,
    });
  });
});

describe("energy refetch trigger", () => {
  it("refetches on every device event category and nothing else", () => {
    for (const category of ENERGY_DEVICE_EVENT_CATEGORIES) {
      expect(isEnergyRelevantEvent({ category })).toBe(true);
    }
    expect(isEnergyRelevantEvent({ category: "readiness", ready: true })).toBe(false);
    expect(isEnergyRelevantEvent({ category: "unknown" })).toBe(false);
  });
});
