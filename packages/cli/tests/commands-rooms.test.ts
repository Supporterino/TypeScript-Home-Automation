import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { DeviceDescriptor, RoomWithMembers } from "@ts-ha/shared";
import type { DebugClient } from "../src/client.js";
import {
  assignRoom,
  createRoom,
  deleteRoom,
  getRoom,
  listRooms,
  renameRoom,
  sendRoomCommand,
  unassignRoom,
} from "../src/commands/rooms.js";

// specs/cli "Command Surface" — `ts-ha rooms` (task 3.3).

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

const rooms: RoomWithMembers[] = [
  {
    id: "living",
    name: "Living Room",
    members: [
      { qualifiedId: "zigbee:0x1", available: true, device: descriptor() },
      { qualifiedId: "shelly:tv", available: false, device: null },
    ],
  },
];

function createClient(overrides: Partial<Record<string, unknown>> = {}): DebugClient {
  return {
    getRooms: mock(async () => ({ rooms, count: rooms.length })),
    createRoom: mock(async (name: string) => ({ id: "new", name })),
    renameRoom: mock(async (id: string, name: string) => ({ id, name })),
    deleteRoom: mock(async (id: string) => ({ id, deleted: true })),
    sendRoomCommand: mock(async () => [
      { qualifiedId: "zigbee:0x1", outcome: "applied" },
      { qualifiedId: "shelly:tv", outcome: "skipped" },
      { qualifiedId: "shelly:x", outcome: "failed" },
    ]),
    getDeviceCatalog: mock(async () => ({
      devices: [descriptor()],
      count: 1,
      sources: ["zigbee"],
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

describe("rooms list/get", () => {
  it("lists rooms with member counts", async () => {
    const client = createClient();

    await listRooms(client, false);

    const text = output(console.log as ReturnType<typeof mock>);
    expect(text).toContain("Living Room");
    expect(text).toContain("living");
    expect(text).toContain("1 room");
  });

  it("shows a room's membership", async () => {
    const client = createClient();

    await getRoom(client, "living", false);

    const text = output(console.log as ReturnType<typeof mock>);
    expect(text).toContain("Living Room");
    expect(text).toContain("Kitchen Light");
    expect(text).toContain("(unavailable)");
  });

  it("reports an unknown room and exits", async () => {
    const client = createClient();
    process.exit = mock((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as unknown as typeof process.exit;

    await expect(getRoom(client, "nope", false)).rejects.toThrow("exit:1");
    expect(output(console.error as ReturnType<typeof mock>)).toContain("Room not found: nope");
  });
});

describe("rooms CRUD", () => {
  it("creates a room", async () => {
    const client = createClient();

    await createRoom(client, "Living Room", false);

    expect(calls(client.createRoom)[0]).toEqual(["Living Room"]);
    expect(output(console.log as ReturnType<typeof mock>)).toContain('Created room "Living Room"');
  });

  it("renames a room", async () => {
    const client = createClient();

    await renameRoom(client, "living", "Lounge", false);

    expect(calls(client.renameRoom)[0]).toEqual(["living", "Lounge"]);
    expect(output(console.log as ReturnType<typeof mock>)).toContain("Renamed room living");
  });

  it("deletes a room", async () => {
    const client = createClient();

    await deleteRoom(client, "living", false);

    expect(calls(client.deleteRoom)[0]).toEqual(["living"]);
    expect(output(console.log as ReturnType<typeof mock>)).toContain("Deleted room living");
  });
});

describe("rooms command", () => {
  it("reports each member's outcome and the summary", async () => {
    const client = createClient();

    await sendRoomCommand(client, "living", "state", "ON", false);

    expect(calls(client.sendRoomCommand)[0]).toEqual(["living", { state: "ON" }]);
    const text = output(console.log as ReturnType<typeof mock>);
    expect(text).toContain("zigbee:0x1");
    expect(text).toContain("applied");
    expect(text).toContain("skipped");
    expect(text).toContain("failed");
    expect(text).toContain("1 applied, 1 skipped, 1 failed");
  });
});

describe("rooms assign/unassign", () => {
  it("assigns and unassigns the resolved device", async () => {
    const client = createClient();

    await assignRoom(client, "kitchen", "living", false);
    expect(calls(client.assignDeviceRoom)[0]).toEqual(["zigbee:0x1", "living"]);

    await unassignRoom(client, "kitchen", false);
    expect(calls(client.unassignDeviceRoom)[0]).toEqual(["zigbee:0x1"]);
  });
});
