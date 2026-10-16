import { describe, expect, it } from "bun:test";
import {
  type DeviceMapEvent,
  reduceDeviceEvent,
  unknownDeviceDeltaId,
} from "../src/app/lib/device-reduction.js";
import type { DeviceDescriptor } from "../src/app/types.js";

// Client-side reconciliation of the stream's per-connection device snapshot. Both
// seams are pure, so recovery is reachable here without a DOM.

function device(qualifiedId: string, overrides: Partial<DeviceDescriptor> = {}): DeviceDescriptor {
  return {
    source: "zigbee",
    id: qualifiedId,
    qualifiedId,
    displayName: qualifiedId,
    state: {},
    capabilities: [],
    reachable: true,
    observation: { mode: "push", observedAt: 0 },
    hidden: false,
    ...overrides,
  };
}

describe("reduceDeviceEvent snapshot merge", () => {
  it("merges a device_appeared by id without dropping other devices", () => {
    const before = new Map([
      ["zigbee:0x1", device("zigbee:0x1")],
      ["shelly:plug", device("shelly:plug")],
    ]);

    const next = reduceDeviceEvent(before, {
      category: "device_appeared",
      device: device("zigbee:0x1", { displayName: "Lamp", reachable: false }),
    });

    expect(next.size).toBe(2);
    expect([...next.keys()].sort()).toEqual(["shelly:plug", "zigbee:0x1"]);
    expect(next.get("zigbee:0x1")?.displayName).toBe("Lamp");
    expect(next.get("zigbee:0x1")?.reachable).toBe(false);
    expect(next.get("shelly:plug")).toBe(before.get("shelly:plug"));
  });

  it("does not mutate the input map when merging a snapshot", () => {
    const before = new Map([["zigbee:0x1", device("zigbee:0x1", { displayName: "Old" })]]);

    reduceDeviceEvent(before, {
      category: "device_appeared",
      device: device("zigbee:0x1", { displayName: "New" }),
    });

    expect(before.get("zigbee:0x1")?.displayName).toBe("Old");
  });
});

describe("unknownDeviceDeltaId", () => {
  const known = new Map([["zigbee:0x1", device("zigbee:0x1")]]);

  it("reports the id of each delta for a device the client does not hold", () => {
    const deltas: DeviceMapEvent[] = [
      {
        category: "device_state",
        qualifiedId: "zigbee:missing",
        properties: { on: true },
        observation: { mode: "push", observedAt: 1 },
      },
      { category: "device_reachability", qualifiedId: "zigbee:missing", reachable: false },
      { category: "device_visibility", qualifiedId: "zigbee:missing", hidden: true },
    ];

    for (const event of deltas) {
      expect(unknownDeviceDeltaId(known, event)).toBe("zigbee:missing");
    }
  });

  it("reports an unknown delta against an empty map", () => {
    const empty = new Map<string, DeviceDescriptor>();
    const event: DeviceMapEvent = {
      category: "device_state",
      qualifiedId: "zigbee:missing",
      properties: { on: true },
      observation: { mode: "push", observedAt: 1 },
    };

    expect(unknownDeviceDeltaId(empty, event)).toBe("zigbee:missing");
  });

  it("returns null for a delta targeting a known device", () => {
    const event: DeviceMapEvent = {
      category: "device_reachability",
      qualifiedId: "zigbee:0x1",
      reachable: false,
    };

    expect(unknownDeviceDeltaId(known, event)).toBeNull();
  });

  it("returns null for device_appeared and device_disappeared", () => {
    const appeared: DeviceMapEvent = {
      category: "device_appeared",
      device: device("zigbee:new"),
    };
    const disappeared: DeviceMapEvent = {
      category: "device_disappeared",
      qualifiedId: "zigbee:missing",
    };

    expect(unknownDeviceDeltaId(known, appeared)).toBeNull();
    expect(unknownDeviceDeltaId(known, disappeared)).toBeNull();
  });
});
