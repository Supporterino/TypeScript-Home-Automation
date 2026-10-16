import { describe, expect, it } from "bun:test";
import type { DeviceDescriptor } from "@ts-ha/shared";
import {
  adjustNumeric,
  composeBooleanCommand,
  composePropertyCommand,
  cycleEnum,
  formatControlValue,
  projectDeviceControls,
  readControlBoolean,
} from "../src/device-controls.js";

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

describe("projectDeviceControls", () => {
  it("interprets and composes a boolean capability through its declared encoding", () => {
    const device = descriptor({
      state: { state: "ON" },
      capabilities: [
        {
          kind: "switch",
          property: "state",
          access: { readable: true, writable: true },
          valueType: "boolean",
          valueOn: "ON",
          valueOff: "OFF",
        },
      ],
    });

    const [control] = projectDeviceControls(device);
    expect(control.control).toBe("toggle");
    expect(control.enabled).toBe(true);
    expect(readControlBoolean(control)).toBe(true);
    expect(formatControlValue(control)).toBe("on");

    expect(composeBooleanCommand(control, false)).toEqual({ state: "OFF" });
    expect(composeBooleanCommand(control, true)).toEqual({ state: "ON" });
  });

  it("treats a real boolean as the default encoding", () => {
    const device = descriptor({
      state: { on: false },
      capabilities: [
        {
          kind: "switch",
          property: "on",
          access: { readable: true, writable: true },
          valueType: "boolean",
        },
      ],
    });

    const [control] = projectDeviceControls(device);
    expect(readControlBoolean(control)).toBe(false);
    expect(composeBooleanCommand(control, true)).toEqual({ on: true });
  });

  it("renders a read-only capability as a non-actuatable readout", () => {
    const device = descriptor({
      state: { temperature: 21 },
      capabilities: [
        {
          kind: "numeric",
          property: "temperature",
          access: { readable: true, writable: false },
          valueType: "numeric",
          unit: "°C",
        },
      ],
    });

    const [control] = projectDeviceControls(device);
    expect(control.control).toBe("readout");
    expect(control.writable).toBe(false);
    expect(control.enabled).toBe(false);
    expect(formatControlValue(control)).toBe("21 °C");
  });

  it("marks a writable control unavailable when the device is unreachable", () => {
    const device = descriptor({
      reachable: false,
      state: { state: "OFF" },
      capabilities: [
        {
          kind: "switch",
          property: "state",
          access: { readable: true, writable: true },
          valueType: "boolean",
        },
      ],
    });

    const [control] = projectDeviceControls(device);
    expect(control.control).toBe("toggle");
    expect(control.writable).toBe(true);
    expect(control.enabled).toBe(false);
  });

  it("projects nested container features and maps control types", () => {
    const device = descriptor({
      state: { brightness: 50, color_mode: "warm" },
      capabilities: [
        {
          kind: "light",
          access: { readable: true, writable: false },
          valueType: "composite",
          features: [
            {
              kind: "numeric",
              property: "brightness",
              access: { readable: true, writable: true },
              valueType: "numeric",
              range: { min: 0, max: 100 },
              step: 10,
            },
            {
              kind: "enum",
              property: "color_mode",
              access: { readable: true, writable: true },
              valueType: "enum",
              permittedValues: ["warm", "cool"],
            },
            {
              kind: "text",
              property: "effect",
              access: { readable: true, writable: true },
              valueType: "text",
            },
          ],
        },
      ],
    });

    const controls = projectDeviceControls(device);
    expect(controls.map((c) => [c.property, c.control])).toEqual([
      ["brightness", "adjuster"],
      ["color_mode", "cycler"],
      ["effect", "editor"],
    ]);
  });
});

describe("control actuation helpers", () => {
  it("adjusts a numeric control within its declared range and step", () => {
    const [control] = projectDeviceControls(
      descriptor({
        state: { brightness: 95 },
        capabilities: [
          {
            kind: "numeric",
            property: "brightness",
            access: { readable: true, writable: true },
            valueType: "numeric",
            range: { min: 0, max: 100 },
            step: 10,
          },
        ],
      }),
    );

    expect(adjustNumeric(control, 1)).toBe(100);
    expect(adjustNumeric(control, -1)).toBe(85);
    expect(composePropertyCommand(control, adjustNumeric(control, -1))).toEqual({
      brightness: 85,
    });
  });

  it("cycles an enum control over its permitted values", () => {
    const [control] = projectDeviceControls(
      descriptor({
        state: { color_mode: "warm" },
        capabilities: [
          {
            kind: "enum",
            property: "color_mode",
            access: { readable: true, writable: true },
            valueType: "enum",
            permittedValues: ["warm", "cool", "auto"],
          },
        ],
      }),
    );

    expect(cycleEnum(control)).toBe("cool");
  });
});
