import { describe, expect, it } from "bun:test";
import type { DeviceDescriptor } from "@ts-ha/shared";
import { resolveDevice } from "../src/device-resolution.js";

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

const devices: DeviceDescriptor[] = [
  descriptor({
    source: "zigbee",
    id: "0x01",
    qualifiedId: "zigbee:0x01",
    displayName: "Hallway Light",
  }),
  descriptor({
    source: "zigbee",
    id: "0x02",
    qualifiedId: "zigbee:0x02",
    displayName: "Kitchen Light",
  }),
  descriptor({ source: "shelly", id: "tv", qualifiedId: "shelly:tv", displayName: "TV Plug" }),
];

describe("resolveDevice", () => {
  it("matches an exact qualified id", () => {
    const result = resolveDevice(devices, "shelly:tv");
    expect(result.status).toBe("match");
    if (result.status === "match") expect(result.device.qualifiedId).toBe("shelly:tv");
  });

  it("prefers an exact id over a display-name substring", () => {
    // "zigbee:0x01" contains no name, but ensure the id path wins even when a
    // result also matches a substring of another name.
    const result = resolveDevice(devices, "zigbee:0x02");
    expect(result.status).toBe("match");
    if (result.status === "match") expect(result.device.qualifiedId).toBe("zigbee:0x02");
  });

  it("resolves a unique case-insensitive name substring", () => {
    const result = resolveDevice(devices, "kitchen");
    expect(result.status).toBe("match");
    if (result.status === "match") expect(result.device.qualifiedId).toBe("zigbee:0x02");
  });

  it("resolves a mixed-case substring", () => {
    const result = resolveDevice(devices, "TV pLuG");
    expect(result.status).toBe("match");
    if (result.status === "match") expect(result.device.qualifiedId).toBe("shelly:tv");
  });

  it("reports ambiguity with all candidates", () => {
    const result = resolveDevice(devices, "light");
    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.candidates.map((d) => d.qualifiedId)).toEqual(["zigbee:0x01", "zigbee:0x02"]);
    }
  });

  it("reports absence", () => {
    const result = resolveDevice(devices, "nonexistent");
    expect(result.status).toBe("missing");
    if (result.status === "missing") expect(result.query).toBe("nonexistent");
  });

  it("treats an empty query as missing", () => {
    expect(resolveDevice(devices, "").status).toBe("missing");
  });
});
