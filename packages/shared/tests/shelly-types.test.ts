import { describe, expect, it } from "bun:test";
import type {
  ShellyComponentStatus,
  ShellyComponentsStatus,
  ShellyDiscoveredComponent,
} from "../src/types/shelly.js";

describe("Shelly component-inventory types", () => {
  it("types both switch and cover component entries", () => {
    const switchEntry: ShellyComponentStatus = {
      key: "switch:2",
      kind: "switch",
      channel: 2,
      name: "Desk lamp",
      status: { output: true, aenergy: { total: 12.5 } },
    };
    const coverEntry: ShellyComponentStatus = {
      key: "cover:0",
      kind: "cover",
      channel: 0,
      name: null,
    };

    const inventory: ShellyComponentsStatus = {
      components: [switchEntry, coverEntry],
      total: 2,
      offset: 0,
    };

    expect(inventory.components.map((component) => component.kind)).toEqual(["switch", "cover"]);
    expect(inventory.components.map((component) => component.channel)).toEqual([2, 0]);
    expect(switchEntry.name).toBe("Desk lamp");
    expect(coverEntry.name).toBeNull();
  });

  it("types a discovered component descriptor", () => {
    const discovered: ShellyDiscoveredComponent = {
      channel: 1,
      kind: "switch",
      name: null,
      metered: true,
    };

    expect(discovered).toEqual({ channel: 1, kind: "switch", name: null, metered: true });
  });
});
