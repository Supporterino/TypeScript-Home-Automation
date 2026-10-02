import { describe, expect, it } from "bun:test";
import type { Capability } from "../src/capabilities.js";
import { composeBooleanCapabilityValue, readBooleanCapabilityValue } from "../src/capabilities.js";

describe("readBooleanCapabilityValue", () => {
  it("reads a declared string encoding correctly for on and off", () => {
    const capability: Pick<Capability, "valueOn"> = { valueOn: "ON" };
    expect(readBooleanCapabilityValue(capability, "ON")).toBe(true);
    expect(readBooleanCapabilityValue(capability, "OFF")).toBe(false);
  });

  it("reads a declared real-boolean encoding correctly", () => {
    const capability: Pick<Capability, "valueOn"> = { valueOn: true };
    expect(readBooleanCapabilityValue(capability, true)).toBe(true);
    expect(readBooleanCapabilityValue(capability, false)).toBe(false);
  });

  it("defaults to treating a real boolean true as on when nothing is declared", () => {
    const capability: Pick<Capability, "valueOn"> = {};
    expect(readBooleanCapabilityValue(capability, true)).toBe(true);
    expect(readBooleanCapabilityValue(capability, false)).toBe(false);
  });

  it("does not treat a foreign value as on", () => {
    const capability: Pick<Capability, "valueOn"> = { valueOn: "ON" };
    expect(readBooleanCapabilityValue(capability, true)).toBe(false);
  });
});

describe("composeBooleanCapabilityValue", () => {
  it("composes a declared string encoding", () => {
    const capability: Pick<Capability, "valueOn" | "valueOff"> = {
      valueOn: "ON",
      valueOff: "OFF",
    };
    expect(composeBooleanCapabilityValue(capability, true)).toBe("ON");
    expect(composeBooleanCapabilityValue(capability, false)).toBe("OFF");
  });

  it("composes a declared real-boolean encoding", () => {
    const capability: Pick<Capability, "valueOn" | "valueOff"> = {
      valueOn: true,
      valueOff: false,
    };
    expect(composeBooleanCapabilityValue(capability, true)).toBe(true);
    expect(composeBooleanCapabilityValue(capability, false)).toBe(false);
  });

  it("defaults to a real boolean when nothing is declared", () => {
    const capability: Pick<Capability, "valueOn" | "valueOff"> = {};
    expect(composeBooleanCapabilityValue(capability, true)).toBe(true);
    expect(composeBooleanCapabilityValue(capability, false)).toBe(false);
  });
});
