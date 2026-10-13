import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Capability } from "@ts-ha/shared";
import { coverStopCommand } from "../src/app/lib/capability-ranking.js";
import { archetypeWholeCardActuation } from "../src/app/lib/card-archetype.js";
import { wallTileMetrics } from "../src/app/wall/scale.js";

/**
 * Structural + pure assertions for the cover transport controls (tasks 4.1–4.3;
 * design.md D6; specs/wall-display "Cover Transport Controls"). There is no DOM
 * harness here, so the control set, the optimistic wiring, the touch target, and
 * the no-hover requirement are asserted against the module sources — the same
 * style as `wall-card-archetypes.test.ts` — while the pure decision (does a stop
 * command exist) is covered by `capability-ranking.test.ts`.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const COVER_TRANSPORT = join(APP_DIR, "components/CoverTransport.tsx");
const TILE = join(APP_DIR, "components/DeviceTile.tsx");

const rw = { readable: true, writable: true };
const ro = { readable: true, writable: false };

function numeric(property: string, access = rw): Capability {
  return { kind: "numeric", property, access, valueType: "numeric" };
}

/** A Zigbee cover: writable `state` enum that includes a stop value. */
function zigbeeCover(): Capability[] {
  return [
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
}

/** A Shelly-like cover: movement state is reported read-only, so stop cannot be expressed. */
function shellyCover(): Capability[] {
  return [
    numeric("position"),
    {
      kind: "enum",
      property: "state",
      access: ro,
      valueType: "enum",
      permittedValues: ["open", "closed", "opening", "closing", "stopped", "calibrating"],
    },
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

describe("cover transport control set (task 4.1)", () => {
  it("shows three controls for a stop-capable cover", () => {
    expect(transportLabels(zigbeeCover())).toEqual(["Open", "Close", "Stop"]);
  });

  it("shows two controls for a Shelly-like cover with no writable stop", () => {
    expect(transportLabels(shellyCover())).toEqual(["Open", "Close"]);
  });

  it("renders Open and Close unconditionally and gates Stop behind the pure command", async () => {
    const src = await source(COVER_TRANSPORT);
    expect(src).toContain('label="Open cover"');
    expect(src).toContain('label="Close cover"');
    expect(src).toContain('label="Stop cover"');
    // Stop is guarded by the detector result, so it is omitted rather than rendered inert.
    expect(src).toMatch(/\{stop && \(/);
  });

  it("commands the cover to its extremes from the position range", async () => {
    const src = await source(COVER_TRANSPORT);
    expect(src).toContain("position.range?.max");
    expect(src).toContain("position.range?.min");
    expect(src).toContain("onClick={() => onChange(max)}");
    expect(src).toContain("onClick={() => onChange(min)}");
    expect(src).toContain("onClick={() => onStop(stop.value)}");
  });
});

describe("cover transport optimistic wiring (task 4.2)", () => {
  it("drives Open/Close through the tile's shared primary-control hook", async () => {
    const tile = await source(TILE);
    expect(tile).toContain("<CoverTransport");
    expect(tile).toContain("onChange={actionControl.setValue}");
    expect(tile).toContain("error={actionControl.error}");
  });

  it("drives Stop through a separate optimistic hook on the transport property", async () => {
    const tile = await source(TILE);
    expect(tile).toContain("const stopControl = useOptimisticDeviceProperty(");
    expect(tile).toContain('stopCommand?.property ?? ""');
    expect(tile).toContain("onStop={stopControl.setValue}");
    expect(tile).toContain("stopError={stopControl.error}");
  });

  it("surfaces a failed transport command with a danger treatment", async () => {
    const src = await source(COVER_TRANSPORT);
    expect(src).toContain("<Tooltip");
    expect(src).toContain("text-danger");
    expect(src).toContain("error={stopError}");
  });
});

describe("cover transport touch target and no-hover operation (task 4.3)", () => {
  it("sizes each control from the wall token's control metric", async () => {
    const tile = await source(TILE);
    expect(tile).toContain("control={metrics?.control ?? 32}");
    const src = await source(COVER_TRANSPORT);
    expect(src).toContain("width: control");
  });

  it("sets the wall metric to at least the 48px minimum touch target", () => {
    expect(wallTileMetrics("wall").control).toBeGreaterThanOrEqual(48);
  });

  it("activates on press with no hover-only affordance", async () => {
    const src = await source(COVER_TRANSPORT);
    expect(src).toContain("onClick=");
    expect(src).not.toMatch(/onMouseEnter|onMouseOver|onPointerEnter|onPointerOver/);
  });

  it("keeps the cover on its embedded transport rather than whole-card actuation", () => {
    expect(archetypeWholeCardActuation("cover")).toBe(false);
  });
});
