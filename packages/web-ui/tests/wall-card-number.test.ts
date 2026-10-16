import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Capability } from "@ts-ha/shared";
import { resolveDeviceClass } from "../src/app/wall/cards/device-class.js";
import {
  numberCardControl,
  numberCardRange,
  numberCardReading,
  numberCardReadout,
} from "../src/app/wall/cards/NumberCard.js";

/**
 * The wall number card: the pure decisions — including a device whose range is absent —
 * covered directly; the render asserted structurally.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const CARD = join(APP_DIR, "wall/cards/NumberCard.tsx");

const rw = { readable: true, writable: true };
const ro = { readable: true, writable: false };

function numeric(property: string, access = rw, extra: Partial<Capability> = {}): Capability {
  return { kind: "numeric", property, access, valueType: "numeric", ...extra };
}

/** A bounded numeric control: a writable numeric with a declared range — the `number` class. */
const BOUNDED: Capability[] = [numeric("level", rw, { range: { min: 0, max: 100 }, unit: "%" })];

/** A writable numeric with no declared range: no slider can be driven from it. */
const UNBOUNDED: Capability[] = [numeric("level")];

/** A read-only bounded numeric: its value is readable, but nothing is writable. */
const READ_ONLY: Capability[] = [numeric("level", ro, { range: { min: 0, max: 254 } })];

/** Removes block and line comments so prose is not mistaken for rendered text. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function cardSource(): Promise<string> {
  return stripComments(await readFile(CARD, "utf8"));
}

describe("numberCardControl", () => {
  it("offers the bounded numeric control the device declares", () => {
    const control = numberCardControl(BOUNDED);
    expect(control?.property).toBe("level");
    expect(control?.range).toEqual({ min: 0, max: 100 });
  });

  it("offers no control for a writable numeric whose range is absent", () => {
    expect(numberCardControl(UNBOUNDED)).toBeUndefined();
    expect(numberCardControl([])).toBeUndefined();
  });

  it("offers no control for a read-only numeric", () => {
    expect(numberCardControl(READ_ONLY)).toBeUndefined();
  });
});

describe("numberCardReadout", () => {
  it("reads the control's own value where one is declared", () => {
    expect(numberCardReadout(BOUNDED)?.property).toBe("level");
  });

  it("falls back to a readable numeric so a range-less device still reads its value", () => {
    expect(numberCardReadout(UNBOUNDED)?.property).toBe("level");
    expect(numberCardReadout(READ_ONLY)?.property).toBe("level");
    expect(numberCardReadout([])).toBeUndefined();
  });
});

describe("numberCardRange", () => {
  it("carries the declared bounds", () => {
    expect(numberCardRange(numeric("level", rw, { range: { min: 10, max: 30 } }))).toEqual({
      min: 10,
      max: 30,
    });
  });

  it("falls back to the ported 0–100 bounds for a range with a bound missing", () => {
    expect(numberCardRange(numeric("level", rw, { range: {} }))).toEqual({ min: 0, max: 100 });
    expect(numberCardRange(numeric("level", rw, { range: { max: 40 } }))).toEqual({
      min: 0,
      max: 40,
    });
  });
});

describe("numberCardReading", () => {
  it("reads the value with its unit", () => {
    expect(numberCardReading(40, "%")).toBe("40 %");
    expect(numberCardReading(12)).toBe("12");
  });

  it("reads an em dash for a value the device does not report", () => {
    expect(numberCardReading(undefined, "%")).toBe("—");
    expect(numberCardReading(null)).toBe("—");
  });
});

describe("the number card's class", () => {
  it("is the class the resolver selects for a bounded numeric control", () => {
    expect(resolveDeviceClass(BOUNDED)).toBe("number");
    // A range-less numeric is of no class, so 5.3's explanation applies rather than a card.
    expect(resolveDeviceClass(UNBOUNDED)).toBe("entity");
  });
});

describe("wall number card source", () => {
  it("presents the ported anatomy and the value with its unit", async () => {
    const source = await cardSource();
    expect(source).toContain("<WallCardIcon");
    expect(source).toContain("<WallCardText");
    expect(source).toContain("numberCardReading(");
    expect(source).toContain("numberCardReadout(device.capabilities)");
    expect(source).toContain("<WallCardObservation");
  });

  it("presents the bounded numeric as the sole action in the actions row", async () => {
    const source = await cardSource();
    // The sole action is the flexible slider, so the row keeps it flexible.
    expect(source).toContain('<WallCardActions distribution="flexible">');
    expect(source).toContain("<WallCardSlider");
    // The slider is the value's actuation target: the card never actuates whole.
    expect(source).not.toContain("onActivate");
    expect(source).not.toContain("onClick={toggle}");
  });

  it("presents no slider for a device that declares no bounded control", async () => {
    const source = await cardSource();
    // The slider is rendered only inside the declared-control branch.
    expect(source).toContain("composition.controls && control && range");
  });

  it("reverts a failed command inline and disables the control while unreachable", async () => {
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
