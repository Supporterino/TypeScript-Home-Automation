import { describe, expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Capability } from "@ts-ha/shared";
import {
  writableColorCapability,
  writableColorTemperatureCapability,
} from "../src/app/lib/capability-ranking.js";
import {
  ROW_UNIT_MAX,
  ROW_UNIT_MIN,
  WALL_COMPACT_CARD_HEIGHT_PX,
  WALL_GUTTER_MIN_PX,
} from "../src/app/wall/grid.js";
import { WALL_MIN_CONTROL_GAP, WALL_MIN_TOUCH_TARGET } from "../src/app/wall/registry.js";
import { WALL_COMPACT_CARD_INSET_PX, wallTileMetrics } from "../src/app/wall/scale.js";
import {
  cardHeightPx,
  resolveCardFormForHeight,
  WALL_FULL_CARD_HEIGHT_PX,
} from "../src/app/wall/span.js";

/**
 * The wall light card's controls (tasks 2.6, 3.1; design.md D7, D12, D13;
 * specs/wall-display "Wall Device Presentation"). The colour /
 * colour-temperature selection is pure and covered directly — including that a
 * control is omitted when the capability is absent — while the tile's render
 * decisions have no DOM harness here, so they are asserted structurally against
 * the shared tile's source, the same style as `wall-card-archetypes.test.ts`.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const TILE = join(APP_DIR, "components/DeviceTile.tsx");

const rw = { readable: true, writable: true };
const ro = { readable: true, writable: false };

/**
 * The form a wall light card composes in a cell of `rows` rows. A `device`
 * widget's frame is chrome-less, so the tile's box *is* the cell: the render path
 * resolves the form from the renderer's box (`wall/frame.ts`'s
 * `rendererBoxHeightPx`), which for this type is the cell height.
 */
function formForCell(input: { rows: number; rowUnit: number; gutterPx?: number }) {
  return resolveCardFormForHeight(cardHeightPx(input));
}

function onOff(property = "on"): Capability {
  return { kind: "switch", property, access: rw, valueType: "boolean" };
}

function numeric(property: string, access = rw, extra: Partial<Capability> = {}): Capability {
  return { kind: "numeric", property, access, valueType: "numeric", ...extra };
}

function light(features: Capability[]): Capability {
  return { kind: "light", access: rw, valueType: "composite", features };
}

/** Removes block and line comments so prose is not mistaken for rendered text. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function tileSource(): Promise<string> {
  return stripComments(await readFile(TILE, "utf8"));
}

/**
 * Isolates the wall light-card branch of the tile source — from the archetype
 * check to the generic fallback — so its assertions are light-card-specific and
 * never match another archetype's markup.
 */
function lightBranch(source: string): string {
  const start = source.indexOf("} else if (lightCard && actionCapability && brightnessCapability)");
  return source.slice(start, source.indexOf("} else {", start));
}

/**
 * Isolates the compact composition — from the compact branch to the full
 * composition's guard — so its assertions never match the full form's markup.
 */
function compactBranch(source: string): string {
  const start = source.indexOf("if (wallLightCompactCard(wall, wallCardForm, archetype)) {");
  return source.slice(start, source.indexOf("    } else {", start));
}

/** Every `.ts`/`.tsx` module under the app, as paths relative to it. */
async function appSources(dir = APP_DIR): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await appSources(path)));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(relative(APP_DIR, path));
    }
  }
  return files;
}

/** The app modules that pass a span tier or a card form to the shared device tile. */
async function tierPassers(): Promise<{ tiers: string[]; forms: string[]; both: string[] }> {
  const tiers: string[] = [];
  const forms: string[] = [];
  const both: string[] = [];
  for (const file of await appSources()) {
    const text = await readFile(join(APP_DIR, file), "utf8");
    const hasTier = text.includes("wallTier=");
    const hasForm = text.includes("wallCardForm=");
    if (hasTier) tiers.push(file);
    if (hasForm) forms.push(file);
    // A wall call site that forwards one without the other would silently fall
    // back to the *full* composition — the clipping bug this change fixes.
    if (hasTier !== hasForm) both.push(file);
  }
  return { tiers: tiers.sort(), forms: forms.sort(), both: both.sort() };
}

describe("writableColorTemperatureCapability", () => {
  it("finds a writable colour temperature the light card can drive", () => {
    const capabilities = [
      light([
        onOff("state"),
        numeric("brightness"),
        numeric("color_temp", rw, { range: { min: 153, max: 500 } }),
      ]),
    ];
    expect(writableColorTemperatureCapability(capabilities)?.property).toBe("color_temp");
  });

  it("returns undefined when the device declares no colour temperature", () => {
    expect(
      writableColorTemperatureCapability([onOff("state"), numeric("brightness")]),
    ).toBeUndefined();
  });

  it("returns undefined when the colour temperature is read-only", () => {
    expect(writableColorTemperatureCapability([numeric("color_temp", ro)])).toBeUndefined();
  });

  it("returns undefined for a non-numeric colour temperature", () => {
    const capabilities: Capability[] = [
      { kind: "enum", property: "color_temp", access: rw, valueType: "enum" },
    ];
    expect(writableColorTemperatureCapability(capabilities)).toBeUndefined();
  });
});

describe("writableColorCapability", () => {
  it("finds a writable hue — the canonical colour channel", () => {
    // Nanoleaf authors hue/saturation directly; a Zigbee colour light exposes
    // hue beneath its `color` composite.
    const capabilities = [numeric("hue", rw, { range: { min: 0, max: 360 } })];
    expect(writableColorCapability(capabilities)?.property).toBe("hue");
  });

  it("finds a writable numeric color", () => {
    expect(writableColorCapability([numeric("color")])?.property).toBe("color");
  });

  it("returns undefined when the device declares no colour channel", () => {
    expect(
      writableColorCapability([onOff("state"), numeric("brightness"), numeric("color_temp")]),
    ).toBeUndefined();
  });

  it("returns undefined when the colour is read-only", () => {
    expect(writableColorCapability([numeric("hue", ro)])).toBeUndefined();
  });

  it("returns undefined for a composite colour it cannot drive from one control", () => {
    const capabilities: Capability[] = [
      { kind: "composite", property: "color", access: rw, valueType: "composite" },
    ];
    expect(writableColorCapability(capabilities)).toBeUndefined();
  });
});

describe("wall light card source", () => {
  it("presents a touch-sized device-icon on/off affordance and a full-width brightness bar", async () => {
    const source = await tileSource();
    expect(source).toContain('archetype === "light"');
    expect(source).toContain("<Lightbulb");
    // The badge is the on/off affordance, its fill encoding state without colour.
    expect(source).toContain("aria-pressed={lightOn}");
    expect(source).toContain('fill="currentColor"');
    // The brightness bar is a full-width value control.
    expect(source).toContain('type="range"');
    expect(source).toContain("aria-label={brightnessCapability.property}");
    expect(source).toContain('width: "100%"');
  });

  it("turns the light on from the bar's off state and shows a percentage readout", async () => {
    const source = await tileSource();
    expect(source).toContain("if (!lightOn)");
    expect(source).toContain("deviceTileToggledValue(actionCapability, actionControl.value)");
    expect(source).toContain(
      "formatBrightnessPercent(brightnessControl.value, brightnessCapability.range)",
    );
    expect(source).toContain('"Off"');
  });

  it("offers colour controls only for a declared capability, never inert", async () => {
    const source = await tileSource();
    expect(source).toContain("writableColorTemperatureCapability(device.capabilities)");
    expect(source).toContain("writableColorCapability(device.capabilities)");
    expect(source).toContain("{colorTemperatureCapability && (");
    expect(source).toContain("{colorCapability && (");
  });

  it("sizes its toggle and value controls to the wall's touch target", async () => {
    const source = await tileSource();
    // The badge and each bar are sized from the wall's control metric, so every
    // affordance meets the kiosk-class target (specs/wall-display "Controls are
    // touch-sized"; design.md D4, D12).
    expect(source).toContain("const controlHeight = metrics?.control ?? 56");
    expect(source).toContain("width: controlHeight");
    expect(source).toContain("height: controlHeight");
    expect(wallTileMetrics("wall").control).toBeGreaterThanOrEqual(WALL_MIN_TOUCH_TARGET);
  });

  it("separates its adjacent controls by at least the wall's control floor", async () => {
    const source = await tileSource();
    // Hearth's space-3 (12px) is the wall stack's gap, ≥ the 8px control floor.
    expect(source).toContain("--hearth-space-3");
  });

  it("carries the group marker in its header for parity with the other archetypes", async () => {
    const source = await tileSource();
    const branch = lightBranch(source);
    expect(branch).toContain("{isGroup && <GroupMarker wall={wall} />}");
  });
});

describe("wall light card compact form (wall-zones-and-fit D4, 4.4)", () => {
  it("takes the compact form only for a wall light card whose full form does not fit", async () => {
    const source = await tileSource();
    // One gate decides both the compact composition and its inset, so the two
    // cannot disagree — and it requires the wall, the light archetype, and a form
    // the cell's own height resolved, so the dashboard (which passes no form) can
    // never reach it.
    expect(source).toContain("wallLightCompactCard(wall, wallCardForm, archetype)");
    expect(source).toContain('return wall && form === "compact" && archetype === "light"');
  });

  it("composes a form that fits the cell at every legal placement", async () => {
    // A light declaring brightness, colour temperature, and colour — the tallest
    // composition the archetype has — at each placement the critical finding
    // named, and at the wall's row-unit bounds. The selected form's own budget
    // must fit the cell, so no card can clip a declared control.
    const ROW_UNITS = [ROW_UNIT_MIN, ROW_UNIT_MAX];
    const PLACEMENTS = [2, 3, 4, 5, 6];

    for (const rows of PLACEMENTS) {
      for (const rowUnit of ROW_UNITS) {
        const form = formForCell({ rows, rowUnit });
        const cellPx = rows * rowUnit + (rows - 1) * WALL_GUTTER_MIN_PX;
        const budget = form === "compact" ? WALL_COMPACT_CARD_HEIGHT_PX : WALL_FULL_CARD_HEIGHT_PX;
        expect(budget, `${form} at ${rows} rows × ${rowUnit}px`).toBeLessThanOrEqual(cellPx);
      }
    }
  });

  it("keeps the compact form available at every legal device placement", () => {
    // The type's minimum is two rows, and a two-row cell holds the compact
    // budget at both row-unit bounds — so a compact card always has room, and a
    // card whose full form does not fit is never left without a form.
    for (const rowUnit of [ROW_UNIT_MIN, ROW_UNIT_MAX]) {
      expect(formForCell({ rows: 2, rowUnit })).toBe("compact");
      expect(2 * rowUnit + WALL_GUTTER_MIN_PX).toBeGreaterThanOrEqual(WALL_COMPACT_CARD_HEIGHT_PX);
    }
    // The finding's placements — a minimum-span cell and a three-row cell — are
    // far short of the full form's budget at every row unit.
    for (const rows of [2, 3]) {
      expect(formForCell({ rows, rowUnit: ROW_UNIT_MAX })).toBe("compact");
      expect(formForCell({ rows, rowUnit: ROW_UNIT_MIN })).toBe("compact");
    }
    // The full form is reached where its budget fits, and only there.
    expect(formForCell({ rows: 6, rowUnit: ROW_UNIT_MIN })).toBe("full");
    expect(formForCell({ rows: 6, rowUnit: ROW_UNIT_MAX })).toBe("full");
  });

  it("presents every declared control inside the minimum span", async () => {
    const source = await tileSource();
    const compact = compactBranch(source);

    // The on/off affordance, the brightness control, and a colour control only
    // for a capability the device declares — the same control set the full form
    // presents, in span-appropriate forms. No declared control is dropped.
    expect(compact).toContain("aria-pressed={lightOn}");
    expect(compact).toContain("brightnessCapability.property");
    expect(compact).toContain("{colorTemperatureCapability && (");
    expect(compact).toContain("colorTemperatureCapability.property");
    expect(compact).toContain("{colorCapability && (");
    expect(compact).toContain("colorCapability.property");
    // Every value control is a real, touch-sized range control — not an inert
    // swatch — and the colour ones read as swatches over their spectrum.
    expect(compact).toContain("<WallCompactValueControl");
    expect(compact).toContain("label={brightnessCapability.property}");
    expect(source).toContain('type="range"');
  });

  it("fits the compact composition in the height the row-unit floor is derived from", async () => {
    const source = await tileSource();
    const compact = compactBranch(source);

    // The composition is two touch-target rows — the on/off row and the control
    // segment row — plus the compact card's inset on each side: exactly
    // WALL_COMPACT_CARD_HEIGHT_PX, the budget `ROW_UNIT_MIN` is derived from, so
    // nothing overflows its cells at the type's minimum span.
    const control = wallTileMetrics("wall").control;
    expect(control).toBeGreaterThanOrEqual(WALL_MIN_TOUCH_TARGET);
    expect(2 * control + 2 * WALL_COMPACT_CARD_INSET_PX).toBe(WALL_COMPACT_CARD_HEIGHT_PX);

    // The two rows: the header row is fixed at the touch target, the control row
    // takes the rest, and no gap sits between them (the budget has none to give).
    expect(compact).toContain("minHeight: controlHeight");
    expect(compact).toContain("gap: 0");
    expect(compact).toContain('gap: "var(--hearth-space-2)"');
    // The compact inset is Hearth's smallest step (`p-2`), one control gap.
    expect(WALL_COMPACT_CARD_INSET_PX).toBe(WALL_MIN_CONTROL_GAP);
    expect(source).toContain("wallLightCompactCard(wall, wallCardForm, archetype)");
    expect(source).toContain('? "p-2"');
  });

  it("clips rather than overflowing, and surfaces a failure over the controls", async () => {
    const source = await tileSource();
    const compact = compactBranch(source);

    // A compact card never scrolls: its surface clips, and a rejected command is
    // surfaced as an overlay so the composition's geometry is unchanged.
    expect(source).not.toContain('overflowY: "auto"');
    expect(compact).toContain('role="alert"');
    expect(compact).toContain('position: "absolute"');
  });

  it("keeps the reading and the name on the card", async () => {
    const source = await tileSource();
    const compact = compactBranch(source);

    expect(compact).toContain("formatBrightnessPercent(");
    expect(compact).toContain('"Off"');
    expect(compact).toContain("shortDeviceName(deviceLabel)");
    expect(compact).toContain('wallReadoutFontSize(wallTier ?? "regular")');
    // The on/off affordance turns the light on from the brightness segment's off
    // state, exactly as the full form's bar does.
    expect(compact).toContain("if (!lightOn)");
    expect(compact).toContain("deviceTileToggledValue(actionCapability, actionControl.value)");
  });

  it("reaches the shared tile only from a wall widget, so the dashboard is unchanged", async () => {
    // The card form (and the tier with it) is the only input that selects the
    // compact form, and only `WallDeviceTile` passes either — the dashboard's
    // `<DeviceTile>` call sites pass none, so their rendering is untouched.
    const passers = await tierPassers();
    expect(passers.tiers).toEqual(["wall/widgets/WallDeviceTile.tsx"]);
    expect(passers.forms).toEqual(["wall/widgets/WallDeviceTile.tsx"]);
    // Both travel together: a wall order that forwarded one without the other
    // would fall back to the full composition and clip again.
    expect(passers.both).toEqual([]);
    expect(wallTileMetrics("default").control).toBe(32);
    expect(wallTileMetrics("default").padding).toBe("sm");
  });

  it("forwards both the tier and the form from every wall tile site", async () => {
    const tile = await readFile(join(APP_DIR, "wall/widgets/WallDeviceTile.tsx"), "utf8");

    // The shared wall tile requires both, so a missed forwarding site is a
    // compile error rather than a silent fallback.
    expect(tile).toContain("wallTier={props.tier}");
    expect(tile).toContain("wallCardForm={props.cardForm}");
    expect(tile).toContain("tier: WallWidgetTier;");
    expect(tile).toContain("cardForm: WallCardForm;");
  });
});
