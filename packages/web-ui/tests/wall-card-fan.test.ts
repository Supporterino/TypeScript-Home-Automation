import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Capability } from "@ts-ha/shared";
import { resolveDeviceClass } from "../src/app/wall/cards/device-class.js";
import { fanCardModel, fanCardReading, fanPercentageRange } from "../src/app/wall/cards/FanCard.js";

/**
 * The wall fan card: the declared on/off, percentage, and presets covered directly;
 * the render asserted structurally.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const CARD = join(APP_DIR, "wall/cards/FanCard.tsx");

const rw = { readable: true, writable: true };

function numeric(property: string, access = rw, extra: Partial<Capability> = {}): Capability {
  return { kind: "numeric", property, access, valueType: "numeric", ...extra };
}

function enu(property: string, permittedValues: (string | number)[]): Capability {
  return {
    kind: "enum",
    property,
    access: rw,
    valueType: "enum",
    permittedValues,
  };
}

function bool(property: string): Capability {
  return {
    kind: "switch",
    property,
    access: rw,
    valueType: "boolean",
    valueOn: "ON",
    valueOff: "OFF",
  };
}

function fan(features: Capability[]): Capability {
  return { kind: "fan", access: rw, valueType: "composite", features };
}

/** A Zigbee2MQTT fan: a `fan` container carrying its state, percentage, and speed steps. */
const FAN: Capability[] = [
  fan([
    bool("state"),
    numeric("percentage", rw, { range: { min: 0, max: 100 }, unit: "%" }),
    enu("mode", ["low", "medium", "high"]),
  ]),
];

/** A fan that declares only its state — nothing for a slider or a preset option to drive. */
const STATE_ONLY_FAN: Capability[] = [fan([bool("state")])];

/** A fan whose percentage declares no range: no slider can be driven from it. */
const RANGE_LESS_FAN: Capability[] = [fan([bool("state"), numeric("percentage")])];

/** Removes block and line comments so prose is not mistaken for rendered text. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function cardSource(): Promise<string> {
  return stripComments(await readFile(CARD, "utf8"));
}

describe("fanCardModel", () => {
  it("reads the fan's on/off, percentage, and presets", () => {
    const model = fanCardModel(FAN);
    expect(model.onOff?.property).toBe("state");
    expect(model.percentage?.property).toBe("percentage");
    expect(model.presets?.property).toBe("mode");
    expect(model.presetValues).toEqual(["low", "medium", "high"]);
    expect(model.readout?.property).toBe("percentage");
  });

  it("offers only the controls the device declares", () => {
    const model = fanCardModel(STATE_ONLY_FAN);
    expect(model.onOff?.property).toBe("state");
    expect(model.percentage).toBeUndefined();
    expect(model.presets).toBeUndefined();
    expect(model.presetValues).toEqual([]);
  });

  it("offers no percentage for a numeric whose range is absent", () => {
    expect(fanCardModel(RANGE_LESS_FAN).percentage).toBeUndefined();
    expect(fanCardModel([]).percentage).toBeUndefined();
    expect(fanCardModel([]).onOff).toBeNull();
  });
});

describe("fanPercentageRange", () => {
  it("carries the declared bounds", () => {
    const percentage = numeric("percentage", rw, { range: { min: 10, max: 60 } });
    expect(fanPercentageRange(percentage)).toEqual({ min: 10, max: 60 });
  });

  it("falls back to the ported 0–100 bounds for a bound missing", () => {
    expect(fanPercentageRange(numeric("percentage", rw, { range: {} }))).toEqual({
      min: 0,
      max: 100,
    });
  });
});

describe("fanCardReading", () => {
  it("reads the percentage with its unit while the fan is on", () => {
    expect(
      fanCardReading({
        hasOnOff: true,
        isOn: true,
        percentageValue: 66,
        unit: "%",
      }),
    ).toBe("66 %");
  });

  it("reads the plain on state for a fan with no percentage, and Off when off", () => {
    expect(fanCardReading({ hasOnOff: true, isOn: true })).toBe("On");
    expect(fanCardReading({ hasOnOff: true, isOn: false, percentageValue: 66, unit: "%" })).toBe(
      "Off",
    );
  });

  it("reads the percentage of a fan that declares no on/off, and an em dash with neither", () => {
    expect(fanCardReading({ hasOnOff: false, isOn: false, percentageValue: 40, unit: "%" })).toBe(
      "40 %",
    );
    expect(fanCardReading({ hasOnOff: false, isOn: false })).toBe("—");
  });
});

describe("the fan card's class", () => {
  it("is the class the resolver selects for a fan capability profile", () => {
    expect(resolveDeviceClass(FAN)).toBe("fan");
    expect(resolveDeviceClass(STATE_ONLY_FAN)).toBe("fan");
  });
});

describe("wall fan card source", () => {
  it("makes the icon affordance the fan's on/off control and reads the percentage", async () => {
    const source = await cardSource();
    expect(source).toContain("<WallCardIcon");
    expect(source).toContain("onActivate=");
    expect(source).toContain('fill="currentColor"');
    expect(source).toContain("fanCardReading(");
    expect(source).toContain("<WallCardObservation");
  });

  it("makes the whole one-row cell the fan's toggle's actuation target", async () => {
    const source = await cardSource();
    // The one-row ("slim") branch supplies the whole-cell actuation, mirroring the entity
    // card: a fan whose only action is its on/off toggle is exactly the case a one-row fan
    // is authorable in.
    const start = source.indexOf('composition.form === "slim"');
    const end = source.indexOf("\n  return (", start);
    const slim = source.slice(start, end === -1 ? source.length : end);

    expect(slim).toContain("<WallCardSlim");
    expect(slim).toContain("onActivate={toggleOnOff}");
  });

  it("presents the percentage as a slider with the presets beside it", async () => {
    const source = await cardSource();
    // The slider is flexible, so the row keeps it flexible rather than spreading it.
    expect(source).toContain('<WallCardActions distribution="flexible">');
    expect(source).toContain("<WallCardSlider");
    expect(source).toContain("<WallCardEnumControl");
    expect(source).toContain("composition.siblings");
    expect(source).toContain("values={model.presetValues}");
    // Beside the percentage slider the enumerated control reserves the slider's own
    // width, so the presets are never a row of options squeezed below the touch target.
    expect(source).toContain("reservedPx={WALL_CARD_ENUM_SIBLING_RESERVE_PX}");
  });

  it("distributes the presets-only row when the fan declares no percentage", async () => {
    const source = await cardSource();
    // The presets-only row is a row of fixed options, so it spreads across the card.
    expect(source).toContain('<WallCardActions distribution="distributed">');
    expect(source).toContain("composition.controls && !model.percentage && model.presets");
  });

  it("turns the fan on when the percentage is set while it is stopped", async () => {
    const source = await cardSource();
    expect(source).toContain("deviceTileToggledValue(");
    expect(source).toContain("if (!isOn && onOff)");
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
