import { describe, expect, it } from "bun:test";
import type { Capability } from "@ts-ha/shared";
import {
  deviceTileObservation,
  deviceTileOnOffFromCapabilityValue,
  deviceTileOnOffState,
  deviceTileState,
} from "../src/app/lib/device-tile-state.js";
import type { DeviceDescriptor } from "../src/app/types.js";

// Pure non-color state encoding — no DOM. Each state must be distinguishable
// by its label and icon shape as well as its token, so the tile stays usable
// when color is removed (specs/web-ui "Device Tile Presentation"; task 9.2).

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

describe("deviceTileOnOffState", () => {
  it("encodes a true on/off as a filled power icon and an 'on' label", () => {
    const state = deviceTileOnOffState(
      makeDevice({ state: { on: true }, capabilities: [booleanCapability("on")] }),
    );
    expect(state).toEqual({
      value: true,
      label: "on",
      icon: "power-filled",
      token: "--on",
    });
  });

  it("encodes false as an outline power icon and an 'off' label", () => {
    const state = deviceTileOnOffState(
      makeDevice({ state: { on: false }, capabilities: [booleanCapability("on")] }),
    );
    expect(state).toEqual({
      value: false,
      label: "off",
      icon: "power-outline",
      token: "--text-muted",
    });
  });

  it("honors a declared on/off encoding", () => {
    const device = makeDevice({
      state: { state: "ON" },
      capabilities: [booleanCapability("state", { valueOn: "ON", valueOff: "OFF" })],
    });
    expect(deviceTileOnOffState(device)?.value).toBe(true);
    expect(deviceTileOnOffState({ ...device, state: { state: "OFF" } })?.value).toBe(false);
  });

  it("returns null when the device declares no boolean on/off", () => {
    const device = makeDevice({
      state: { temperature: 21 },
      capabilities: [
        {
          kind: "sensor",
          property: "temperature",
          access: { readable: true, writable: false },
          valueType: "numeric",
        },
      ],
    });
    expect(deviceTileOnOffState(device)).toBeNull();
  });

  it("distinguishes on from off without relying on color", () => {
    const on = deviceTileOnOffState(
      makeDevice({ state: { on: true }, capabilities: [booleanCapability("on")] }),
    );
    const off = deviceTileOnOffState(
      makeDevice({ state: { on: false }, capabilities: [booleanCapability("on")] }),
    );
    expect(on?.label).not.toBe(off?.label);
    expect(on?.icon).not.toBe(off?.icon);
  });
});

describe("deviceTileOnOffFromCapabilityValue", () => {
  it("encodes a resolved raw value through the capability's declared encoding", () => {
    const capability = booleanCapability("state", { valueOn: "ON", valueOff: "OFF" });
    expect(deviceTileOnOffFromCapabilityValue(capability, "ON")).toEqual({
      value: true,
      label: "on",
      icon: "power-filled",
      token: "--on",
    });
    expect(deviceTileOnOffFromCapabilityValue(capability, "OFF")).toEqual({
      value: false,
      label: "off",
      icon: "power-outline",
      token: "--text-muted",
    });
  });

  it("treats a real boolean as on/off when the capability declares no encoding", () => {
    const capability = booleanCapability("on");
    expect(deviceTileOnOffFromCapabilityValue(capability, true).value).toBe(true);
    expect(deviceTileOnOffFromCapabilityValue(capability, false).value).toBe(false);
  });

  it("lets the tile chip follow a resolved optimistic value rather than confirmed state", () => {
    const capability = booleanCapability("on");
    // Confirmed state says off, but a pending optimistic command says on.
    expect(deviceTileOnOffFromCapabilityValue(capability, true).label).toBe("on");
  });
});

describe("deviceTileObservation", () => {
  it("marks an unreachable device with a plug-off icon and a danger token", () => {
    const state = deviceTileObservation(makeDevice({ reachable: false }), 2_000);
    expect(state).toEqual({
      kind: "unreachable",
      label: "Unreachable",
      icon: "plug-off",
      token: "--danger",
    });
  });

  it("marks a push observation as live", () => {
    const state = deviceTileObservation(makeDevice(), 2_000);
    expect(state.kind).toBe("live");
    expect(state.icon).toBe("wifi");
    expect(state.label).toBe("live");
  });

  it("marks a fresh polled observation with its age", () => {
    const device = makeDevice({
      observation: { mode: "polled", observedAt: 1_000, refreshIntervalMs: 10_000 },
    });
    const state = deviceTileObservation(device, 6_000);
    expect(state.kind).toBe("polled");
    expect(state.icon).toBe("wifi-off");
    expect(state.label).toBe("polled · 5s");
    expect(state.token).toBe("--text-muted");
  });

  it("marks a polled observation older than its refresh interval as stale with a clock", () => {
    const device = makeDevice({
      observation: { mode: "polled", observedAt: 1_000, refreshIntervalMs: 1_000 },
    });
    const state = deviceTileObservation(device, 10_000);
    expect(state.kind).toBe("stale");
    expect(state.icon).toBe("clock");
    expect(state.label).toBe("stale · 9s");
    expect(state.token).toBe("--stale");
  });

  it("distinguishes every state without relying on color", () => {
    const states = [
      deviceTileObservation(makeDevice({ reachable: false }), 2_000),
      deviceTileObservation(makeDevice(), 2_000),
      deviceTileObservation(
        makeDevice({
          observation: { mode: "polled", observedAt: 1_000, refreshIntervalMs: 10_000 },
        }),
        6_000,
      ),
      deviceTileObservation(
        makeDevice({
          observation: { mode: "polled", observedAt: 1_000, refreshIntervalMs: 1_000 },
        }),
        10_000,
      ),
    ];
    const channels = states.map((s) => `${s.kind}:${s.icon}:${s.label}`);
    expect(new Set(channels).size).toBe(states.length);
  });
});

describe("deviceTileState", () => {
  it("combines the on/off and observation encodings", () => {
    const state = deviceTileState(
      makeDevice({ state: { on: true }, capabilities: [booleanCapability("on")] }),
      2_000,
    );
    expect(state.onOff?.label).toBe("on");
    expect(state.observation.kind).toBe("live");
  });
});
