import { describe, expect, it } from "bun:test";
import { validateCommand } from "../src/core/device-sources/command-validation.js";
import type { Capability } from "../src/types/capabilities.js";

// A Zigbee-shaped capability set: an on/off switch (Z2M "state" convention)
// plus a ranged numeric brightness and an enumerated effect — enough to
// exercise every violation kind against one device (task 7.1).
const ZIGBEE_LIGHT_CAPABILITIES: Capability[] = [
  {
    kind: "light",
    valueType: "composite",
    access: { readable: true, writable: true },
    features: [
      {
        kind: "binary",
        property: "state",
        access: { readable: true, writable: true },
        valueType: "boolean",
        valueOn: "ON",
        valueOff: "OFF",
      },
      {
        kind: "numeric",
        property: "brightness",
        access: { readable: true, writable: true },
        valueType: "numeric",
        range: { min: 0, max: 254 },
      },
      {
        kind: "enum",
        property: "effect",
        access: { readable: true, writable: true },
        valueType: "enum",
        permittedValues: ["blink", "breathe", "okay"],
      },
      {
        kind: "numeric",
        property: "linkquality",
        access: { readable: true, writable: false },
        valueType: "numeric",
      },
    ],
  },
];

// The state-toggle source's authored capability set: a single writable boolean.
const STATE_TOGGLE_CAPABILITIES: Capability[] = [
  {
    kind: "switch",
    property: "on",
    access: { readable: true, writable: true },
    valueType: "boolean",
  },
];

// A Shelly-shaped switch: a real boolean encoding, declared explicitly
// (design.md D1, task 3.1) rather than relying on the absent-declaration
// default — the shape a Shelly `on` property has after that task.
const SHELLY_SWITCH_CAPABILITIES: Capability[] = [
  {
    kind: "switch",
    property: "on",
    access: { readable: true, writable: true },
    valueType: "boolean",
    valueOn: true,
    valueOff: false,
  },
];

describe("validateCommand — Zigbee device", () => {
  it("accepts a valid brightness within range", () => {
    const result = validateCommand(ZIGBEE_LIGHT_CAPABILITIES, { brightness: 150 });
    expect(result).toEqual({ ok: true });
  });

  it("accepts a valid on/off command in Zigbee2MQTT's ON/OFF string convention", () => {
    const result = validateCommand(ZIGBEE_LIGHT_CAPABILITIES, { state: "ON" });
    expect(result).toEqual({ ok: true });
  });

  it("accepts a real boolean for a boolean-typed property", () => {
    const result = validateCommand(ZIGBEE_LIGHT_CAPABILITIES, { state: true });
    expect(result).toEqual({ ok: true });
  });

  it("accepts the declared off value", () => {
    const result = validateCommand(ZIGBEE_LIGHT_CAPABILITIES, { state: "OFF" });
    expect(result).toEqual({ ok: true });
  });

  it("rejects a value in a foreign encoding with a descriptive error (design D3)", () => {
    const result = validateCommand(ZIGBEE_LIGHT_CAPABILITIES, { state: 1 });
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toMatch(/must be a boolean/);
    expect((result as { error: string }).error).toMatch(/"ON"\/"OFF"/);
  });

  it("rejects a brightness value above the declared maximum", () => {
    const result = validateCommand(ZIGBEE_LIGHT_CAPABILITIES, { brightness: 300 });
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toMatch(/above its maximum/);
  });

  it("rejects a brightness value below the declared minimum", () => {
    const result = validateCommand(ZIGBEE_LIGHT_CAPABILITIES, { brightness: -1 });
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toMatch(/below its minimum/);
  });

  it("rejects a command naming a property the device does not declare", () => {
    const result = validateCommand(ZIGBEE_LIGHT_CAPABILITIES, { color_temp: 300 });
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toMatch(/Unknown property "color_temp"/);
  });

  it("rejects a value outside the permitted enum set", () => {
    const result = validateCommand(ZIGBEE_LIGHT_CAPABILITIES, { effect: "explode" });
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toMatch(/not one of the permitted values/);
  });

  it("accepts a value within the permitted enum set", () => {
    const result = validateCommand(ZIGBEE_LIGHT_CAPABILITIES, { effect: "blink" });
    expect(result).toEqual({ ok: true });
  });

  it("rejects a write to a read-only property", () => {
    const result = validateCommand(ZIGBEE_LIGHT_CAPABILITIES, { linkquality: 50 });
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toMatch(/not writable/);
  });

  it("rejects a non-numeric value for a numeric property", () => {
    const result = validateCommand(ZIGBEE_LIGHT_CAPABILITIES, { brightness: "bright" });
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toMatch(/must be a number/);
  });

  it("stops at the first violation across multiple properties", () => {
    const result = validateCommand(ZIGBEE_LIGHT_CAPABILITIES, {
      brightness: 150,
      unknown_prop: 1,
    });
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toMatch(/Unknown property "unknown_prop"/);
  });
});

describe("validateCommand — state toggle", () => {
  it("accepts a valid boolean command", () => {
    const result = validateCommand(STATE_TOGGLE_CAPABILITIES, { on: true });
    expect(result).toEqual({ ok: true });
  });

  it("rejects a non-boolean value", () => {
    const result = validateCommand(STATE_TOGGLE_CAPABILITIES, { on: "yes" });
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toMatch(/must be a boolean/);
  });

  it("rejects a command naming a property the toggle does not declare", () => {
    const result = validateCommand(STATE_TOGGLE_CAPABILITIES, { brightness: 100 });
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toMatch(/Unknown property "brightness"/);
  });

  it("accepts an empty command with no properties", () => {
    const result = validateCommand(STATE_TOGGLE_CAPABILITIES, {});
    expect(result).toEqual({ ok: true });
  });
});

describe("validateCommand — Shelly switch (declared real-boolean encoding)", () => {
  it("accepts a real boolean", () => {
    const result = validateCommand(SHELLY_SWITCH_CAPABILITIES, { on: true });
    expect(result).toEqual({ ok: true });
  });

  it('rejects "ON" now that validation reads the declared encoding rather than a hardcoded convention', () => {
    const result = validateCommand(SHELLY_SWITCH_CAPABILITIES, { on: "ON" });
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toMatch(/must be a boolean/);
  });
});
