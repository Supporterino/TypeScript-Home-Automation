import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { DeviceDescriptor } from "@ts-ha/shared";
import { type DebugClient, httpError } from "../src/client.js";
import {
  assignDeviceRoom,
  sendDeviceCommand,
  setDeviceHidden,
  unassignDeviceRoom,
} from "../src/commands/devices.js";

// specs/cli "Command Surface" / "Device Addressing" (task 3.2).

const originalLog = console.log;
const originalError = console.error;
const originalExit = process.exit;

function descriptor(overrides: Partial<DeviceDescriptor> = {}): DeviceDescriptor {
  return {
    source: "zigbee",
    id: "0x1",
    qualifiedId: "zigbee:0x1",
    displayName: "Kitchen Light",
    state: {},
    capabilities: [],
    reachable: true,
    observation: { mode: "push", observedAt: 0 },
    hidden: false,
    ...overrides,
  };
}

function createClient(overrides: Partial<Record<string, unknown>> = {}): DebugClient {
  return {
    getDeviceCatalog: mock(async () => ({
      devices: [descriptor()],
      count: 1,
      sources: ["zigbee"],
    })),
    sendDeviceCommand: mock(async () => ({ qualifiedId: "zigbee:0x1", status: "ok" })),
    setDeviceHidden: mock(async (_qid: string, hidden: boolean) => ({
      qualifiedId: "zigbee:0x1",
      hidden,
    })),
    assignDeviceRoom: mock(async () => ({ qualifiedId: "zigbee:0x1", roomId: "living" })),
    unassignDeviceRoom: mock(async () => ({ qualifiedId: "zigbee:0x1", roomId: null })),
    ...overrides,
  } as unknown as DebugClient;
}

function output(log: ReturnType<typeof mock>): string {
  return log.mock.calls.map((call) => call.join(" ")).join("\n");
}

function calls(fn: unknown): unknown[][] {
  return (fn as ReturnType<typeof mock>).mock.calls;
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

describe("devices command", () => {
  it("resolves the device and sends the parsed command", async () => {
    const client = createClient();

    await sendDeviceCommand(client, "kitchen", "state", "ON", false);

    expect(calls(client.sendDeviceCommand)[0]).toEqual(["zigbee:0x1", { state: "ON" }]);
    expect(output(console.log as ReturnType<typeof mock>)).toContain("Commanded");
    expect(output(console.log as ReturnType<typeof mock>)).toContain("state = ON");
  });

  it("falls back to the raw string when the value is not JSON", async () => {
    const client = createClient();

    await sendDeviceCommand(client, "zigbee:0x1", "color_mode", "warm", false);

    expect(calls(client.sendDeviceCommand)[0]).toEqual(["zigbee:0x1", { color_mode: "warm" }]);
  });

  it("parses a JSON numeric value", async () => {
    const client = createClient();

    await sendDeviceCommand(client, "zigbee:0x1", "brightness", "75", false);

    expect(calls(client.sendDeviceCommand)[0]).toEqual(["zigbee:0x1", { brightness: 75 }]);
  });

  it("reports an unknown device and exits", async () => {
    const client = createClient();
    process.exit = mock((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as unknown as typeof process.exit;

    await expect(sendDeviceCommand(client, "missing", "state", "ON", false)).rejects.toThrow(
      "exit:1",
    );
    expect(output(console.error as ReturnType<typeof mock>)).toContain("Device not found: missing");
  });

  it("reports a refused command distinctly and exits", async () => {
    const client = createClient({
      sendDeviceCommand: mock(async () => {
        throw httpError("Invalid command", 400);
      }),
    });
    process.exit = mock((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as unknown as typeof process.exit;

    await expect(sendDeviceCommand(client, "zigbee:0x1", "state", "BOGUS", false)).rejects.toThrow(
      "exit:1",
    );
    expect(output(console.error as ReturnType<typeof mock>)).toContain("Refused");
    expect(output(console.error as ReturnType<typeof mock>)).toContain("Invalid command");
  });
});

describe("devices hide/unhide", () => {
  it("hides and unhides through setDeviceHidden", async () => {
    const client = createClient();

    await setDeviceHidden(client, "kitchen", true, false);
    expect(calls(client.setDeviceHidden)[0]).toEqual(["zigbee:0x1", true]);
    expect(output(console.log as ReturnType<typeof mock>)).toContain("now hidden");

    await setDeviceHidden(client, "kitchen", false, false);
    expect(calls(client.setDeviceHidden)[1]).toEqual(["zigbee:0x1", false]);
    expect(output(console.log as ReturnType<typeof mock>)).toContain("now visible");
  });
});

describe("devices assign/unassign", () => {
  it("assigns and unassigns the resolved device", async () => {
    const client = createClient();

    await assignDeviceRoom(client, "kitchen", "living", false);
    expect(calls(client.assignDeviceRoom)[0]).toEqual(["zigbee:0x1", "living"]);
    expect(output(console.log as ReturnType<typeof mock>)).toContain("Assigned");

    await unassignDeviceRoom(client, "kitchen", false);
    expect(calls(client.unassignDeviceRoom)[0]).toEqual(["zigbee:0x1"]);
    expect(output(console.log as ReturnType<typeof mock>)).toContain("Unassigned");
  });
});
