import { describe, expect, it } from "bun:test";
import type { Capability } from "@ts-ha/shared";
import {
  coverStopCommand,
  coverTransportAction,
  coverTransportTargets,
  rankDeviceTile,
} from "../src/app/lib/capability-ranking.js";
import { cardArchetype } from "../src/app/lib/card-archetype.js";
import { WALL_MIN_CONTROL_GAP } from "../src/app/wall/registry.js";

/**
 * The cover transport decisions (design.md D15; specs/wall-display "Cover
 * Transport Controls"). The control set, the optimistic wiring, and the drawing
 * now live in the wall's own `CoverCard` (`wall-card-cover.test.ts` covers the
 * card); what stays here is the pure detection and value resolution the card
 * drives — which device is a cover, which values Open/Close command, and whether
 * a stop command exists.
 */
const rw = { readable: true, writable: true };
const ro = { readable: true, writable: false };

function numeric(property: string, access = rw): Capability {
  return { kind: "numeric", property, access, valueType: "numeric" };
}

function transportEnum(property: string, permittedValues: string[], access = rw): Capability {
  return { kind: "enum", property, access, valueType: "enum", permittedValues };
}

/** A Zigbee cover: a writable `state` transport enum with a stop value. */
function zigbeeCover(): Capability[] {
  return [
    {
      kind: "cover",
      access: rw,
      valueType: "composite",
      features: [numeric("position"), transportEnum("state", ["open", "close", "stop"])],
    },
  ];
}

/** A Shelly cover: a write-only `action` transport enum beside a writable position and a read-only state. */
function shellyCover(): Capability[] {
  return [
    numeric("position"),
    transportEnum("action", ["open", "close", "stop"], { readable: false, writable: true }),
    transportEnum("state", ["open", "closed", "opening", "closing", "stopped", "calibrating"], ro),
  ];
}

/** A position-less cover: a writable transport action and no writable position. */
function positionLessCover(): Capability[] {
  return [
    {
      kind: "cover",
      access: rw,
      valueType: "composite",
      features: [transportEnum("action", ["open", "close", "stop"])],
    },
  ];
}

/** A cover whose transport names open and close but cannot stop. */
function openCloseOnlyCover(): Capability[] {
  return [numeric("position"), transportEnum("action", ["open", "close"])];
}

/** A cover that only positions: its movement state is read-only, so it cannot stop. */
function positionOnlyCover(): Capability[] {
  return [
    numeric("position"),
    transportEnum("state", ["open", "closed", "opening", "closing", "stopped"], ro),
  ];
}

/** The labels a cover card renders — Stop is present exactly when the pure helper finds a command. */
function transportLabels(capabilities: Capability[]): string[] {
  return ["Open", "Close", ...(coverStopCommand(capabilities) ? ["Stop"] : [])];
}

describe("cover detection — position or a declared transport action (design D15)", () => {
  it("recognises a cover whose primary action is a position", () => {
    const capabilities = zigbeeCover();
    expect(cardArchetype(rankDeviceTile(capabilities), capabilities)).toBe("cover");
  });

  it("recognises a position-less cover by its declared transport action", () => {
    const capabilities = positionLessCover();
    // No writable position, so the ranking's primary action is the enum — the
    // broadened detection must still call this a cover, not a generic control.
    expect(rankDeviceTile(capabilities).action?.kind).toBe("enum");
    expect(cardArchetype(rankDeviceTile(capabilities), capabilities)).toBe("cover");
  });

  it("does not mistake a non-transport enum for a cover", () => {
    const capabilities: Capability[] = [
      {
        kind: "fan",
        access: rw,
        valueType: "composite",
        features: [transportEnum("effect", ["low", "high"])],
      },
    ];
    expect(cardArchetype(rankDeviceTile(capabilities), capabilities)).toBe("default");
  });
});

describe("cover transport values (design D15)", () => {
  it("uses the declared transport values for open and close", () => {
    const transport = coverTransportAction(shellyCover());
    expect(transport).toEqual({ property: "action", open: "open", close: "close", stop: "stop" });
    // A declared transport wins outright — the position is not even consulted.
    expect(coverTransportTargets(transport, undefined)).toEqual({
      open: "open",
      close: "close",
    });
  });

  it("preserves the authored case of the declared transport values", () => {
    const capabilities = [numeric("position"), transportEnum("state", ["OPEN", "CLOSE", "STOP"])];
    expect(coverTransportTargets(coverTransportAction(capabilities), undefined)).toEqual({
      open: "OPEN",
      close: "CLOSE",
    });
  });

  it("omits stop when the transport declares no stop value", () => {
    expect(coverTransportAction(openCloseOnlyCover())).toEqual({
      property: "action",
      open: "open",
      close: "close",
    });
  });

  it("falls back to the position extremes when no transport action is declared", () => {
    // A `FlatCapability` is what the card already resolved for the cover; the
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

  it("returns no transport for a device that only positions", () => {
    expect(coverTransportAction(positionOnlyCover())).toBeNull();
    expect(coverTransportAction([numeric("temperature", ro)])).toBeNull();
    expect(coverTransportAction([])).toBeNull();
  });
});

describe("cover transport control set (design D15)", () => {
  it("shows three controls for a stop-capable cover", () => {
    expect(transportLabels(zigbeeCover())).toEqual(["Open", "Close", "Stop"]);
    expect(transportLabels(shellyCover())).toEqual(["Open", "Close", "Stop"]);
  });

  it("shows two controls for a cover that cannot stop", () => {
    expect(transportLabels(positionOnlyCover())).toEqual(["Open", "Close"]);
    expect(transportLabels(openCloseOnlyCover())).toEqual(["Open", "Close"]);
  });

  it("keeps at least the wall's ≥8px separation floor between adjacent controls", () => {
    expect(WALL_MIN_CONTROL_GAP).toBeGreaterThanOrEqual(8);
  });
});
