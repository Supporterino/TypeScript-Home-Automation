import { describe, expect, it } from "bun:test";
import type { DeviceDescriptor } from "@ts-ha/shared";
import type { DevicesData } from "../src/components/types.js";
import { flattenCapabilities, projectDeviceRows } from "../src/device-rows.js";

// specs/cli "Command Surface" / dashboard Devices tab (task 1.4). The tab
// renders the catalog through a pure projection, so it is tested here without
// a React/OpenTUI render harness.

function descriptor(overrides: Partial<DeviceDescriptor>): DeviceDescriptor {
  return {
    source: "zigbee",
    id: "id",
    qualifiedId: "zigbee:id",
    displayName: "Device",
    state: {},
    capabilities: [],
    reachable: true,
    observation: { mode: "push", observedAt: 0 },
    hidden: false,
    ...overrides,
  };
}

const data: DevicesData = {
  sources: ["shelly", "zigbee"],
  count: 2,
  devices: [
    descriptor({
      source: "zigbee",
      id: "0x00124b0024c0ffee",
      qualifiedId: "zigbee:0x00124b0024c0ffee",
      displayName: "Kitchen Light",
      state: { state: "OFF", brightness: 0 },
      capabilities: [
        {
          kind: "light",
          access: { readable: true, writable: false },
          valueType: "composite",
          features: [
            {
              kind: "switch",
              property: "state",
              access: { readable: true, writable: true },
              valueType: "boolean",
            },
            {
              kind: "numeric",
              property: "brightness",
              access: { readable: true, writable: true },
              valueType: "numeric",
            },
          ],
        },
      ],
    }),
    descriptor({
      source: "shelly",
      id: "tv",
      qualifiedId: "shelly:tv",
      displayName: "TV Plug",
      state: {},
      capabilities: [
        {
          kind: "switch",
          property: "on",
          access: { readable: true, writable: true },
          valueType: "boolean",
        },
      ],
      reachable: false,
      observation: { mode: "polled", observedAt: 5, refreshIntervalMs: 10_000 },
    }),
  ],
};

describe("Devices tab projection", () => {
  it("renders a multi-source catalog with source, reachability, and counts", () => {
    const rows = projectDeviceRows(data.devices);

    expect(rows.map((row) => row.source)).toEqual(["zigbee", "shelly"]);
    expect(rows.map((row) => row.displayName)).toEqual(["Kitchen Light", "TV Plug"]);
    expect(rows[0]).toMatchObject({ reachable: true, stateKeyCount: 2, capabilityCount: 3 });
    expect(rows[1]).toMatchObject({ reachable: false, stateKeyCount: 0, capabilityCount: 1 });
  });

  it("counts nested container features as capabilities", () => {
    expect(flattenCapabilities(data.devices[0].capabilities)).toHaveLength(3);
  });

  it("carries no legacy Zigbee fields", () => {
    for (const row of projectDeviceRows(data.devices)) {
      expect(Object.keys(row)).not.toContain("friendly_name");
      expect(Object.keys(row)).not.toContain("interview_state");
      expect(Object.keys(row)).not.toContain("available");
    }
  });
});
