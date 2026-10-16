import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Capability, DeviceDescriptor, RoomMember } from "@ts-ha/shared";
import { WALL_CARD_METRICS, WALL_CARD_SECONDARY_FONT_SIZE } from "../src/app/wall/cards/metrics.js";
import { actuatableRoomMembers, roomTiles } from "../src/app/wall/widgets/room-model.js";

// Pure member selection for the wall room widget — no DOM. An all-off/all-on command
// must include every actuatable member and exclude report-only (and unavailable) members.

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
    // The order the card has always drawn: live tiles, then the members whose device is gone.
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

// The card's own chrome, composed from the wall's single card vocabulary. There is no
// DOM harness here, so the composition is asserted structurally.
const APP_DIR = join(import.meta.dir, "..", "src/app");
const ROOM_WIDGET = join(APP_DIR, "wall/widgets/RoomWidget.tsx");
const ANATOMY = join(APP_DIR, "wall/cards/card-anatomy.tsx");

/** Removes block and line comments so prose is not mistaken for code. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function readSource(path: string): Promise<string> {
  return stripComments(await readFile(path, "utf8"));
}

describe("the room card's own chrome", () => {
  it("leads with the vocabulary's state item at the ported glyph side", async () => {
    const widget = await readSource(ROOM_WIDGET);

    // The head is the vocabulary's own state item — the ported circular affordance
    // and its label — so the widget declares no head of its own.
    expect(widget).toContain("<WallCardStateItem");
    expect(widget).toContain("WALL_CARD_GLYPH_SIZE");
  });

  it("draws the member count at the ported secondary size", async () => {
    const widget = await readSource(ROOM_WIDGET);
    const anatomy = await readSource(ANATOMY);

    // The count is the widget's caption, handed to the vocabulary's own reading part with no
    // tier of its own.
    expect(widget).toContain("<WallCardReading>{memberCount}</WallCardReading>");
    expect(anatomy).toContain("size = WALL_CARD_SECONDARY_FONT_SIZE");
    expect(WALL_CARD_SECONDARY_FONT_SIZE).toBe(`${WALL_CARD_METRICS.secondarySize}px`);
  });

  it("draws the room-wide commands as the ported control in the actions row", async () => {
    const widget = await readSource(ROOM_WIDGET);

    // The batch command row is the vocabulary's own actions row at the ported control spacing,
    // carrying the vocabulary's labelled controls — two fixed-size controls, distributed.
    expect(widget).toContain('<WallCardActions distribution="distributed">');
    expect(widget).toContain("<WallCardControl");
    expect(widget).toContain('label="All on"');
    expect(widget).toContain('label="All off"');
  });
});
