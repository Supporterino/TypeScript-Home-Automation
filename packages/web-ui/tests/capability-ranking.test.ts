import { describe, expect, it } from "bun:test";
import type { Capability } from "@ts-ha/shared";
import {
  coverStopCommand,
  coverTransportAction,
  coverTransportTargets,
  flattenCapabilities,
  isOperableDevice,
  rankDeviceTile,
  selectPrimaryAction,
  selectPrimaryReadout,
} from "../src/app/lib/capability-ranking.js";
import { findOnOffCapability } from "../src/app/lib/room-command.js";

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

/** A writable transport enum, e.g. a cover's declared `action`/`state` values. */
function transportEnum(property: string, permittedValues: string[], access = rw): Capability {
  return { kind: "enum", property, access, valueType: "enum", permittedValues };
}

/** An output-kind container of the given kind, e.g. a fan with only a discrete speed choice. */
function outputContainer(kind: string, features: Capability[]): Capability {
  return { kind, access: rw, valueType: "composite", features };
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

describe("selectPrimaryAction — canonical on/off preference", () => {
  // A device declaring Zigbee2MQTT's `state` first and the canonical `on`
  // second: both the tile's ranked action and the room command must resolve to
  // `on`, so the tile's optimistic override key (`qid:on`) matches the property
  // the room command commands.
  const capabilities = [onOff("state"), onOff("on")];

  it("prefers on over state regardless of declaration order", () => {
    const action = selectPrimaryAction(capabilities);
    expect(action?.kind).toBe("on_off");
    expect(action?.capability.property).toBe("on");
  });

  it("agrees with the room command's on/off capability", () => {
    expect(findOnOffCapability(capabilities)?.property).toBe("on");
    expect(findOnOffCapability(capabilities)?.property).toBe(
      selectPrimaryAction(capabilities)?.capability.property,
    );
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

describe("selectPrimaryAction — fallback ranks (gated on OUTPUT_KINDS, design D4)", () => {
  it("falls back to a writable enum when it belongs to an output-kind capability", () => {
    const capabilities: Capability[] = [
      outputContainer("fan", [
        { kind: "enum", property: "effect", access: rw, valueType: "enum", permittedValues: ["a"] },
      ]),
    ];
    const action = selectPrimaryAction(capabilities);
    expect(action?.kind).toBe("enum");
    expect(action?.capability.property).toBe("effect");
  });

  it("falls back to a writable numeric when it belongs to an output-kind capability", () => {
    const capabilities = [outputContainer("fan", [numeric("fan_speed")])];
    const action = selectPrimaryAction(capabilities);
    expect(action?.kind).toBe("numeric");
  });

  it("does not fall back to a writable enum outside any output-kind capability", () => {
    // A motion sensor's writable `sensitivity` setting — a bare enum with no
    // output-kind container — must not become a primary action (specs/web-ui
    // "A sensor's configuration setting is not its primary action").
    const capabilities: Capability[] = [
      {
        kind: "enum",
        property: "sensitivity",
        access: rw,
        valueType: "enum",
        permittedValues: ["low", "medium", "high"],
      },
    ];
    expect(selectPrimaryAction(capabilities)).toBeNull();
  });

  it("does not fall back to a writable numeric outside any output-kind capability", () => {
    const capabilities = [numeric("sensitivity_threshold")];
    expect(selectPrimaryAction(capabilities)).toBeNull();
  });
});

describe("isOperableDevice — agrees with selectPrimaryAction (design D4)", () => {
  const fixtures: { name: string; capabilities: Capability[] }[] = [
    { name: "dimmable light", capabilities: [light([onOff("state"), numeric("brightness")])] },
    {
      name: "cover",
      capabilities: [
        numeric("position"),
        { kind: "enum", property: "state", access: rw, valueType: "enum" as const },
      ],
    },
    { name: "read-only temperature sensor", capabilities: [numeric("temperature", ro, "°C")] },
    {
      name: "unrankable device",
      capabilities: [{ kind: "text", property: "firmware_version", access: ro, valueType: "text" }],
    },
    { name: "empty capability list", capabilities: [] },
    {
      name: "enum-only actuator inside an output-kind container",
      capabilities: [
        outputContainer("fan", [
          {
            kind: "enum",
            property: "effect",
            access: rw,
            valueType: "enum",
            permittedValues: ["a"],
          },
        ]),
      ],
    },
    {
      name: "motion sensor with writable sensitivity enum",
      capabilities: [
        {
          kind: "enum",
          property: "sensitivity",
          access: rw,
          valueType: "enum",
          permittedValues: ["low", "medium", "high"],
        },
      ],
    },
  ];

  for (const { name, capabilities } of fixtures) {
    it(`agrees with selectPrimaryAction for: ${name}`, () => {
      expect(isOperableDevice(capabilities)).toBe(selectPrimaryAction(capabilities) !== null);
    });
  }
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

describe("coverStopCommand (design D6)", () => {
  it("returns the stop property and the exact permitted value for a Zigbee cover", () => {
    const capabilities: Capability[] = [
      {
        kind: "cover",
        access: rw,
        valueType: "composite",
        features: [
          numeric("position"),
          {
            kind: "enum",
            property: "state",
            access: rw,
            valueType: "enum",
            permittedValues: ["open", "close", "stop"],
          },
        ],
      },
    ];
    expect(coverStopCommand(capabilities)).toEqual({ property: "state", value: "stop" });
  });

  it("preserves the authored case of a stop-like permitted value", () => {
    const capabilities: Capability[] = [
      {
        kind: "enum",
        property: "state",
        access: rw,
        valueType: "enum",
        permittedValues: ["OPEN", "CLOSE", "STOP"],
      },
    ];
    expect(coverStopCommand(capabilities)).toEqual({ property: "state", value: "STOP" });
  });

  it("defaults to the canonical stop value for an unconstrained writable state enum", () => {
    const capabilities: Capability[] = [
      numeric("position"),
      { kind: "enum", property: "state", access: rw, valueType: "enum" },
    ];
    expect(coverStopCommand(capabilities)).toEqual({ property: "state", value: "stop" });
  });

  it("finds a stop-like permitted value on a non-state transport enum", () => {
    const capabilities: Capability[] = [
      {
        kind: "enum",
        property: "action",
        access: rw,
        valueType: "enum",
        permittedValues: ["raise", "lower", "stop"],
      },
    ];
    expect(coverStopCommand(capabilities)).toEqual({ property: "action", value: "stop" });
  });

  it("returns null when a cover's stop-capable state enum is read-only", () => {
    // No writable transport action is declared, so a read-only movement state
    // that names `stopped` still cannot be commanded — the case a Shelly cover
    // had before task 1.5 gave it a writable `action` (design.md D15).
    const capabilities: Capability[] = [
      numeric("position"),
      {
        kind: "enum",
        property: "state",
        access: ro,
        valueType: "enum",
        permittedValues: ["open", "closed", "opening", "closing", "stopped", "calibrating"],
      },
    ];
    expect(coverStopCommand(capabilities)).toBeNull();
  });

  it("returns null when a writable state enum enumerates no stop value", () => {
    const capabilities: Capability[] = [
      numeric("position"),
      {
        kind: "enum",
        property: "state",
        access: rw,
        valueType: "enum",
        permittedValues: ["open", "close"],
      },
    ];
    expect(coverStopCommand(capabilities)).toBeNull();
  });

  it("returns null for a device with no transport property", () => {
    expect(coverStopCommand([numeric("temperature", ro, "°C")])).toBeNull();
    expect(coverStopCommand([])).toBeNull();
  });

  it("finds stop on a Shelly cover's declared transport action", () => {
    // Task 1.5 gave the Shelly cover a writable `action` enum, so the stop it
    // could always perform is now expressible (design.md D15).
    const capabilities = [numeric("position"), transportEnum("action", ["open", "close", "stop"])];
    expect(coverStopCommand(capabilities)).toEqual({ property: "action", value: "stop" });
  });

  it("returns null when a declared transport action cannot stop", () => {
    const capabilities = [numeric("position"), transportEnum("action", ["open", "close"])];
    expect(coverStopCommand(capabilities)).toBeNull();
  });
});

describe("coverTransportAction (design D15)", () => {
  it("finds the declared transport and its exact open/close/stop values", () => {
    const capabilities = [numeric("position"), transportEnum("action", ["open", "close", "stop"])];
    expect(coverTransportAction(capabilities)).toEqual({
      property: "action",
      open: "open",
      close: "close",
      stop: "stop",
    });
  });

  it("preserves the authored case of the declared values", () => {
    const capabilities = [transportEnum("state", ["OPEN", "CLOSE", "STOP"])];
    expect(coverTransportAction(capabilities)).toEqual({
      property: "state",
      open: "OPEN",
      close: "CLOSE",
      stop: "STOP",
    });
  });

  it("omits stop when the declared transport names no stop value", () => {
    expect(coverTransportAction([transportEnum("action", ["open", "close"])])).toEqual({
      property: "action",
      open: "open",
      close: "close",
    });
  });

  it("recognises a position-less cover by its transport alone", () => {
    expect(coverTransportAction([transportEnum("action", ["open", "close", "stop"])])).toEqual({
      property: "action",
      open: "open",
      close: "close",
      stop: "stop",
    });
  });

  it("ignores a read-only transport and a non-transport enum", () => {
    const readOnly = transportEnum("state", ["open", "close", "stop"], ro);
    const effect = transportEnum("effect", ["low", "high"]);
    expect(coverTransportAction([readOnly])).toBeNull();
    expect(coverTransportAction([effect])).toBeNull();
    expect(coverTransportAction([])).toBeNull();
  });

  it("returns null for a cover that only declares a position", () => {
    expect(coverTransportAction([numeric("position")])).toBeNull();
  });
});

describe("coverTransportTargets (design D15)", () => {
  it("commands the declared transport values when one is declared", () => {
    const capabilities = [numeric("position"), transportEnum("action", ["open", "close", "stop"])];
    expect(coverTransportTargets(coverTransportAction(capabilities), undefined)).toEqual({
      open: "open",
      close: "close",
    });
  });

  it("falls back to the position extremes when no transport is declared", () => {
    // A `FlatCapability` is what the caller already resolved for the tile; the
    // helper only reads its declared range.
    expect(
      coverTransportTargets(null, {
        property: "position",
        valueType: "numeric",
        access: rw,
        range: { min: 10, max: 90 },
        kind: "numeric",
      }),
    ).toEqual({ open: 90, close: 10 });
  });
});
