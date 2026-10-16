import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { DeviceDescriptor } from "@ts-ha/shared";
import type { DebugClient } from "../src/client.js";
import { getDevice, listDevices } from "../src/commands/devices.js";
import { projectDeviceRows } from "../src/device-rows.js";

// The devices command reads the unified catalog and renders source-neutral descriptor rows.

const originalLog = console.log;
const originalError = console.error;
const originalExit = process.exit;

function descriptor(overrides: Partial<DeviceDescriptor>): DeviceDescriptor {
  return {
    source: "zigbee",
    id: "0x01",
    qualifiedId: "zigbee:0x01",
    displayName: "Hallway Light",
    state: { state: "ON" },
    capabilities: [
      {
        kind: "switch",
        property: "state",
        access: { readable: true, writable: true },
        valueType: "boolean",
      },
    ],
    reachable: true,
    observation: { mode: "push", observedAt: 1_700_000_000_000 },
    hidden: false,
    ...overrides,
  };
}

const devices: DeviceDescriptor[] = [
  descriptor({}),
  descriptor({
    source: "shelly",
    id: "tv",
    qualifiedId: "shelly:tv",
    displayName: "TV Plug",
    state: { power: 12.5, on: true },
    capabilities: [
      {
        kind: "switch",
        property: "on",
        access: { readable: true, writable: true },
        valueType: "boolean",
      },
      {
        kind: "numeric",
        property: "power",
        access: { readable: true, writable: false },
        valueType: "numeric",
        unit: "W",
      },
    ],
    reachable: false,
    observation: { mode: "polled", observedAt: 1_700_000_001_000, refreshIntervalMs: 10_000 },
  }),
];

function createClient(catalog: {
  devices: DeviceDescriptor[];
  count: number;
  sources: string[];
}): DebugClient {
  return {
    getDeviceCatalog: mock(async () => catalog),
    getDevice: mock(async (qualifiedId: string) => {
      const found = catalog.devices.find((d) => d.qualifiedId === qualifiedId);
      if (!found) throw new Error("Device not found");
      return found;
    }),
  } as unknown as DebugClient;
}

function output(log: ReturnType<typeof mock>): string {
  return log.mock.calls.map((call) => call.join(" ")).join("\n");
}

beforeEach(() => {
  console.log = mock(() => {}) as unknown as typeof console.log;
  console.error = mock(() => {}) as unknown as typeof console.error;
});

afterEach(() => {
  console.log = originalLog;
  console.error = originalError;
  process.exit = originalExit;
});

describe("device row projection", () => {
  it("projects source-neutral catalog rows", () => {
    const rows = projectDeviceRows(devices);

    expect(rows).toEqual([
      {
        qualifiedId: "zigbee:0x01",
        displayName: "Hallway Light",
        source: "zigbee",
        reachable: true,
        stateKeyCount: 1,
        capabilityCount: 1,
      },
      {
        qualifiedId: "shelly:tv",
        displayName: "TV Plug",
        source: "shelly",
        reachable: false,
        stateKeyCount: 2,
        capabilityCount: 2,
      },
    ]);
  });

  it("carries no legacy Zigbee fields", () => {
    for (const row of projectDeviceRows(devices)) {
      expect(Object.keys(row)).not.toContain("friendly_name");
      expect(Object.keys(row)).not.toContain("interview_state");
      expect(Object.keys(row)).not.toContain("ieee_address");
    }
  });
});

describe("listDevices", () => {
  it("renders a catalog table with source and reachability", async () => {
    const client = createClient({ devices, count: 2, sources: ["zigbee", "shelly"] });
    const log = console.log as ReturnType<typeof mock>;

    await listDevices(client, false);

    const text = output(log);
    expect(text).toContain("NAME");
    expect(text).toContain("SOURCE");
    expect(text).toContain("REACHABLE");
    expect(text).toContain("CAPABILITIES");
    expect(text).toContain("Hallway Light");
    expect(text).toContain("zigbee");
    expect(text).toContain("TV Plug");
    expect(text).toContain("shelly");
    const [zigbeeRow, shellyRow] = text.split("\n").filter((line) => /^(Hallway|TV)/.test(line));
    expect(zigbeeRow).toContain("yes");
    expect(shellyRow).toContain("no");
    expect(text).toContain("2 devices");
  });

  it("prints the raw catalog as JSON", async () => {
    const catalog = { devices, count: 2, sources: ["zigbee", "shelly"] };
    const client = createClient(catalog);
    const log = console.log as ReturnType<typeof mock>;

    await listDevices(client, true);

    const parsed = JSON.parse(output(log)) as { count: number; sources: string[] };
    expect(parsed.count).toBe(2);
    expect(parsed.sources).toEqual(["zigbee", "shelly"]);
  });

  it("reports an empty catalog", async () => {
    const client = createClient({ devices: [], count: 0, sources: [] });
    const log = console.log as ReturnType<typeof mock>;

    await listDevices(client, false);

    expect(output(log)).toContain("No devices tracked yet.");
  });
});

describe("getDevice", () => {
  it("resolves an exact qualified id and formats the descriptor", async () => {
    const client = createClient({ devices, count: 2, sources: ["zigbee", "shelly"] });
    const log = console.log as ReturnType<typeof mock>;

    await getDevice(client, "shelly:tv", false);

    const text = output(log);
    expect(text).toContain("Display Name:");
    expect(text).toContain("TV Plug");
    expect(text).toContain("Qualified ID:");
    expect(text).toContain("Capabilities");
    expect(text).toContain("power");
  });

  it("resolves a unique display-name substring", async () => {
    const client = createClient({ devices, count: 2, sources: ["zigbee", "shelly"] });
    const log = console.log as ReturnType<typeof mock>;

    await getDevice(client, "hallway", false);

    expect(output(log)).toContain("Hallway Light");
  });

  it("refuses an ambiguous name and exits", async () => {
    const ambiguous = [
      descriptor({ id: "0x0a", qualifiedId: "zigbee:0x0a", displayName: "Bedroom Light" }),
      descriptor({ id: "0x0b", qualifiedId: "zigbee:0x0b", displayName: "Bedroom Light 2" }),
    ];
    const client = createClient({ devices: ambiguous, count: 2, sources: ["zigbee"] });
    process.exit = mock((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as unknown as typeof process.exit;

    await expect(getDevice(client, "bedroom", false)).rejects.toThrow("exit:1");
    const err = output(console.error as ReturnType<typeof mock>);
    expect(err).toContain("ambiguous");
    expect(err).toContain("zigbee:0x0a");
    expect(err).toContain("zigbee:0x0b");
  });

  it("reports an unknown device and exits", async () => {
    const client = createClient({ devices, count: 2, sources: ["zigbee", "shelly"] });
    process.exit = mock((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as unknown as typeof process.exit;

    await expect(getDevice(client, "missing", false)).rejects.toThrow("exit:1");
    expect(output(console.error as ReturnType<typeof mock>)).toContain("Device not found: missing");
  });
});
