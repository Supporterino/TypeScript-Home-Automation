import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Capability } from "@ts-ha/shared";
import {
  entityCardModel,
  entityCardReading,
  entityCardWholeCardActuates,
} from "../src/app/wall/cards/EntityCard.js";

/**
 * The wall entity card — the typed fallback (task 4.3; design.md D1, D3;
 * specs/wall-display "Widget Catalog", "Wall Device Presentation" — "The whole
 * tile actuates a toggle", "A sensor is read-only"). The pure decisions are
 * covered directly: a switch has a toggle the whole card actuates, a read-only
 * sensor has none, and a device of no class is still presented with its reading.
 * The render is asserted structurally against its source (there is no DOM
 * harness), the same style as `wall-card-anatomy.test.ts`.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const CARD = join(APP_DIR, "wall/cards/EntityCard.tsx");

const rw = { readable: true, writable: true };
const ro = { readable: true, writable: false };

function numeric(property: string, access = rw): Capability {
  return { kind: "numeric", property, access, valueType: "numeric" };
}

/** A Shelly switch: a writable boolean on/off and nothing else. */
const SWITCH: Capability[] = [
  {
    kind: "switch",
    property: "on",
    access: rw,
    valueType: "boolean",
    valueOn: true,
    valueOff: false,
  },
];

/** A read-only temperature sensor: a readable numeric and nothing actuatable. */
const SENSOR: Capability[] = [
  { kind: "numeric", property: "temperature", access: ro, valueType: "numeric", unit: "°C" },
];

/** A writable numeric with no declared range — the resolver classifies it as neither `number` nor any other class. */
const UNCLASSIFIED: Capability[] = [numeric("level")];

/** Removes block and line comments so prose is not mistaken for rendered text. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function cardSource(): Promise<string> {
  return stripComments(await readFile(CARD, "utf8"));
}

describe("entityCardModel", () => {
  it("gives a switch a toggle the whole card actuates", () => {
    const model = entityCardModel(SWITCH);
    expect(model.toggle?.property).toBe("on");
    expect(entityCardWholeCardActuates(model)).toBe(true);
  });

  it("gives a read-only sensor no toggle, so its card presents no control", () => {
    const model = entityCardModel(SENSOR);
    expect(model.toggle).toBeNull();
    expect(entityCardWholeCardActuates(model)).toBe(false);
    expect(model.readout?.property).toBe("temperature");
  });

  it("gives an unclassified device no toggle — its writable numeric is not a pure toggle", () => {
    const model = entityCardModel(UNCLASSIFIED);
    expect(model.toggle).toBeNull();
    expect(entityCardWholeCardActuates(model)).toBe(false);
    expect(entityCardModel([]).toggle).toBeNull();
  });
});

describe("entityCardReading", () => {
  it("reads a switch's own on/off state", () => {
    const toggle = entityCardModel(SWITCH).toggle;
    expect(
      entityCardReading({
        readout: undefined,
        readoutValue: undefined,
        toggle,
        resolvedToggleValue: true,
      }),
    ).toBe("On");
    expect(
      entityCardReading({
        readout: undefined,
        readoutValue: undefined,
        toggle,
        resolvedToggleValue: false,
      }),
    ).toBe("Off");
  });

  it("reads a sensor's measurement with its unit", () => {
    const readout = entityCardModel(SENSOR).readout;
    expect(
      entityCardReading({
        readout,
        readoutValue: 21.5,
        toggle: null,
        resolvedToggleValue: undefined,
      }),
    ).toBe("21.5 °C");
  });

  it("reads an em dash for a device with neither a readout nor a toggle", () => {
    expect(
      entityCardReading({
        readout: undefined,
        readoutValue: undefined,
        toggle: null,
        resolvedToggleValue: undefined,
      }),
    ).toBe("—");
  });
});

describe("wall entity card source", () => {
  it("presents the icon affordance, the name, and the state", async () => {
    const source = await cardSource();
    expect(source).toContain("<WallCardIcon");
    expect(source).toContain("<WallCardText");
    expect(source).toContain("entityCardReading(");
  });

  it("actuates the whole card only where the device's primary action is a toggle", async () => {
    const source = await cardSource();
    expect(source).toContain("entityCardWholeCardActuates(model)");
    // The whole-card handler is gated on reachability too, matching the icon
    // button, so an unreachable device's card is not silently actuatable.
    expect(source).toContain("onClick={actuates && !disabled ? toggle : undefined}");
    // The icon affordance is the accessible control in that same case only.
    expect(source).toContain("onActivate={model.toggle ? toggle : undefined}");
  });

  it("presents no control where the device has none", async () => {
    const source = await cardSource();
    expect(source).not.toContain("<WallCardActions");
    expect(source).not.toContain("<WallCardSlider");
    expect(source).not.toContain("<WallCardIconButton");
  });

  it("presents a read-only device's reading as its dominant content", async () => {
    const source = await cardSource();
    expect(source).toContain("prominent={!actuates}");
  });

  it("offers no navigation affordance", async () => {
    const source = await cardSource();
    expect(source).not.toContain("deviceDetailPath");
    expect(source).not.toContain("useRouter");
    expect(source).not.toContain("navigate(");
  });

  it("reuses the shared observation encoding as a non-textual indicator", async () => {
    const source = await cardSource();
    expect(source).toContain("deviceTileObservation(device, now)");
    expect(source).toContain("<WallCardObservation");
  });

  it("presents no device-management affordance", async () => {
    const source = await cardSource();
    for (const affordance of [
      "isFavorite",
      "toggleFavorite",
      "hideDevice",
      "unhideDevice",
      "HiddenMarker",
      "FavoriteToggle",
    ]) {
      expect(source).not.toContain(affordance);
    }
  });
});
