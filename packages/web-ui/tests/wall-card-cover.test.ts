import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Capability } from "@ts-ha/shared";
import { coverCardModel, coverCardReading } from "../src/app/wall/cards/CoverCard.js";

/**
 * The wall cover card (task 4.2; design.md D1, D15; specs/wall-display "Wall
 * Device Presentation", "Cover Transport Controls"). The transport model — which
 * property carries Open/Close, which values they command, and whether Stop
 * exists — is pure and covered directly, including the position-less cover and
 * the cover without a stop, while the render is asserted structurally against
 * its source (there is no DOM harness), the same style as
 * `wall-card-anatomy.test.ts`.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const CARD = join(APP_DIR, "wall/cards/CoverCard.tsx");

const rw = { readable: true, writable: true };
const ro = { readable: true, writable: false };

function numeric(property: string, access = rw, extra: Partial<Capability> = {}): Capability {
  return { kind: "numeric", property, access, valueType: "numeric", ...extra };
}

function cover(features: Capability[]): Capability {
  return { kind: "cover", access: rw, valueType: "composite", features };
}

function transportEnum(values: string[] | undefined): Capability {
  return {
    kind: "enum",
    property: "action",
    access: { readable: false, writable: true },
    valueType: "enum",
    permittedValues: values,
  };
}

/** A Shelly cover: a writable position beside a transport enum naming open, close, and stop. */
const STOP_CAPABLE_COVER: Capability[] = [
  cover([
    numeric("position", rw, { range: { min: 0, max: 100 }, unit: "%" }),
    transportEnum(["open", "close", "stop"]),
  ]),
];

/** A position-less cover: a transport enum that names open and close only. */
const POSITIONLESS_COVER: Capability[] = [
  {
    kind: "enum",
    property: "action",
    access: { readable: false, writable: true },
    valueType: "enum",
    permittedValues: ["OPEN", "CLOSE"],
  },
];

/** A cover that positions without a declared transport — a Zigbee cover whose movement is its own state. */
const POSITION_ONLY_COVER: Capability[] = [
  cover([numeric("position", rw, { range: { min: 0, max: 100 }, unit: "%" })]),
];

/** A cover whose position is read-only and which declares no writable transport — nothing to drive. */
const READ_ONLY_COVER: Capability[] = [
  cover([numeric("position", ro, { range: { min: 0, max: 100 }, unit: "%" })]),
];

/** Removes block and line comments so prose is not mistaken for rendered text. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function cardSource(): Promise<string> {
  return stripComments(await readFile(CARD, "utf8"));
}

describe("coverCardModel", () => {
  it("reads a position as the primary reading and transports through the declared action", () => {
    const model = coverCardModel(STOP_CAPABLE_COVER);
    expect(model.position?.property).toBe("position");
    expect(model.transportProperty).toBe("action");
    expect(model.targets).toEqual({ open: "open", close: "close" });
  });

  it("offers stop only when the device can express it", () => {
    expect(coverCardModel(STOP_CAPABLE_COVER).stop).toEqual({ property: "action", value: "stop" });
    expect(coverCardModel(POSITIONLESS_COVER).stop).toBeNull();
    expect(coverCardModel(POSITION_ONLY_COVER).stop).toBeNull();
  });

  it("drives a position-less cover through its declared transport", () => {
    const model = coverCardModel(POSITIONLESS_COVER);
    expect(model.position).toBeUndefined();
    expect(model.transportProperty).toBe("action");
    // The declared authored values are used verbatim, not lower-cased.
    expect(model.targets).toEqual({ open: "OPEN", close: "CLOSE" });
  });

  it("falls Open/Close back to the position extremes when no transport is declared", () => {
    const model = coverCardModel(POSITION_ONLY_COVER);
    expect(model.transportProperty).toBe("position");
    expect(model.targets).toEqual({ open: 100, close: 0 });
  });

  it("reports no transport property for a cover with nothing writable to drive", () => {
    const model = coverCardModel(READ_ONLY_COVER);
    expect(model.position?.property).toBe("position");
    expect(model.transportProperty).toBeUndefined();
  });
});

describe("coverCardReading", () => {
  it("reads the position with its unit when the device reports one", () => {
    const position = coverCardModel(STOP_CAPABLE_COVER).position;
    expect(coverCardReading({ position, positionValue: 40, stateValue: undefined })).toBe("40 %");
  });

  it("reads the movement state for a position-less cover", () => {
    expect(
      coverCardReading({ position: undefined, positionValue: undefined, stateValue: "open" }),
    ).toBe("open");
  });

  it("falls back to the movement state, then an em dash, when there is no position value", () => {
    const position = coverCardModel(POSITION_ONLY_COVER).position;
    expect(coverCardReading({ position, positionValue: undefined, stateValue: "opening" })).toBe(
      "opening",
    );
    expect(
      coverCardReading({ position: undefined, positionValue: undefined, stateValue: undefined }),
    ).toBe("—");
  });
});

describe("wall cover card source", () => {
  it("presents the position as the primary reading, never as a slider", async () => {
    const source = await cardSource();
    expect(source).toContain("<WallCardText");
    expect(source).toContain("coverCardReading(");
    expect(source).not.toContain("<WallCardSlider");
  });

  it("presents discrete open/stop/close transport in the actions row", async () => {
    const source = await cardSource();
    expect(source).toContain("<WallCardActions>");
    expect(source).toContain("<WallCardIconButton");
    expect(source).toContain("<ChevronUp");
    expect(source).toContain("<ChevronDown");
    expect(source).toContain("<Square");
    // Stop is rendered only for the command the pure detector found.
    expect(source).toContain("{model.stop &&");
  });

  it("never makes the whole card the actuation target", async () => {
    const source = await cardSource();
    expect(source).not.toContain("onActivate");
    expect(source).not.toContain("onClick={toggle}");
  });

  it("reverts a failed transport inline and surfaces it", async () => {
    const source = await cardSource();
    // Open/Close/Stop all run through the shared optimistic channel, and a
    // rejection is surfaced as an alert on the card.
    expect(source).toContain("useOptimisticDeviceProperty");
    expect(source).toContain('role="alert"');
  });

  it("disables every transport control while the device is unreachable", async () => {
    const source = await cardSource();
    expect(source).toContain("const disabled = !device.reachable");
    expect(source).toContain("disabled={disabled}");
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
      "deviceDetailPath",
      "HiddenMarker",
      "FavoriteToggle",
    ]) {
      expect(source).not.toContain(affordance);
    }
  });
});
