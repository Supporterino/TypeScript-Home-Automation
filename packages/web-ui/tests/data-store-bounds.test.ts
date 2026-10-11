import { describe, expect, it } from "bun:test";
import { type DeviceMapEvent, reduceDeviceEvent } from "../src/app/lib/device-reduction.js";
import { applyLogRingBuffer, LOG_BUFFER_CAPACITY } from "../src/app/lib/log-ring-buffer.js";
import type { DeviceDescriptor, LogEntry } from "../src/app/types.js";

// Bounded-memory behaviour of the always-on data layer (task 7.4; design.md
// D11; specs/wall-display "Always-On Operation" "Memory is bounded over a long
// session"). Both bounds are pure functions extracted from `data-store.tsx` so
// a long high-event session is reachable here without a DOM.

function entry(n: number): LogEntry {
  return { level: 30, time: n, msg: `entry-${n}` };
}

function device(qualifiedId: string): DeviceDescriptor {
  return {
    source: "zigbee",
    id: qualifiedId,
    qualifiedId,
    displayName: qualifiedId,
    state: {},
    capabilities: [],
    reachable: true,
    observation: { mode: "push", observedAt: 0 },
    hidden: false,
  };
}

describe("applyLogRingBuffer", () => {
  it("retains a 500-entry capacity", () => {
    expect(LOG_BUFFER_CAPACITY).toBe(500);
  });

  it("appends in order while under capacity", () => {
    const result = applyLogRingBuffer([entry(1), entry(2)], entry(3));
    expect(result.map((e) => e.msg)).toEqual(["entry-1", "entry-2", "entry-3"]);
  });

  it("does not mutate the input buffer", () => {
    const logs = [entry(1)];
    applyLogRingBuffer(logs, entry(2));
    expect(logs.map((e) => e.msg)).toEqual(["entry-1"]);
  });

  it("never exceeds capacity and keeps the newest entries", () => {
    let logs: LogEntry[] = [];
    for (let n = 1; n <= 5000; n += 1) logs = applyLogRingBuffer(logs, entry(n));

    expect(logs.length).toBe(LOG_BUFFER_CAPACITY);
    expect(logs[0]?.msg).toBe("entry-4501");
    expect(logs.at(-1)?.msg).toBe("entry-5000");
  });

  it("honours an explicit smaller capacity", () => {
    let logs: LogEntry[] = [];
    for (let n = 1; n <= 10; n += 1) logs = applyLogRingBuffer(logs, entry(n), 3);
    expect(logs.map((e) => e.msg)).toEqual(["entry-8", "entry-9", "entry-10"]);
  });
});

describe("reduceDeviceEvent", () => {
  it("adds a device on device_appeared", () => {
    const next = reduceDeviceEvent(new Map(), {
      category: "device_appeared",
      device: device("zigbee:0x1"),
    });
    expect(next.size).toBe(1);
    expect(next.get("zigbee:0x1")?.qualifiedId).toBe("zigbee:0x1");
  });

  it("does not grow the map when events for the same id are re-applied", () => {
    let devices = new Map<string, DeviceDescriptor>();
    devices = reduceDeviceEvent(devices, {
      category: "device_appeared",
      device: device("zigbee:0x1"),
    });
    devices = reduceDeviceEvent(devices, {
      category: "device_appeared",
      device: device("zigbee:0x1"),
    });
    devices = reduceDeviceEvent(devices, {
      category: "device_state",
      qualifiedId: "zigbee:0x1",
      properties: { on: true },
      observation: { mode: "push", observedAt: 1 },
    });
    devices = reduceDeviceEvent(devices, {
      category: "device_reachability",
      qualifiedId: "zigbee:0x1",
      reachable: false,
    });
    devices = reduceDeviceEvent(devices, {
      category: "device_visibility",
      qualifiedId: "zigbee:0x1",
      hidden: true,
    });

    expect(devices.size).toBe(1);
    expect(devices.get("zigbee:0x1")?.hidden).toBe(true);
  });

  it("merges a device_state delta and refreshes the observation", () => {
    const before = new Map([["zigbee:0x1", device("zigbee:0x1")]]);
    const next = reduceDeviceEvent(before, {
      category: "device_state",
      qualifiedId: "zigbee:0x1",
      properties: { on: true, brightness: 120 },
      observation: { mode: "polled", observedAt: 42, refreshIntervalMs: 1000 },
    });

    expect(next.get("zigbee:0x1")?.state).toEqual({ on: true, brightness: 120 });
    expect(next.get("zigbee:0x1")?.observation.observedAt).toBe(42);
  });

  it("is a no-op for a device_state for an unknown id", () => {
    const devices = new Map<string, DeviceDescriptor>();
    const next = reduceDeviceEvent(devices, {
      category: "device_state",
      qualifiedId: "zigbee:missing",
      properties: { on: true },
      observation: { mode: "push", observedAt: 1 },
    });
    expect(next).toBe(devices);
  });

  it("is a no-op for reachability or visibility of an unknown id", () => {
    const devices = new Map<string, DeviceDescriptor>();
    const reachability: DeviceMapEvent = {
      category: "device_reachability",
      qualifiedId: "zigbee:missing",
      reachable: false,
    };
    const visibility: DeviceMapEvent = {
      category: "device_visibility",
      qualifiedId: "zigbee:missing",
      hidden: true,
    };
    expect(reduceDeviceEvent(devices, reachability)).toBe(devices);
    expect(reduceDeviceEvent(devices, visibility)).toBe(devices);
  });

  it("removes a device on device_disappeared", () => {
    const before = new Map([["zigbee:0x1", device("zigbee:0x1")]]);
    const next = reduceDeviceEvent(before, {
      category: "device_disappeared",
      qualifiedId: "zigbee:0x1",
    });
    expect(next.size).toBe(0);
  });

  it("is a no-op when dispatching a departure for an unknown id", () => {
    const devices = new Map<string, DeviceDescriptor>();
    const next = reduceDeviceEvent(devices, {
      category: "device_disappeared",
      qualifiedId: "zigbee:missing",
    });
    expect(next).toBe(devices);
  });
});
