import { describe, expect, it } from "bun:test";
import { isDeviceOn, isMotionActive, summarizeDevices } from "../src/app/lib/overview.js";
import type { Capability, DeviceDescriptor } from "../src/app/types.js";

// Pure summary derivation — no DOM. It reads the same descriptors the store
// holds, so a streamed device event that mutates a descriptor's state/reachability
// produces a new summary (design.md D4; specs/web-ui "Overview Landing").

function makeDevice(overrides: Partial<DeviceDescriptor> = {}): DeviceDescriptor {
  return {
    source: "test",
    id: "device",
    qualifiedId: "test:device",
    displayName: "Device",
    state: {},
    capabilities: [],
    reachable: true,
    observation: { mode: "push", observedAt: 1_000 },
    hidden: false,
    ...overrides,
  };
}

function booleanCapability(property: string, extra: Partial<Capability> = {}): Capability {
  return {
    kind: "switch",
    property,
    access: { readable: true, writable: true },
    valueType: "boolean",
    ...extra,
  };
}

describe("isDeviceOn", () => {
  it("reads a real boolean true", () => {
    const device = makeDevice({
      state: { on: true },
      capabilities: [booleanCapability("on")],
    });
    expect(isDeviceOn(device)).toBe(true);
  });

  it("honors a declared on encoding", () => {
    const device = makeDevice({
      state: { state: "ON" },
      capabilities: [booleanCapability("state", { valueOn: "ON", valueOff: "OFF" })],
    });
    expect(isDeviceOn(device)).toBe(true);
    expect(isDeviceOn({ ...device, state: { state: "OFF" } })).toBe(false);
  });

  it("ignores a non-boolean on property", () => {
    const device = makeDevice({
      state: { on: true },
      capabilities: [
        {
          kind: "light",
          property: "on",
          access: { readable: true, writable: true },
          valueType: "numeric",
        },
      ],
    });
    expect(isDeviceOn(device)).toBe(false);
  });
});

describe("isMotionActive", () => {
  it("reports active occupancy", () => {
    const device = makeDevice({
      state: { occupancy: true },
      capabilities: [booleanCapability("occupancy")],
    });
    expect(isMotionActive(device)).toBe(true);
  });

  it("reports no motion for a false/missing read", () => {
    const device = makeDevice({
      state: {},
      capabilities: [booleanCapability("occupancy")],
    });
    expect(isMotionActive(device)).toBe(false);
  });
});

describe("summarizeDevices", () => {
  it("counts on, unreachable, stale, and motion over the given set", () => {
    const now = 10_000;
    const devices: DeviceDescriptor[] = [
      makeDevice({
        qualifiedId: "test:lamp",
        state: { on: true },
        capabilities: [booleanCapability("on")],
      }),
      makeDevice({
        qualifiedId: "test:plug",
        reachable: false,
        state: { on: true },
        capabilities: [booleanCapability("on")],
      }),
      makeDevice({
        qualifiedId: "test:sensor",
        observation: { mode: "polled", observedAt: 0, refreshIntervalMs: 1_000 },
        state: { occupancy: true },
        capabilities: [booleanCapability("occupancy")],
      }),
    ];

    const summary = summarizeDevices(devices, now);
    expect(summary.total).toBe(3);
    expect(summary.on).toBe(2);
    expect(summary.unreachable).toBe(1);
    expect(summary.stale).toBe(1);
    expect(summary.motion).toBe(1);
  });

  it("returns all-zero counts for an empty home", () => {
    expect(summarizeDevices([], 0)).toEqual({
      total: 0,
      on: 0,
      unreachable: 0,
      stale: 0,
      motion: 0,
    });
  });

  it("reflects a device turning on, as a streamed device_state event would", () => {
    const off = makeDevice({
      qualifiedId: "test:lamp",
      state: { on: false },
      capabilities: [booleanCapability("on")],
    });
    expect(summarizeDevices([off], 0).on).toBe(0);
    // The store merges the event's properties into the descriptor and
    // re-derives; the summary follows without a manual refresh.
    const on: DeviceDescriptor = { ...off, state: { ...off.state, on: true } };
    expect(summarizeDevices([on], 0).on).toBe(1);
  });

  it("reflects a reachability change, as a streamed device_reachability event would", () => {
    const reachable = makeDevice({ qualifiedId: "test:plug" });
    expect(summarizeDevices([reachable], 0).unreachable).toBe(0);
    const unreachable: DeviceDescriptor = { ...reachable, reachable: false };
    expect(summarizeDevices([unreachable], 0).unreachable).toBe(1);
  });
});
