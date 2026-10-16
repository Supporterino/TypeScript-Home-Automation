import { describe, expect, it } from "bun:test";
import type { Capability } from "@ts-ha/shared";
import { rankDeviceTile } from "../src/app/lib/capability-ranking.js";
import {
  archetypeWholeCardActuation,
  cardArchetype,
  cardDrawsNoSurface,
  formatBrightnessPercent,
  writableBrightnessCapability,
} from "../src/app/lib/card-archetype.js";

// Pure card-archetype selection — no DOM. The archetype is derived from the existing
// rankDeviceTile result, pinning the mapping from ranked capabilities to card shape.

const rw = { readable: true, writable: true };
const ro = { readable: true, writable: false };

function onOff(property = "on"): Capability {
  return { kind: "switch", property, access: rw, valueType: "boolean" };
}

function numeric(property: string, access = rw, unit?: string): Capability {
  return { kind: "numeric", property, access, valueType: "numeric", unit };
}

function light(features: Capability[]): Capability {
  return { kind: "light", access: rw, valueType: "composite", features };
}

function archetypeFor(capabilities: Capability[]): string {
  return cardArchetype(rankDeviceTile(capabilities), capabilities);
}

describe("cardArchetype", () => {
  it("selects the light archetype for a dimmable light (on/off + brightness)", () => {
    expect(archetypeFor([light([onOff("state"), numeric("brightness")])])).toBe("light");
  });

  it("selects the toggle archetype for an on/off-only switch", () => {
    expect(archetypeFor([onOff()])).toBe("toggle");
  });

  it("stays a toggle when an on/off device has only a non-brightness readout", () => {
    expect(archetypeFor([onOff(), numeric("power", ro, "W")])).toBe("toggle");
  });

  it("stays a toggle when the brightness is read-only (no slider can be driven)", () => {
    expect(archetypeFor([onOff(), numeric("brightness", ro, "%")])).toBe("toggle");
  });

  it("selects the cover archetype for a device whose primary action is position", () => {
    const capabilities: Capability[] = [
      numeric("position"),
      { kind: "enum", property: "state", access: rw, valueType: "enum" as const },
    ];
    expect(archetypeFor(capabilities)).toBe("cover");
  });

  it("selects the cover archetype for a position-less cover with a declared transport action", () => {
    // No writable position: the broadened detection recognises the cover by its transport
    // action rather than falling back to a generic enum control.
    const capabilities: Capability[] = [
      {
        kind: "cover",
        access: rw,
        valueType: "composite",
        features: [
          {
            kind: "enum",
            property: "action",
            access: rw,
            valueType: "enum",
            permittedValues: ["open", "close", "stop"],
          },
        ],
      },
    ];
    expect(archetypeFor(capabilities)).toBe("cover");
  });

  it("keeps a non-transport enum on the default archetype", () => {
    // Open+close transport tokens are required, so a generic enum is not a cover.
    const capabilities: Capability[] = [
      {
        kind: "fan",
        access: rw,
        valueType: "composite",
        features: [
          {
            kind: "enum",
            property: "effect",
            access: rw,
            valueType: "enum",
            permittedValues: ["low", "high"],
          },
        ],
      },
    ];
    expect(archetypeFor(capabilities)).toBe("default");
  });

  it("selects the readout archetype for a read-only sensor", () => {
    expect(archetypeFor([numeric("temperature", ro, "°C")])).toBe("readout");
  });

  it("selects the default archetype for an unknown device", () => {
    const capabilities: Capability[] = [
      { kind: "text", property: "firmware_version", access: ro, valueType: "text" },
    ];
    expect(archetypeFor(capabilities)).toBe("default");
  });

  it("selects the default archetype for an empty capability list", () => {
    expect(archetypeFor([])).toBe("default");
  });

  it("keeps a brightness-only actuator on the default archetype", () => {
    expect(archetypeFor([numeric("brightness")])).toBe("default");
  });
});

describe("writableBrightnessCapability", () => {
  it("finds the writable brightness a light card drives", () => {
    const capabilities = [onOff("state"), numeric("brightness")];
    expect(writableBrightnessCapability(capabilities)?.property).toBe("brightness");
  });

  it("returns undefined when the brightness is read-only", () => {
    expect(writableBrightnessCapability([onOff(), numeric("brightness", ro, "%")])).toBeUndefined();
  });

  it("returns undefined when the device declares no brightness", () => {
    expect(writableBrightnessCapability([onOff()])).toBeUndefined();
  });
});

describe("archetypeWholeCardActuation", () => {
  it("whole-card actuates only the pure toggle archetype", () => {
    expect(archetypeWholeCardActuation("toggle")).toBe(true);
    for (const archetype of ["light", "cover", "readout", "default"] as const) {
      expect(archetypeWholeCardActuation(archetype)).toBe(false);
    }
  });
});

describe("cardDrawsNoSurface", () => {
  it("draws no surface for a contained tile so a card is a single surface", () => {
    expect(cardDrawsNoSurface("toggle", true, true)).toBe(true);
    expect(cardDrawsNoSurface("light", true, true)).toBe(true);
  });

  it("draws no surface for a wall readout, but a surface for an actionable wall card", () => {
    expect(cardDrawsNoSurface("readout", true, false)).toBe(true);
    expect(cardDrawsNoSurface("toggle", true, false)).toBe(false);
    expect(cardDrawsNoSurface("light", true, false)).toBe(false);
  });

  it("never changes the dashboard's paper rendering", () => {
    expect(cardDrawsNoSurface("default", false, false)).toBe(false);
    expect(cardDrawsNoSurface("readout", false, false)).toBe(false);
  });
});

describe("formatBrightnessPercent", () => {
  it("normalises a value against its declared range", () => {
    expect(formatBrightnessPercent(70, { min: 0, max: 100 })).toBe("70%");
    expect(formatBrightnessPercent(254, { min: 0, max: 254 })).toBe("100%");
    expect(formatBrightnessPercent(127, { min: 0, max: 254 })).toBe("50%");
  });

  it("clamps to 0–100 and clamps an out-of-range value", () => {
    expect(formatBrightnessPercent(-10, { min: 0, max: 100 })).toBe("0%");
    expect(formatBrightnessPercent(150, { min: 0, max: 100 })).toBe("100%");
  });

  it("assumes a 0–100 range when none is declared", () => {
    expect(formatBrightnessPercent(42)).toBe("42%");
  });

  it("renders an em dash for a missing or non-numeric value", () => {
    expect(formatBrightnessPercent(undefined)).toBe("—");
    expect(formatBrightnessPercent("bright")).toBe("—");
  });
});
