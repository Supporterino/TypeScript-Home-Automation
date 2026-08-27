import { describe, expect, it } from "bun:test";
import {
  flattenCapabilities,
  rankDeviceTile,
  selectPrimaryAction,
  selectPrimaryReadout,
} from "../src/core/web-ui/app/lib/capability-ranking.js";
import type { Capability } from "../src/types/capabilities.js";

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

describe("flattenCapabilities", () => {
  it("recurses into nested features", () => {
    const flat = flattenCapabilities([light([onOff("state"), numeric("brightness")])]);
    expect(flat.map((c) => c.property).sort()).toEqual(["brightness", "state"]);
  });

  it("keeps top-level leaf capabilities with no container", () => {
    const flat = flattenCapabilities([numeric("temperature", ro, "°C")]);
    expect(flat).toHaveLength(1);
    expect(flat[0]?.property).toBe("temperature");
  });

  it("ignores a capability with no property and no features", () => {
    const flat = flattenCapabilities([{ kind: "unknown", access: ro, valueType: "unknown" }]);
    expect(flat).toHaveLength(0);
  });
});

describe("selectPrimaryAction — dimmable light", () => {
  const capabilities = [light([onOff("state"), numeric("brightness")])];

  it("ranks on/off above brightness", () => {
    const action = selectPrimaryAction(capabilities);
    expect(action?.kind).toBe("on_off");
  });
});

describe("selectPrimaryAction — a cover", () => {
  // Shelly cover: numeric position (writable) + enum "state" (open/close/stop,
  // not a boolean) — position must win, and the enum must not be mistaken for on/off.
  const capabilities = [
    numeric("position"),
    { kind: "enum", property: "state", access: rw, valueType: "enum" as const },
  ];

  it("ranks position above an enum named state that is not boolean on/off", () => {
    const action = selectPrimaryAction(capabilities);
    expect(action?.kind).toBe("position");
  });
});

describe("selectPrimaryAction — a read-only temperature sensor", () => {
  const capabilities = [numeric("temperature", ro, "°C")];

  it("finds no primary action", () => {
    expect(selectPrimaryAction(capabilities)).toBeNull();
  });
});

describe("selectPrimaryAction — an unrankable device", () => {
  it("degrades to null when only unwritable/unknown capabilities are declared", () => {
    const capabilities: Capability[] = [
      { kind: "text", property: "firmware_version", access: ro, valueType: "text" },
    ];
    expect(selectPrimaryAction(capabilities)).toBeNull();
  });

  it("degrades to null for an empty capability list", () => {
    expect(selectPrimaryAction([])).toBeNull();
  });
});

describe("selectPrimaryAction — fallback ranks", () => {
  it("falls back to any other writable enum", () => {
    const capabilities: Capability[] = [
      { kind: "enum", property: "effect", access: rw, valueType: "enum", permittedValues: ["a"] },
    ];
    const action = selectPrimaryAction(capabilities);
    expect(action?.kind).toBe("enum");
    expect(action?.capability.property).toBe("effect");
  });

  it("falls back to any other writable numeric", () => {
    const capabilities = [numeric("fan_speed")];
    const action = selectPrimaryAction(capabilities);
    expect(action?.kind).toBe("numeric");
  });
});

describe("selectPrimaryReadout — with a primary action", () => {
  it("qualifies on/off with brightness when present", () => {
    const capabilities = [light([onOff("state"), numeric("brightness")])];
    const action = selectPrimaryAction(capabilities);
    const readout = selectPrimaryReadout(capabilities, action);
    expect(readout?.kind).toBe("brightness");
  });

  it("qualifies on/off with power for a plug with no brightness", () => {
    const capabilities = [onOff(), numeric("power", ro, "W")];
    const action = selectPrimaryAction(capabilities);
    const readout = selectPrimaryReadout(capabilities, action);
    expect(readout?.kind).toBe("power");
  });

  it("returns null when the action has nothing to qualify it", () => {
    const capabilities = [onOff()];
    const action = selectPrimaryAction(capabilities);
    const readout = selectPrimaryReadout(capabilities, action);
    expect(readout).toBeNull();
  });
});

describe("selectPrimaryReadout — with no primary action", () => {
  it("ranks temperature above humidity above battery", () => {
    const capabilities = [
      numeric("battery", ro, "%"),
      numeric("humidity", ro, "%"),
      numeric("temperature", ro, "°C"),
    ];
    const readout = selectPrimaryReadout(capabilities, null);
    expect(readout?.kind).toBe("temperature");
  });

  it("falls back to any other readable numeric", () => {
    const capabilities = [numeric("co2", ro, "ppm")];
    const readout = selectPrimaryReadout(capabilities, null);
    expect(readout?.kind).toBe("numeric");
  });

  it("returns null for a device with nothing readable", () => {
    expect(selectPrimaryReadout([], null)).toBeNull();
  });
});

describe("rankDeviceTile", () => {
  it("computes action and readout together for a dimmable light", () => {
    const ranking = rankDeviceTile([light([onOff("state"), numeric("brightness")])]);
    expect(ranking.action?.kind).toBe("on_off");
    expect(ranking.readout?.kind).toBe("brightness");
  });

  it("computes a read-only ranking for a temperature sensor", () => {
    const ranking = rankDeviceTile([numeric("temperature", ro, "°C")]);
    expect(ranking.action).toBeNull();
    expect(ranking.readout?.kind).toBe("temperature");
  });

  it("computes an all-null ranking for an unrankable device", () => {
    const ranking = rankDeviceTile([
      { kind: "text", property: "firmware_version", access: ro, valueType: "text" },
    ]);
    expect(ranking.action).toBeNull();
    expect(ranking.readout).toBeNull();
  });
});
