import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Capability } from "@ts-ha/shared";
import {
  coverStopCommand,
  coverTransportAction,
  coverTransportTargets,
  rankDeviceTile,
} from "../src/app/lib/capability-ranking.js";
import { archetypeWholeCardActuation, cardArchetype } from "../src/app/lib/card-archetype.js";
import { WALL_MIN_CONTROL_GAP, WALL_MIN_TOUCH_TARGET } from "../src/app/wall/registry.js";
import { wallTileMetrics } from "../src/app/wall/scale.js";

/**
 * Structural + pure assertions for the cover transport controls (task 2.8;
 * design.md D15; specs/wall-display "Cover Transport Controls"). There is no
 * DOM harness here, so the control set, the optimistic wiring, the touch target,
 * the adjacent-control separation, and the no-hover requirement are asserted
 * against the module sources — the same style as `wall-light-card.test.ts` —
 * while the pure decisions (which archetype, which values Open/Close command,
 * whether a stop command exists) are covered directly.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const COVER_TRANSPORT = join(APP_DIR, "components/CoverTransport.tsx");
const TILE = join(APP_DIR, "components/DeviceTile.tsx");

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

/** Removes block and line comments so prose is not mistaken for code. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function source(path: string): Promise<string> {
  return stripComments(await readFile(path, "utf8"));
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
    // A `FlatCapability` is what the tile already resolved for the cover; the
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

  it("renders Open and Close unconditionally and gates Stop behind the pure command", async () => {
    const src = await source(COVER_TRANSPORT);
    expect(src).toContain('label="Open cover"');
    expect(src).toContain('label="Close cover"');
    expect(src).toContain('label="Stop cover"');
    // Stop is guarded by the detector result, so it is omitted rather than rendered inert.
    expect(src).toMatch(/\{stop && \(/);
  });

  it("commands the declared transport value for Open and Close, the extreme when falling back", async () => {
    const src = await source(COVER_TRANSPORT);
    // The tile resolves the declared transport and passes it in; the control
    // commands it through the tile-owned channel, falling back to the tile's
    // position channel when none is declared.
    expect(src).toContain("coverTransportTargets(transport, position)");
    expect(src).toContain("channel.setValue(targets.open)");
    expect(src).toContain("channel.setValue(targets.close)");
    expect(src).toContain("onClick={() => stopChannel.setValue(stop.value)}");
  });
});

describe("cover transport optimistic wiring (design D15)", () => {
  it("lets the tile own a single transport channel shared across Open, Close, and Stop", async () => {
    const tile = await source(TILE);
    // The tile resolves the declared transport and owns one optimistic channel
    // for it, so no two hooks contend on one property (design D15).
    expect(tile).toContain("const transportControl = useOptimisticDeviceProperty(");
    expect(tile).toContain('transportAction?.property ?? ""');
    expect(tile).toContain("setValue: transportControl.setValue");
    expect(tile).toContain("transport={transportAction}");
    expect(tile).toContain("transportChannel={{");
    // The control no longer owns a channel of its own.
    const src = await source(COVER_TRANSPORT);
    expect(src).toContain("transportChannel");
    expect(src).not.toContain("useOptimisticDeviceProperty(");
  });

  it("falls back to the tile's primary position channel when no transport is declared", async () => {
    const src = await source(COVER_TRANSPORT);
    expect(src).toContain("setValue: onChange");
    const tile = await source(TILE);
    expect(tile).toContain("<CoverTransport");
    expect(tile).toContain("onChange={actionControl.setValue}");
    expect(tile).toContain("error={actionControl.error}");
  });

  it("routes Stop through the shared transport channel when it targets the same property", async () => {
    const tile = await source(TILE);
    expect(tile).toContain("const stopControl = useOptimisticDeviceProperty(");
    expect(tile).toContain("stopCommand.property === transportAction?.property");
    expect(tile).toContain("setValue: stopControl.setValue");
    expect(tile).toContain("stopChannel={");
    const src = await source(COVER_TRANSPORT);
    expect(src).toContain("onClick={() => stopChannel.setValue(stop.value)}");
  });

  it("surfaces a failed transport command inline with a danger treatment", async () => {
    const src = await source(COVER_TRANSPORT);
    expect(src).toContain('role="alert"');
    expect(src).toContain("var(--hearth-danger)");
    expect(src).toContain("stopChannel.error");
  });
});

describe("cover transport touch target, separation, and no-hover operation (design D4, D15)", () => {
  it("sizes each control from the wall token's control metric, at the kiosk-class target", async () => {
    const tile = await source(TILE);
    expect(tile).toContain("control={metrics?.control ?? 32}");
    const src = await source(COVER_TRANSPORT);
    expect(src).toContain("width: control");
    expect(src).toContain("height: control");
    expect(wallTileMetrics("wall").control).toBeGreaterThanOrEqual(WALL_MIN_TOUCH_TARGET);
  });

  it("separates the adjacent controls by at least the wall's ≥8px floor", async () => {
    const src = await source(COVER_TRANSPORT);
    // Hearth's space-2 (8px) is the transport row's gap, matching the floor.
    expect(src).toContain("var(--hearth-space-2)");
    expect(WALL_MIN_CONTROL_GAP).toBeGreaterThanOrEqual(8);
  });

  it("activates on press with no hover-only affordance", async () => {
    const src = await source(COVER_TRANSPORT);
    expect(src).toContain("onClick=");
    expect(src).not.toMatch(/onMouseEnter|onMouseOver|onPointerEnter|onPointerOver/);
  });

  it("keeps the cover on its embedded transport rather than whole-card actuation", () => {
    expect(archetypeWholeCardActuation("cover")).toBe(false);
  });

  it("stays a wall-only presentation (the cover archetype is chosen only on the wall)", async () => {
    const tile = await source(TILE);
    expect(tile).toContain('wall ? cardArchetype(ranking, device.capabilities) : "default"');
  });
});
