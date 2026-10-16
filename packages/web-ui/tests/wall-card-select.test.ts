import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Capability } from "@ts-ha/shared";
import { resolveDeviceClass } from "../src/app/wall/cards/device-class.js";
import {
  selectCardModel,
  selectCardReading,
  selectCardReadout,
} from "../src/app/wall/cards/SelectCard.js";

/**
 * The wall select card: the pure decisions — including a device whose permitted values
 * are absent — covered directly; the render asserted structurally.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const CARD = join(APP_DIR, "wall/cards/SelectCard.tsx");

const rw = { readable: true, writable: true };
const ro = { readable: true, writable: false };

function enu(
  property: string,
  permittedValues: (string | number)[] | undefined,
  access = rw,
): Capability {
  return { kind: "enum", property, access, valueType: "enum", permittedValues };
}

/** An enumerated control: a writable enum with permitted values — the `select` class. */
const ENUMERATED: Capability[] = [enu("mode", ["day", "night"])];

/** A writable enum with no permitted values: no options can be presented from it. */
const UNENUMERATED: Capability[] = [enu("mode", undefined)];

/** A writable enum with an empty value list — likewise nothing to present. */
const EMPTY: Capability[] = [enu("mode", [])];

/** A read-only enumerated state: readable, but nothing is writable. */
const READ_ONLY: Capability[] = [enu("mode", ["day", "night"], ro)];

/** Removes block and line comments so prose is not mistaken for rendered text. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function cardSource(): Promise<string> {
  return stripComments(await readFile(CARD, "utf8"));
}

describe("selectCardModel", () => {
  it("offers the enumerated control with its permitted values", () => {
    const model = selectCardModel(ENUMERATED);
    expect(model.control?.property).toBe("mode");
    expect(model.values).toEqual(["day", "night"]);
  });

  it("offers no control for an enum whose permitted values are absent or empty", () => {
    expect(selectCardModel(UNENUMERATED).control).toBeUndefined();
    expect(selectCardModel(UNENUMERATED).values).toEqual([]);
    expect(selectCardModel(EMPTY).control).toBeUndefined();
    expect(selectCardModel([]).control).toBeUndefined();
  });

  it("offers no control for a read-only enum", () => {
    expect(selectCardModel(READ_ONLY).control).toBeUndefined();
  });
});

describe("selectCardReadout", () => {
  it("reads the control's own value where one is declared", () => {
    expect(selectCardReadout(ENUMERATED)?.property).toBe("mode");
  });

  it("falls back to a readable enum so a value-less device still reads its value", () => {
    expect(selectCardReadout(UNENUMERATED)?.property).toBe("mode");
    expect(selectCardReadout(READ_ONLY)?.property).toBe("mode");
    expect(selectCardReadout([])).toBeUndefined();
  });
});

describe("selectCardReading", () => {
  it("reads the current value as text", () => {
    expect(selectCardReading("day")).toBe("day");
    expect(selectCardReading(2)).toBe("2");
  });

  it("reads an em dash for a value the device does not report", () => {
    expect(selectCardReading(undefined)).toBe("—");
    expect(selectCardReading(null)).toBe("—");
  });
});

describe("the select card's class", () => {
  it("is the class the resolver selects for an enumerated control", () => {
    expect(resolveDeviceClass(ENUMERATED)).toBe("select");
    // An enum that enumerates nothing is of no class, so 5.3's explanation applies.
    expect(resolveDeviceClass(UNENUMERATED)).toBe("entity");
  });
});

describe("wall select card source", () => {
  it("presents the ported anatomy and the current value", async () => {
    const source = await cardSource();
    expect(source).toContain("<WallCardIcon");
    expect(source).toContain("<WallCardText");
    expect(source).toContain("selectCardReading(");
    expect(source).toContain("<WallCardObservation");
  });

  it("presents the permitted values as the sole action in the actions row", async () => {
    const source = await cardSource();
    expect(source).toContain("<WallCardActions>");
    expect(source).toContain("<WallCardEnumControl");
    expect(source).toContain("values={model.values}");
    // The options are the property's actuation target: the card never actuates whole.
    expect(source).not.toContain("onActivate");
    expect(source).not.toContain("onClick={toggle}");
  });

  it("presents no options for a device whose permitted values are absent", async () => {
    const source = await cardSource();
    expect(source).toContain("composition.controls && model.control");
  });

  it("marks the current value and surfaces a rejected command inline", async () => {
    const source = await cardSource();
    // The whole enumerated control carries the error, as the sibling cards' own
    // controls do — not only the option matching the current (reverted) value.
    expect(source).toContain("error={value.error !== null}");
    expect(source).toContain("current={current}");
    expect(source).toContain("useOptimisticDeviceProperty");
    expect(source).toContain('role="alert"');
    expect(source).toContain("const disabled = !device.reachable");
  });

  it("chooses the enumerated control's form from the box the card is given", async () => {
    const source = await cardSource();
    expect(source).toContain("box={box ?? DEFAULT_WALL_CARD_BOX}");
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
