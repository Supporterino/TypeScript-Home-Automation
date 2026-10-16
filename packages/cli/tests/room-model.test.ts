import { describe, expect, it } from "bun:test";
import type { DeviceDescriptor, RoomWithMembers } from "@ts-ha/shared";
import { parseRoomCommandInput, projectRoomRows, summarizeOutcomes } from "../src/room-model.js";

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
  { id: "kitchen", name: "Kitchen", members: [] },
];

describe("projectRoomRows", () => {
  it("projects rooms with their membership", () => {
    const rows = projectRoomRows(rooms);

    expect(rows[0]).toEqual({
      id: "living",
      name: "Living Room",
      memberCount: 2,
      members: [
        {
          qualifiedId: "zigbee:0x1",
          displayName: "Kitchen Light",
          available: true,
          reachable: true,
        },
        {
          qualifiedId: "shelly:tv",
          displayName: "(unavailable)",
          available: false,
          reachable: null,
        },
      ],
    });
    expect(rows[1]).toMatchObject({ id: "kitchen", memberCount: 0, members: [] });
  });
});

describe("parseRoomCommandInput", () => {
  it("parses a property and a raw-string value", () => {
    expect(parseRoomCommandInput("state ON")).toEqual({
      property: "state",
      properties: { state: "ON" },
    });
  });

  it("parses a JSON value", () => {
    expect(parseRoomCommandInput("brightness 75")).toEqual({
      property: "brightness",
      properties: { brightness: 75 },
    });
  });

  it("rejects an empty or property-only input", () => {
    expect(parseRoomCommandInput("")).toBeNull();
    expect(parseRoomCommandInput("state")).toBeNull();
  });
});

describe("summarizeOutcomes", () => {
  it("counts a mixed-outcome batch", () => {
    expect(
      summarizeOutcomes([
        { qualifiedId: "a", outcome: "applied" },
        { qualifiedId: "b", outcome: "skipped" },
        { qualifiedId: "c", outcome: "failed" },
        { qualifiedId: "d", outcome: "applied" },
      ]),
    ).toEqual({ applied: 2, skipped: 1, failed: 1 });
  });
});
