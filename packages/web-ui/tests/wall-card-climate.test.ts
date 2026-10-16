import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Capability } from "@ts-ha/shared";
import {
  climateCardActive,
  climateCardModel,
  climateCardReading,
  climateSetpointRange,
} from "../src/app/wall/cards/ClimateCard.js";
import { resolveDeviceClass } from "../src/app/wall/cards/device-class.js";

/**
 * The wall climate card: the declared setpoint and mode covered directly; the render
 * asserted structurally.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const CARD = join(APP_DIR, "wall/cards/ClimateCard.tsx");

const rw = { readable: true, writable: true };
const ro = { readable: true, writable: false };

function numeric(property: string, access = rw, extra: Partial<Capability> = {}): Capability {
  return { kind: "numeric", property, access, valueType: "numeric", ...extra };
}

function enu(property: string, permittedValues: (string | number)[]): Capability {
  return { kind: "enum", property, access: rw, valueType: "enum", permittedValues };
}

function climate(features: Capability[]): Capability {
  return { kind: "climate", access: rw, valueType: "composite", features };
}

/** A Zigbee2MQTT climate: a `climate` container carrying its setpoint, measurement, and mode. */
const CLIMATE: Capability[] = [
  climate([
    numeric("occupied_heating_setpoint", rw, {
      range: { min: 5, max: 35 },
      unit: "°C",
      step: 0.5,
    }),
    numeric("local_temperature", ro, { unit: "°C" }),
    enu("system_mode", ["off", "heat", "auto"]),
  ]),
];

/** A climate expressed only as a writable setpoint — no climate container, no mode. */
const SETPOINT_ONLY: Capability[] = [
  numeric("target_temperature", rw, { range: { min: 5, max: 35 }, unit: "°C" }),
];

/** A thermostat that only reports its temperature: nothing writable to drive. */
const READ_ONLY_CLIMATE: Capability[] = [
  climate([numeric("local_temperature", ro, { unit: "°C" })]),
];

/** Removes block and line comments so prose is not mistaken for rendered text. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function cardSource(): Promise<string> {
  return stripComments(await readFile(CARD, "utf8"));
}

describe("climateCardModel", () => {
  it("reads the climate's setpoint, mode, and measured temperature", () => {
    const model = climateCardModel(CLIMATE);
    expect(model.setpoint?.property).toBe("occupied_heating_setpoint");
    expect(model.mode?.property).toBe("system_mode");
    expect(model.modeValues).toEqual(["off", "heat", "auto"]);
    expect(model.readout?.property).toBe("local_temperature");
  });

  it("reads a setpoint exposed without a climate container, and no mode", () => {
    const model = climateCardModel(SETPOINT_ONLY);
    expect(model.setpoint?.property).toBe("target_temperature");
    expect(model.mode).toBeUndefined();
    expect(model.modeValues).toEqual([]);
    expect(model.readout?.property).toBe("target_temperature");
  });

  it("offers no control for a thermostat that only reports its temperature", () => {
    const model = climateCardModel(READ_ONLY_CLIMATE);
    expect(model.setpoint).toBeUndefined();
    expect(model.mode).toBeUndefined();
    expect(model.readout?.property).toBe("local_temperature");
  });
});

describe("climateSetpointRange", () => {
  it("carries the declared bounds", () => {
    expect(climateSetpointRange(numeric("setpoint", rw, { range: { min: 16, max: 24 } }))).toEqual({
      min: 16,
      max: 24,
    });
  });

  it("falls back to the ported bounds for a bound missing", () => {
    expect(climateSetpointRange(numeric("setpoint", rw, { range: {} }))).toEqual({
      min: 5,
      max: 35,
    });
  });
});

describe("climateCardActive", () => {
  it("treats a thermostat whose mode reads off as inactive", () => {
    expect(climateCardActive("off")).toBe(false);
    expect(climateCardActive("OFF")).toBe(false);
    expect(climateCardActive("heat")).toBe(true);
  });

  it("treats a thermostat with no mode to read as always running", () => {
    expect(climateCardActive(undefined)).toBe(true);
    expect(climateCardActive(3)).toBe(true);
  });
});

describe("climateCardReading", () => {
  it("reads the measured temperature with its unit", () => {
    const readout = climateCardModel(CLIMATE).readout;
    expect(climateCardReading({ readout, value: 21.5 })).toBe("21.5 °C");
  });

  it("reads an em dash for a temperature the device does not report", () => {
    const readout = climateCardModel(CLIMATE).readout;
    expect(climateCardReading({ readout, value: undefined })).toBe("—");
    expect(climateCardReading({ readout: undefined, value: null })).toBe("—");
  });
});

describe("the climate card's class", () => {
  it("is the class the resolver selects for a climate capability profile", () => {
    expect(resolveDeviceClass(CLIMATE)).toBe("climate");
    expect(resolveDeviceClass(SETPOINT_ONLY)).toBe("climate");
  });
});

describe("wall climate card source", () => {
  it("presents the ported anatomy and the temperature reading", async () => {
    const source = await cardSource();
    expect(source).toContain("<WallCardIcon");
    expect(source).toContain("<WallCardText");
    expect(source).toContain("climateCardReading(");
    expect(source).toContain("<WallCardObservation");
  });

  it("presents the setpoint as a slider with the mode beside it", async () => {
    const source = await cardSource();
    expect(source).toContain("<WallCardActions>");
    expect(source).toContain("<WallCardSlider");
    expect(source).toContain("<WallCardEnumControl");
    expect(source).toContain("composition.siblings");
    expect(source).toContain("values={model.modeValues}");
    // Beside the setpoint slider the enumerated control reserves the slider's own
    // width, so the mode is never a row of options squeezed below the touch target.
    expect(source).toContain("reservedPx={WALL_CARD_ENUM_SIBLING_RESERVE_PX}");
  });

  it("presents no control for a thermostat that only reports its temperature", async () => {
    const source = await cardSource();
    expect(source).toContain("composition.controls && model.setpoint && range");
    expect(source).toContain("composition.controls && !model.setpoint && model.mode");
  });

  it("reverts a failed command inline and disables every control while unreachable", async () => {
    const source = await cardSource();
    expect(source).toContain("useOptimisticDeviceProperty");
    expect(source).toContain('role="alert"');
    expect(source).toContain("const disabled = !device.reachable");
    expect(source).toContain("disabled={disabled}");
  });

  it("presents no device-management affordance", async () => {
    const source = await cardSource();
    for (const affordance of [
      "isFavorite",
      "toggleFavorite",
      "hideDevice",
      "unhideDevice",
      "deviceDetailPath",
      "HiddenMarker",
      "FavoriteToggle",
    ]) {
      expect(source).not.toContain(affordance);
    }
  });
});
