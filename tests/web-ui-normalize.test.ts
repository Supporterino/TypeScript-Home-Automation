import { describe, expect, it } from "bun:test";
import {
  asArray,
  asBoolean,
  asNumber,
  asRecord,
  asString,
  normalizeAutomation,
  normalizeAutomationRelationships,
  normalizeCapabilities,
  normalizeCapability,
  normalizeDeviceDescriptor,
  normalizeDeviceDescriptors,
  normalizeExecutionHistory,
  normalizeExecutionRecord,
  normalizeHomekitStatus,
  normalizeLogEntry,
  normalizeRoomsWithMembers,
  normalizeRoomWithMembers,
  normalizeState,
  normalizeStatus,
  normalizeStreamEvent,
} from "../src/core/web-ui/app/utils/normalize.js";

describe("primitive coercions", () => {
  it("asString falls back for non-string input", () => {
    expect(asString("hi")).toBe("hi");
    expect(asString(null)).toBe("");
    expect(asString(undefined, "x")).toBe("x");
    expect(asString(42)).toBe("");
  });

  it("asNumber falls back for non-finite input", () => {
    expect(asNumber(5)).toBe(5);
    expect(asNumber(Number.NaN, 1)).toBe(1);
    expect(asNumber("5", 1)).toBe(1);
    expect(asNumber(undefined, 7)).toBe(7);
  });

  it("asBoolean falls back for non-boolean input", () => {
    expect(asBoolean(true)).toBe(true);
    expect(asBoolean("true")).toBe(false);
    expect(asBoolean(undefined, true)).toBe(true);
  });

  it("asArray falls back to an empty array", () => {
    expect(asArray([1, 2])).toEqual([1, 2]);
    expect(asArray(null)).toEqual([]);
    expect(asArray({ length: 2 })).toEqual([]);
    expect(asArray("not an array")).toEqual([]);
  });

  it("asRecord falls back to an empty object", () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
    expect(asRecord(null)).toEqual({});
    expect(asRecord([1, 2])).toEqual({});
    expect(asRecord("x")).toEqual({});
  });
});

describe("normalizeStatus", () => {
  it("produces a well-formed result from null", () => {
    const result = normalizeStatus(null);
    expect(result.status).toBe("not ready");
    expect(result.checks).toEqual({ mqtt: false, engine: false });
    expect(result.startedAt).toBeNull();
    expect(result.tz).toBeNull();
  });

  it("produces a well-formed result from wrong-typed fields", () => {
    const result = normalizeStatus({
      status: 42,
      checks: "not an object",
      startedAt: "not a number",
      tz: 5,
    });
    expect(result.status).toBe("not ready");
    expect(result.checks).toEqual({ mqtt: false, engine: false });
    expect(result.startedAt).toBeNull();
    expect(result.tz).toBeNull();
  });

  it("passes through well-formed input unchanged", () => {
    const result = normalizeStatus({
      status: "ready",
      checks: { mqtt: true, engine: true },
      startedAt: 123,
      tz: "UTC",
    });
    expect(result).toEqual({
      status: "ready",
      checks: { mqtt: true, engine: true },
      startedAt: 123,
      tz: "UTC",
    });
  });
});

describe("normalizeAutomation", () => {
  it("handles null", () => {
    const result = normalizeAutomation(null);
    expect(result.name).toBe("unknown");
    expect(result.triggers).toEqual([]);
  });

  it("handles missing triggers", () => {
    const result = normalizeAutomation({ name: "foo" });
    expect(result.name).toBe("foo");
    expect(result.triggers).toEqual([]);
  });

  it("handles wrong-typed triggers array entries", () => {
    const result = normalizeAutomation({ name: "foo", triggers: [null, "bad", { type: "cron" }] });
    expect(result.triggers).toHaveLength(3);
    expect(result.triggers[2]).toMatchObject({ type: "cron" });
  });

  it("falls back an unknown trigger type", () => {
    const result = normalizeAutomation({ name: "foo", triggers: [{ type: "bogus" }] });
    expect(result.triggers[0]?.type).toBe("webhook");
  });
});

describe("normalizeLogEntry", () => {
  it("handles null", () => {
    const result = normalizeLogEntry(null);
    expect(typeof result.level).toBe("number");
    expect(typeof result.time).toBe("number");
    expect(result.msg).toBe("");
  });

  it("handles wrong-typed fields", () => {
    const result = normalizeLogEntry({ level: "error", time: "now", msg: 5, automation: 9 });
    expect(result.level).toBe(30);
    expect(typeof result.time).toBe("number");
    expect(result.msg).toBe("");
    expect(result.automation).toBeUndefined();
  });
});

describe("normalizeHomekitStatus", () => {
  it("passes through null", () => {
    expect(normalizeHomekitStatus(null)).toBeNull();
    expect(normalizeHomekitStatus(undefined)).toBeNull();
  });

  it("handles wrong-typed fields", () => {
    const result = normalizeHomekitStatus({ running: "yes", port: "8080", bind: 5 });
    expect(result?.running).toBe(false);
    expect(result?.port).toBe(0);
    expect(result?.bind).toBeUndefined();
  });
});

describe("normalizeState", () => {
  it("falls back to an empty map for non-object input", () => {
    expect(normalizeState(null)).toEqual({});
    expect(normalizeState([1, 2])).toEqual({});
  });
});

describe("normalizeCapability", () => {
  it("handles null", () => {
    const result = normalizeCapability(null);
    expect(result.kind).toBe("unknown");
    expect(result.valueType).toBe("unknown");
    expect(result.access).toEqual({ readable: false, writable: false });
  });

  it("falls back an unrecognised valueType", () => {
    const result = normalizeCapability({ kind: "x", valueType: "bogus", access: {} });
    expect(result.valueType).toBe("unknown");
  });

  it("normalises nested features recursively", () => {
    const result = normalizeCapability({
      kind: "light",
      access: { readable: true, writable: true },
      valueType: "composite",
      features: [
        {
          kind: "switch",
          property: "state",
          access: { readable: true, writable: true },
          valueType: "boolean",
        },
        "not an object",
        null,
      ],
    });
    expect(result.features).toHaveLength(3);
    expect(result.features?.[0]?.property).toBe("state");
    expect(result.features?.[1]?.kind).toBe("unknown");
  });

  it("normalises range and permittedValues defensively", () => {
    const result = normalizeCapability({
      kind: "numeric",
      access: {},
      valueType: "numeric",
      range: { min: "not a number", max: 100 },
      permittedValues: ["a", 1, null, {}],
    });
    expect(result.range).toEqual({ min: undefined, max: 100 });
    expect(result.permittedValues).toEqual(["a", 1]);
  });
});

describe("normalizeCapabilities", () => {
  it("falls back to an empty array for non-array input", () => {
    expect(normalizeCapabilities(null)).toEqual([]);
  });
});

describe("normalizeDeviceDescriptor", () => {
  it("handles null", () => {
    const result = normalizeDeviceDescriptor(null);
    expect(result.source).toBe("unknown");
    expect(result.capabilities).toEqual([]);
    expect(result.reachable).toBe(true);
    expect(result.observation.mode).toBe("push");
    expect(typeof result.observation.observedAt).toBe("number");
  });

  it("falls back displayName to qualifiedId when missing", () => {
    const result = normalizeDeviceDescriptor({ qualifiedId: "zigbee:0xabc" });
    expect(result.displayName).toBe("zigbee:0xabc");
  });

  it("preserves a polled observation's refresh interval", () => {
    const result = normalizeDeviceDescriptor({
      observation: { mode: "polled", observedAt: 123, refreshIntervalMs: 5000 },
    });
    expect(result.observation).toEqual({
      mode: "polled",
      observedAt: 123,
      refreshIntervalMs: 5000,
    });
  });

  it("normalises nested capabilities", () => {
    const result = normalizeDeviceDescriptor({
      qualifiedId: "zigbee:0xabc",
      capabilities: [{ kind: "switch", property: "state", access: {}, valueType: "boolean" }],
    });
    expect(result.capabilities).toHaveLength(1);
  });

  it("defaults hidden to false when missing", () => {
    const result = normalizeDeviceDescriptor({ qualifiedId: "zigbee:0xabc" });
    expect(result.hidden).toBe(false);
  });

  it("preserves hidden: true", () => {
    const result = normalizeDeviceDescriptor({ qualifiedId: "zigbee:0xabc", hidden: true });
    expect(result.hidden).toBe(true);
  });

  it("normalises memberQualifiedIds when present", () => {
    const result = normalizeDeviceDescriptor({
      qualifiedId: "zigbee-group:5",
      memberQualifiedIds: ["zigbee:0xa", "zigbee:0xb"],
    });
    expect(result.memberQualifiedIds).toEqual(["zigbee:0xa", "zigbee:0xb"]);
  });

  it("omits memberQualifiedIds when absent", () => {
    const result = normalizeDeviceDescriptor({ qualifiedId: "zigbee:0xabc" });
    expect(result.memberQualifiedIds).toBeUndefined();
  });
});

describe("normalizeDeviceDescriptors", () => {
  it("falls back to an empty array for non-array input", () => {
    expect(normalizeDeviceDescriptors(undefined)).toEqual([]);
  });
});

describe("normalizeRoomWithMembers", () => {
  it("handles null", () => {
    const result = normalizeRoomWithMembers(null);
    expect(result.id).toBe("");
    expect(result.name).toBe("Unnamed room");
    expect(result.members).toEqual([]);
  });

  it("nulls out device for an unavailable member even if one is present", () => {
    const result = normalizeRoomWithMembers({
      id: "r1",
      name: "Living Room",
      members: [
        { qualifiedId: "zigbee:0xabc", available: false, device: { qualifiedId: "zigbee:0xabc" } },
      ],
    });
    expect(result.members[0]?.available).toBe(false);
    expect(result.members[0]?.device).toBeNull();
  });

  it("normalises the device for an available member", () => {
    const result = normalizeRoomWithMembers({
      id: "r1",
      name: "Living Room",
      members: [
        { qualifiedId: "zigbee:0xabc", available: true, device: { qualifiedId: "zigbee:0xabc" } },
      ],
    });
    expect(result.members[0]?.device?.qualifiedId).toBe("zigbee:0xabc");
  });
});

describe("normalizeRoomsWithMembers", () => {
  it("falls back to an empty array for non-array input", () => {
    expect(normalizeRoomsWithMembers("nope")).toEqual([]);
  });
});

describe("normalizeExecutionRecord", () => {
  it("handles null", () => {
    const result = normalizeExecutionRecord(null);
    expect(result.outcome).toBe("success");
    expect(result.error).toBeUndefined();
  });

  it("preserves a failure outcome and its error", () => {
    const result = normalizeExecutionRecord({
      startedAt: 1,
      trigger: { type: "cron" },
      durationMs: 5,
      outcome: "failure",
      error: "boom",
    });
    expect(result.outcome).toBe("failure");
    expect(result.error).toBe("boom");
  });
});

describe("normalizeExecutionHistory", () => {
  it("falls back to an empty array for non-array input", () => {
    expect(normalizeExecutionHistory(null)).toEqual([]);
  });
});

describe("normalizeAutomationRelationships", () => {
  it("handles null", () => {
    const result = normalizeAutomationRelationships(null);
    expect(result.declared.requiredServices).toEqual([]);
    expect(result.declared.relatedDevices).toEqual([]);
    expect(result.declared.watchedStateKeys).toEqual([]);
    expect(result.observed.writtenStateKeys).toEqual([]);
    expect(result.observed.truncated).toBe(false);
  });

  it("normalises a well-formed relationships payload", () => {
    const result = normalizeAutomationRelationships({
      declared: {
        requiredServices: [{ name: "shelly", registered: true }],
        relatedDevices: ["lamp"],
        watchedStateKeys: ["night_mode"],
      },
      observed: { writtenStateKeys: ["lights_on"], truncated: true },
    });
    expect(result.declared.requiredServices).toEqual([{ name: "shelly", registered: true }]);
    expect(result.observed.truncated).toBe(true);
  });
});

describe("normalizeStreamEvent", () => {
  it("falls back to unknown for null, non-object, or an unrecognised category", () => {
    expect(normalizeStreamEvent(null)).toEqual({ category: "unknown" });
    expect(normalizeStreamEvent("not an object")).toEqual({ category: "unknown" });
    expect(normalizeStreamEvent({ category: "bogus" })).toEqual({ category: "unknown" });
    expect(normalizeStreamEvent({})).toEqual({ category: "unknown" });
  });

  it("normalises a state event", () => {
    const result = normalizeStreamEvent({
      category: "state",
      key: "night_mode",
      value: true,
      previous: false,
    });
    expect(result).toEqual({ category: "state", key: "night_mode", value: true, previous: false });
  });

  it("normalises a log event, defensively normalising its entry", () => {
    const result = normalizeStreamEvent({ category: "log", entry: { level: "bad", msg: 5 } });
    expect(result.category).toBe("log");
    if (result.category === "log") {
      expect(result.entry.level).toBe(30);
      expect(result.entry.msg).toBe("");
    }
  });

  it("normalises an automation event", () => {
    const result = normalizeStreamEvent({ category: "automation", name: "foo", enabled: true });
    expect(result).toEqual({ category: "automation", name: "foo", enabled: true });
  });

  it("normalises a readiness event", () => {
    expect(normalizeStreamEvent({ category: "readiness", ready: true })).toEqual({
      category: "readiness",
      ready: true,
    });
  });

  it("normalises a fell_behind event with no other fields", () => {
    expect(normalizeStreamEvent({ category: "fell_behind" })).toEqual({ category: "fell_behind" });
  });

  it("normalises a device_state event", () => {
    const result = normalizeStreamEvent({
      category: "device_state",
      qualifiedId: "zigbee:0xabc",
      properties: { brightness: 50 },
      observation: { mode: "push", observedAt: 100 },
    });
    expect(result).toEqual({
      category: "device_state",
      qualifiedId: "zigbee:0xabc",
      properties: { brightness: 50 },
      observation: { mode: "push", observedAt: 100, refreshIntervalMs: undefined },
    });
  });

  it("normalises a device_reachability event", () => {
    expect(
      normalizeStreamEvent({ category: "device_reachability", qualifiedId: "x", reachable: false }),
    ).toEqual({ category: "device_reachability", qualifiedId: "x", reachable: false });
  });

  it("normalises a device_appeared event, normalising the nested descriptor", () => {
    const result = normalizeStreamEvent({
      category: "device_appeared",
      device: { qualifiedId: "zigbee:0xabc" },
    });
    expect(result.category).toBe("device_appeared");
    if (result.category === "device_appeared") {
      expect(result.device.qualifiedId).toBe("zigbee:0xabc");
    }
  });

  it("normalises a device_disappeared event", () => {
    expect(normalizeStreamEvent({ category: "device_disappeared", qualifiedId: "x" })).toEqual({
      category: "device_disappeared",
      qualifiedId: "x",
    });
  });

  it("normalises an automation_execution event", () => {
    const result = normalizeStreamEvent({
      category: "automation_execution",
      automation: "motion-light",
      trigger: { type: "cron" },
      durationMs: 12,
      outcome: "failure",
    });
    expect(result).toMatchObject({
      category: "automation_execution",
      automation: "motion-light",
      durationMs: 12,
      outcome: "failure",
    });
  });

  it("normalises a room event, including a deletion (room: null)", () => {
    const changed = normalizeStreamEvent({
      category: "room",
      id: "r1",
      room: { id: "r1", name: "Den" },
    });
    expect(changed).toEqual({ category: "room", id: "r1", room: { id: "r1", name: "Den" } });

    const deleted = normalizeStreamEvent({ category: "room", id: "r1", room: null });
    expect(deleted).toEqual({ category: "room", id: "r1", room: null });
  });

  it("normalises a room_membership event, including an unassignment (roomId: null)", () => {
    const assigned = normalizeStreamEvent({
      category: "room_membership",
      qualifiedId: "zigbee:0xabc",
      roomId: "r1",
    });
    expect(assigned).toEqual({
      category: "room_membership",
      qualifiedId: "zigbee:0xabc",
      roomId: "r1",
    });

    const unassigned = normalizeStreamEvent({
      category: "room_membership",
      qualifiedId: "zigbee:0xabc",
      roomId: null,
    });
    expect(unassigned).toEqual({
      category: "room_membership",
      qualifiedId: "zigbee:0xabc",
      roomId: null,
    });
  });

  it("normalises a device_visibility event", () => {
    const hidden = normalizeStreamEvent({
      category: "device_visibility",
      qualifiedId: "zigbee:0xabc",
      hidden: true,
    });
    expect(hidden).toEqual({
      category: "device_visibility",
      qualifiedId: "zigbee:0xabc",
      hidden: true,
    });

    const shown = normalizeStreamEvent({
      category: "device_visibility",
      qualifiedId: "zigbee:0xabc",
      hidden: false,
    });
    expect(shown).toEqual({
      category: "device_visibility",
      qualifiedId: "zigbee:0xabc",
      hidden: false,
    });
  });
});
