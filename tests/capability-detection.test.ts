import { describe, expect, it } from "bun:test";
import { detectCapabilities } from "../src/core/services/capability-detection.js";
import type { Capability } from "../src/types/capabilities.js";

const readWrite = { readable: true, writable: true };

function light(features: Partial<Capability>[]): Capability {
  return {
    kind: "light",
    access: readWrite,
    valueType: "composite",
    features: features.map((f) => ({
      access: readWrite,
      valueType: "unknown",
      kind: "binary",
      ...f,
    })),
  };
}

describe("detectCapabilities (source-neutral)", () => {
  it("consumes the capability vocabulary directly, with no Zigbee-specific input", () => {
    // detectCapabilities takes Capability[] — this module never imports
    // ZigbeeDevice or any source-specific type (design.md D22).
    const caps = detectCapabilities([light([{ property: "state" }])]);
    expect(caps.isLight).toBe(true);
  });

  it("detects a dimmable light from nested features", () => {
    const caps = detectCapabilities([light([{ property: "state" }, { property: "brightness" }])]);
    expect(caps.isLight).toBe(true);
    expect(caps.hasBrightness).toBe(true);
    expect(caps.hasColorTemp).toBe(false);
  });

  it("detects color capabilities via xy and hs feature properties", () => {
    const xy = detectCapabilities([light([{ property: "color_xy" }])]);
    expect(xy.hasColorXY).toBe(true);
    expect(xy.hasColorHS).toBe(false);

    const hs = detectCapabilities([light([{ property: "color_hs" }])]);
    expect(hs.hasColorHS).toBe(true);
    expect(hs.hasColorXY).toBe(false);
  });

  it("falls back to a feature's `name` when `property` is absent", () => {
    const caps = detectCapabilities([light([{ name: "brightness" }])]);
    expect(caps.hasBrightness).toBe(true);
  });

  it("detects a switch or outlet as isSwitch, not isLight", () => {
    const switchCap: Capability = { kind: "switch", access: readWrite, valueType: "composite" };
    const outletCap: Capability = { kind: "outlet", access: readWrite, valueType: "composite" };
    expect(detectCapabilities([switchCap]).isSwitch).toBe(true);
    expect(detectCapabilities([outletCap]).isSwitch).toBe(true);
    expect(detectCapabilities([switchCap]).isLight).toBe(false);
  });

  it("detects top-level scalar capabilities by property or name", () => {
    const scalar = (property: string): Capability => ({
      kind: "binary",
      property,
      access: readWrite,
      valueType: "boolean",
    });
    expect(detectCapabilities([scalar("occupancy")]).hasOccupancy).toBe(true);
    expect(detectCapabilities([scalar("contact")]).hasContact).toBe(true);
    expect(detectCapabilities([scalar("water_leak")]).hasWaterLeak).toBe(true);
    expect(detectCapabilities([scalar("temperature")]).hasTemperature).toBe(true);
    expect(detectCapabilities([scalar("humidity")]).hasHumidity).toBe(true);
    expect(detectCapabilities([scalar("battery")]).hasBattery).toBe(true);
  });

  it("returns all-false capabilities for an empty schema", () => {
    const caps = detectCapabilities([]);
    expect(caps.isLight).toBe(false);
    expect(caps.isSwitch).toBe(false);
    expect(caps.hasBattery).toBe(false);
  });

  it("ignores an unrecognised top-level capability kind rather than throwing", () => {
    const caps = detectCapabilities([
      { kind: "some-future-kind", access: readWrite, valueType: "unknown", raw: {} },
    ]);
    expect(caps.isLight).toBe(false);
    expect(caps.isSwitch).toBe(false);
  });
});
