import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Capability, DeviceDescriptor } from "@ts-ha/shared";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { type DataStoreFixtures, DataStoreProvider } from "../src/app/lib/data-store.js";
import {
  EntityCard,
  entityCardModel,
  entityCardReading,
  entityCardWholeCardActuates,
} from "../src/app/wall/cards/EntityCard.js";
import { ROW_UNIT_MIN, WALL_MIN_DEVICE_COLUMNS } from "../src/app/wall/grid.js";
import { WALL_MIN_TOUCH_TARGET } from "../src/app/wall/registry.js";

/**
 * The wall entity card — the typed fallback: a switch has a toggle the whole card
 * actuates, a read-only sensor has none; the render asserted structurally.
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

/** A device descriptor carrying the given capabilities, with the state the card reads. */
function entityDevice(capabilities: Capability[]): DeviceDescriptor {
  return {
    source: "test",
    id: "hall",
    qualifiedId: "test:hall",
    displayName: "Hall switch",
    state: { on: true, temperature: 21.5 },
    capabilities,
    reachable: true,
    observation: { mode: "push", observedAt: 0 },
    hidden: false,
  };
}

/** Renders the entity card at a one-row device box, inside the store the wall renders it in. */
function renderOneRow(capabilities: Capability[]): string {
  const device = entityDevice(capabilities);
  const fixtures: DataStoreFixtures = {
    devices: [device],
    state: {},
    rooms: [],
    automations: [],
    transport: "live",
  };
  return renderToStaticMarkup(
    createElement(
      DataStoreProvider,
      { fixtures },
      createElement(EntityCard, {
        device,
        box: { widthPx: WALL_MIN_DEVICE_COLUMNS * ROW_UNIT_MIN, heightPx: ROW_UNIT_MIN },
      }),
    ),
  );
}

describe("the entity card's one-row slim form", () => {
  it("branches to the shared slim line and keeps the whole-cell toggle up to reachability", async () => {
    const source = await cardSource();

    expect(source).toContain("WallCardSlim");
    expect(source).toContain('composition.form === "slim"');
    // The slim cell is the actuation target in the same case the icon affordance is.
    expect(source).toContain("onActivate={actuates && !disabled ? toggle : undefined}");
  });

  it("draws the name over a single line with no observation indicator", () => {
    const html = renderOneRow(SWITCH);

    expect(html).toContain("Hall switch");
    expect(html).not.toContain('role="img"');
  });

  it("keeps its one control at the wall's touch target at one row", () => {
    const html = renderOneRow(SWITCH);

    // The icon affordance is the only control the one-row line draws, at the ported
    // control height — never a sub-target control.
    expect(html.match(/<button/g) ?? []).toHaveLength(1);
    expect(html).toContain(`min-height:${WALL_MIN_TOUCH_TARGET}px`);
    expect(WALL_MIN_TOUCH_TARGET).toBe(42);
  });

  it("offers no control and no observation for a read-only device at one row", () => {
    const html = renderOneRow(SENSOR);

    expect(html).toContain("21.5 °C");
    expect(html).not.toContain("<button");
    expect(html).not.toContain('role="img"');
  });
});
