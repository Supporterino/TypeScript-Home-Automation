import { describe, expect, it } from "bun:test";
import type { Capability, DeviceDescriptor, RoomMember } from "@ts-ha/shared";
import { actuatableRoomMembers, roomTiles } from "../src/app/wall/widgets/room-model.js";

// Pure member selection for the wall room widget — no DOM. An all-off/all-on
// command must include every actuatable member and exclude report-only (and
// unavailable) members, exactly as the batch endpoint will (design.md D5,
// D7; specs/wall-display "A room widget commands the room"; task 5.7).

const rw = { readable: true, writable: true };
const ro = { readable: true, writable: false };

function writableOnOff(): Capability {
  return { kind: "switch", property: "on", access: rw, valueType: "boolean" };
}

function readOnlySensor(): Capability {
  return { kind: "sensor", property: "temperature", access: ro, valueType: "numeric" };
}

function descriptor(qualifiedId: string, capabilities: Capability[]): DeviceDescriptor {
  return {
    source: "zigbee",
    id: qualifiedId,
    qualifiedId,
    displayName: qualifiedId,
    state: {},
    capabilities,
    reachable: true,
    observation: { mode: "push", observedAt: 0 },
    hidden: false,
  };
}

function member(qualifiedId: string, device: DeviceDescriptor | null): RoomMember {
  return { qualifiedId, available: device !== null, device };
}

describe("actuatableRoomMembers", () => {
  it("includes available members with a writable on/off capability", () => {
    const members: RoomMember[] = [
      member("zigbee:lamp", descriptor("zigbee:lamp", [writableOnOff()])),
      member("shelly:plug", descriptor("shelly:plug", [writableOnOff()])),
    ];

    expect(actuatableRoomMembers(members).map((m) => m.qualifiedId)).toEqual([
      "zigbee:lamp",
      "shelly:plug",
    ]);
  });

  it("excludes report-only members", () => {
    const members: RoomMember[] = [
      member("zigbee:motion", descriptor("zigbee:motion", [readOnlySensor()])),
      member("zigbee:lamp", descriptor("zigbee:lamp", [writableOnOff()])),
    ];

    expect(actuatableRoomMembers(members).map((m) => m.qualifiedId)).toEqual(["zigbee:lamp"]);
  });

  it("excludes a member whose device is unavailable", () => {
    const members: RoomMember[] = [
      member("zigbee:unpaired", null),
      member("zigbee:lamp", descriptor("zigbee:lamp", [writableOnOff()])),
    ];

    expect(actuatableRoomMembers(members).map((m) => m.qualifiedId)).toEqual(["zigbee:lamp"]);
  });

  it("preserves membership order", () => {
    const members: RoomMember[] = [
      member("zigbee:a", descriptor("zigbee:a", [writableOnOff()])),
      member("zigbee:b", descriptor("zigbee:b", [readOnlySensor()])),
      member("zigbee:c", descriptor("zigbee:c", [writableOnOff()])),
    ];

    expect(actuatableRoomMembers(members).map((m) => m.qualifiedId)).toEqual([
      "zigbee:a",
      "zigbee:c",
    ]);
  });

  it("returns an empty list for a room of only report-only members", () => {
    const members: RoomMember[] = [
      member("zigbee:motion", descriptor("zigbee:motion", [readOnlySensor()])),
      member("zigbee:contact", descriptor("zigbee:contact", [readOnlySensor()])),
    ];

    expect(actuatableRoomMembers(members)).toEqual([]);
  });
});

describe("roomTiles", () => {
  it("carries each available member with its live device", () => {
    const members: RoomMember[] = [
      member("zigbee:lamp", descriptor("zigbee:lamp", [writableOnOff()])),
    ];

    const tiles = roomTiles(members);
    expect(tiles.map((tile) => tile.qualifiedId)).toEqual(["zigbee:lamp"]);
    expect(tiles[0]?.device?.qualifiedId).toBe("zigbee:lamp");
  });

  it("draws the available members first, then the unavailable ones", () => {
    // The order the card has always drawn: live tiles, then the members whose
    // device is gone (design.md D13; specs/wall-display "Widget Catalog").
    const members: RoomMember[] = [
      member("zigbee:gone", null),
      member("zigbee:lamp", descriptor("zigbee:lamp", [writableOnOff()])),
      member("zigbee:unpaired", null),
      member("zigbee:plug", descriptor("zigbee:plug", [writableOnOff()])),
    ];

    expect(roomTiles(members).map((tile) => tile.qualifiedId)).toEqual([
      "zigbee:lamp",
      "zigbee:plug",
      "zigbee:gone",
      "zigbee:unpaired",
    ]);
    expect(roomTiles(members).map((tile) => tile.device !== null)).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it("returns no tiles for an empty room", () => {
    expect(roomTiles([])).toEqual([]);
  });
});
