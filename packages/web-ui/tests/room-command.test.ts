import { describe, expect, it } from "bun:test";
import type { Capability, RoomCommandResult } from "@ts-ha/shared";
import {
  classifyRoomCommandResults,
  findOnOffCapability,
  groupOnOffCommand,
  mergeRoomCommandResults,
  type RoomCommandMember,
  supportsOnOffCommand,
} from "../src/app/lib/room-command.js";

// Pure room-command logic — no DOM. `findOnOffCapability`/`supportsOnOffCommand`
// decide whether a member is actuatable and under which on/off property family;
// `groupOnOffCommand` builds one request body per family (a mixed room needs
// two, since the endpoint rejects a property a member does not declare); the
// classifier drives per-member optimistic reconciliation (specs/web-ui
// "Room-Level Command"; tasks 10.1–10.3).

const rw = { readable: true, writable: true };
const ro = { readable: true, writable: false };

function capability(overrides: Partial<Capability> = {}): Capability {
  return { kind: "switch", property: "on", access: rw, valueType: "boolean", ...overrides };
}

/** A Zigbee2MQTT-style binary: `state` as a string-encoded boolean nested under a composite. */
function zigbeeLight(): Capability {
  return {
    kind: "light",
    access: rw,
    valueType: "composite",
    features: [capability({ kind: "binary", property: "state", valueOn: "ON", valueOff: "OFF" })],
  };
}

function member(qualifiedId: string, capabilities: Capability[]): RoomCommandMember {
  return { qualifiedId, capabilities };
}

describe("supportsOnOffCommand", () => {
  it("accepts a writable boolean on property", () => {
    expect(supportsOnOffCommand([capability()])).toBe(true);
  });

  it("accepts a nested writable boolean on property", () => {
    expect(
      supportsOnOffCommand([
        { kind: "light", access: rw, valueType: "composite", features: [capability()] },
      ]),
    ).toBe(true);
  });

  it("accepts a Zigbee state light nested under a composite", () => {
    expect(supportsOnOffCommand([zigbeeLight()])).toBe(true);
    expect(findOnOffCapability([zigbeeLight()])?.property).toBe("state");
  });

  it("rejects a read-only on property", () => {
    expect(supportsOnOffCommand([capability({ access: ro })])).toBe(false);
  });

  it("rejects a non-boolean on property", () => {
    expect(supportsOnOffCommand([capability({ valueType: "numeric" })])).toBe(false);
  });

  it("rejects a read-only state property", () => {
    expect(
      supportsOnOffCommand([
        capability({ property: "state", access: ro, valueOn: "ON", valueOff: "OFF" }),
      ]),
    ).toBe(false);
  });

  it("rejects a device with no writable on/off at all", () => {
    const sensor: Capability = {
      kind: "sensor",
      property: "temperature",
      access: ro,
      valueType: "numeric",
    };
    expect(supportsOnOffCommand([sensor])).toBe(false);
    expect(supportsOnOffCommand([])).toBe(false);
  });
});

describe("groupOnOffCommand", () => {
  it("builds the state body from the capability's declared encoding", () => {
    const members = [member("zigbee:light", [zigbeeLight()])];

    expect(groupOnOffCommand(members, true)).toEqual([{ property: "state", value: "ON", members }]);
    expect(groupOnOffCommand(members, false)[0]?.value).toBe("OFF");
  });

  it("uses a real boolean for a capability that declares no encoding", () => {
    const members = [member("shelly:plug", [capability()])];
    expect(groupOnOffCommand(members, true)[0]).toMatchObject({ property: "on", value: true });
  });

  it("issues one group for a homogeneous room", () => {
    const groups = groupOnOffCommand(
      [member("shelly:a", [capability()]), member("shelly:b", [capability()])],
      true,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.members.map((m) => m.qualifiedId)).toEqual(["shelly:a", "shelly:b"]);
  });

  it("issues one group per family for a mixed room", () => {
    const onMember = member("shelly:plug", [capability()]);
    const stateMember = member("zigbee:light", [zigbeeLight()]);

    const groups = groupOnOffCommand([onMember, stateMember], true);

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.property)).toEqual(["on", "state"]);
    expect(groups.map((g) => g.value)).toEqual([true, "ON"]);
    expect(groups[0]?.members).toEqual([onMember]);
    expect(groups[1]?.members).toEqual([stateMember]);
  });

  it("drops members with no writable on/off", () => {
    const sensor: Capability = {
      kind: "sensor",
      property: "temperature",
      access: ro,
      valueType: "numeric",
    };
    expect(groupOnOffCommand([member("zigbee:sensor", [sensor])], true)).toEqual([]);
  });
});

describe("mergeRoomCommandResults", () => {
  it("prefers a member's own family's outcome over another family's skip", () => {
    const onRequest: RoomCommandResult[] = [
      { qualifiedId: "shelly:plug", outcome: "applied" },
      { qualifiedId: "zigbee:light", outcome: "skipped" },
    ];
    const stateRequest: RoomCommandResult[] = [
      { qualifiedId: "shelly:plug", outcome: "skipped" },
      { qualifiedId: "zigbee:light", outcome: "failed" },
    ];

    expect(mergeRoomCommandResults([onRequest, stateRequest])).toEqual([
      { qualifiedId: "shelly:plug", outcome: "applied" },
      { qualifiedId: "zigbee:light", outcome: "failed" },
    ]);
  });

  it("keeps a member no family can address as skipped", () => {
    const merged = mergeRoomCommandResults([
      [
        { qualifiedId: "shelly:plug", outcome: "applied" },
        { qualifiedId: "zigbee:sensor", outcome: "skipped" },
      ],
      [
        { qualifiedId: "shelly:plug", outcome: "skipped" },
        { qualifiedId: "zigbee:sensor", outcome: "skipped" },
      ],
    ]);

    expect(classifyRoomCommandResults(merged)).toMatchObject({
      skipped: ["zigbee:sensor"],
      applied: ["shelly:plug"],
      failed: [],
    });
  });
});

describe("classifyRoomCommandResults", () => {
  it("partitions members into applied, skipped, and failed preserving order", () => {
    const results: RoomCommandResult[] = [
      { qualifiedId: "zigbee:a", outcome: "applied" },
      { qualifiedId: "zigbee:sensor", outcome: "skipped" },
      { qualifiedId: "zigbee:b", outcome: "failed" },
      { qualifiedId: "zigbee:c", outcome: "applied" },
      { qualifiedId: "zigbee:sensor2", outcome: "skipped" },
    ];

    expect(classifyRoomCommandResults(results)).toEqual({
      applied: ["zigbee:a", "zigbee:c"],
      skipped: ["zigbee:sensor", "zigbee:sensor2"],
      failed: ["zigbee:b"],
    });
  });

  it("returns empty buckets for an empty response", () => {
    expect(classifyRoomCommandResults([])).toEqual({ applied: [], skipped: [], failed: [] });
  });

  it("keeps a room of only sensors entirely in the skipped bucket", () => {
    const results: RoomCommandResult[] = [
      { qualifiedId: "zigbee:motion", outcome: "skipped" },
      { qualifiedId: "zigbee:contact", outcome: "skipped" },
    ];
    const classified = classifyRoomCommandResults(results);
    expect(classified.skipped).toHaveLength(2);
    expect(classified.failed).toEqual([]);
    expect(classified.applied).toEqual([]);
  });
});
