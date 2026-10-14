import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Capability } from "@ts-ha/shared";
import { rankDeviceTile } from "../src/app/lib/capability-ranking.js";
import { cardArchetype } from "../src/app/lib/card-archetype.js";
import { deviceTileObservationText, wallReadoutFontSize } from "../src/app/wall/scale.js";
import { WALL_BAND_FONT_SIZE } from "../src/app/wall/type-ramp.js";

/**
 * Structural assertions for the wall card archetypes (tasks 3.1, 3.2, 3.4).
 * There is no DOM harness here, so the render decisions are asserted against
 * the shared tile's source — the same style as `wall-read-only.test.ts` — while
 * the pure decisions (which control set, which surface, the `%` formatting) are
 * covered by `card-archetype.test.ts`.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const TILE = join(APP_DIR, "components/DeviceTile.tsx");

/** Removes block and line comments so prose is not mistaken for rendered text. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function tileSource(): Promise<string> {
  return stripComments(await readFile(TILE, "utf8"));
}

/**
 * Isolates the readout branch of the tile source — from the archetype check to
 * the next `} else if (lightCard` branch — so its assertions are readout-
 * specific and never match the light card's markup.
 */
function readoutBranch(source: string): string {
  const start = source.indexOf('archetype === "readout"');
  return source.slice(start, source.indexOf("} else if (lightCard", start));
}

/**
 * Isolates the unavailable variant — the shared Hearth pill and the
 * `UnavailableTile` function — so the wall/dashboard split is asserted in
 * isolation, ending before the `DeviceTile` dispatcher.
 */
function unavailableTileSource(source: string): string {
  const start = source.indexOf("function WallUnavailablePill");
  return source.slice(start, source.indexOf("export function DeviceTile", start));
}

/**
 * Isolates the wall's plain-control branch — from `} else if (actionCapability
 * && wall) {` to the dashboard's `} else if (actionCapability) {` — so the
 * control-selection assertions never match the dashboard's shared branch.
 */
function wallControlBranch(source: string): string {
  const start = source.indexOf("} else if (actionCapability && wall) {");
  return source.slice(start, source.indexOf("} else if (actionCapability) {", start));
}

describe("light card rendering", () => {
  it("presents a device-icon on/off affordance, a percentage readout, and a full-width brightness bar", async () => {
    const source = await tileSource();
    expect(source).toContain('archetype === "light"');
    expect(source).toContain("<Lightbulb");
    expect(source).toContain("aria-pressed={lightOn}");
    expect(source).toContain('type="range"');
    expect(source).toContain("aria-label={brightnessCapability.property}");
    expect(source).toContain("formatBrightnessPercent(brightnessControl.value");
  });

  it("turns the light on from its on/off affordance and its brightness bar's off state", async () => {
    const source = await tileSource();
    // The icon affordance toggles the light through the shared optimistic hook.
    expect(source).toContain("togglePrimary()");
    // Activating the bar while off also commands the light on.
    expect(source).toContain("if (!lightOn)");
    expect(source).toContain("deviceTileToggledValue(actionCapability, actionControl.value)");
    expect(source).toContain('"Off"');
  });

  it("offers a colour control only for a capability the device declares", async () => {
    const source = await tileSource();
    expect(source).toContain("writableColorTemperatureCapability(device.capabilities)");
    expect(source).toContain("writableColorCapability(device.capabilities)");
    expect(source).toContain("{colorTemperatureCapability && (");
    expect(source).toContain("{colorCapability && (");
  });

  it("drives the toggle and the brightness through independent optimistic channels", async () => {
    const source = await tileSource();
    expect(source).toContain("brightnessControl.setValue(next)");
    expect(source).toContain("actionControl.setValue(");
  });

  it("separates its adjacent controls by at least the wall's control floor", async () => {
    const source = await tileSource();
    // The wall stack's Hearth gap sits between the badge/controls and the bar.
    expect(source).toContain("--hearth-space-3");
  });
});

describe("readout card rendering", () => {
  it("renders a chrome-less dominant value with a leading glyph and a quiet label", async () => {
    const source = await tileSource();
    expect(source).toContain('archetype === "readout"');
    expect(source).toContain("<ReadoutGlyph");
    expect(source).toContain("wallReadoutFontSize");
    expect(source).toContain("WALL_BODY_FONT_SIZE");
    expect(source).toContain("humanizeDeviceName(device.displayName)");
  });

  it("draws no surface for a readout through the pure surface decision", async () => {
    const source = await tileSource();
    expect(source).toContain("cardDrawsNoSurface(archetype, wall, contained === true)");
  });

  it("keeps the readout's value and unit as one non-breaking unit", async () => {
    const source = await tileSource();
    const branch = readoutBranch(source);

    expect(branch).toContain('whiteSpace: "nowrap"');
  });

  it("chooses the reading's tier by the span the card was placed at", async () => {
    const source = await tileSource();
    const branch = readoutBranch(source);

    // A readout at or near its minimum span is a grouped readout: it sits on the
    // band tier, below the metric tier, so a group of readouts does not compete
    // with a hero and the value keeps its unit on one line (design.md D3, D6).
    expect(branch).toContain("wallReadoutFontSize(tier)");
    expect(wallReadoutFontSize("compact")).toBe(WALL_BAND_FONT_SIZE);
    expect(wallReadoutFontSize("roomy")).not.toBe(WALL_BAND_FONT_SIZE);
  });

  it("presents a shortened name rather than a shared ellipsized prefix", async () => {
    const source = await tileSource();
    const branch = readoutBranch(source);

    expect(branch).toContain("shortDeviceName(deviceLabel)");
    // The full name stays available to the accessible name and the tooltip.
    expect(branch).toContain("title={deviceLabel}");
  });

  it("carries the Hidden badge and the group marker into the chrome-less layout", async () => {
    const source = await tileSource();
    const branch = readoutBranch(source);
    expect(branch).toContain("device.hidden");
    expect(branch).toContain("<GroupMarker");
  });

  it("shortens the wall card's name while the dashboard label is unchanged", async () => {
    const source = await tileSource();

    // The wall shortens a name its card cannot show in full rather than
    // ellipsizing it to a prefix several cards share; the dashboard keeps the
    // full label (specs/wall-display "A name is shortened, not truncated").
    expect(source).toContain("wall ? shortDeviceName(deviceLabel) : deviceLabel");
    expect(source).toContain("title={deviceLabel}");
  });

  it("offers no navigation affordance in the chrome-less readout branch", async () => {
    const source = await tileSource();
    const branch = readoutBranch(source);
    expect(branch).not.toContain("openDetail");
    expect(branch).not.toContain("<button");
    expect(branch).not.toContain("onClick");
    expect(branch).not.toContain('role="button"');
    expect(branch).not.toContain("Details");
  });
});

describe("observation indicator", () => {
  it("demotes the wall observation to a glyph-only indicator, keeping the label accessible", async () => {
    const source = await tileSource();
    expect(source).toContain("aria-label={observation.label}");
    expect(source).toContain("title={observation.label}");
    // The wall's glyph-only branch renders no child label text.
    expect(source).toContain('role="img"');
  });

  it("keeps the visible observation label — including the polled age — on the dashboard", async () => {
    const source = await tileSource();
    const allUses = [...source.matchAll(/observation\.label/g)].length;
    const attributeUses = [...source.matchAll(/\w[\w-]*=\{observation\.label\}/g)].length;
    // At least one use is a child-text render (the visible label), not an attribute.
    expect(allUses).toBeGreaterThan(attributeUses);
  });

  it("gates the visible label behind the size-keyed presentation decision", async () => {
    const source = await tileSource();
    expect(source).toContain("deviceTileObservationText(size)");
    expect(source).toContain("showLabel");
    expect(source).toContain("{showLabel && (");
  });

  it("keeps the observation glyph shape and token as the non-color channel", async () => {
    const source = await tileSource();
    expect(source).toContain("observation.icon");
    expect(source).toContain("observation.token");
  });

  it("prints no literal live/polled text on the card face", async () => {
    const source = await tileSource();
    expect(source).not.toContain("polled");
    expect(source).not.toMatch(/["'`]live["'`]/);
  });
});

describe("deviceTileObservationText", () => {
  it("demotes the observation label to non-textual on the wall only", () => {
    expect(deviceTileObservationText("wall")).toBe(false);
    expect(deviceTileObservationText("default")).toBe(true);
    expect(deviceTileObservationText()).toBe(true);
  });
});

describe("wall card chrome (design D1, D7)", () => {
  it("frames the wall's toggle, cover, and default archetypes with Hearth chrome", async () => {
    const source = await tileSource();
    // The wall's remaining archetypes take a Hearth branch rather than the
    // dashboard's Lumen `<Stack>` fallback.
    expect(source).toContain("} else if (wall) {");
    // A Hearth card surface: its own background, hairline, and radius.
    expect(source).toContain('background: "var(--hearth-surface)"');
    expect(source).toContain("var(--hearth-hairline)");
    expect(source).toContain('borderRadius: "var(--hearth-radius-md)"');
    // The wall branch uses the Hearth stack rhythm, not the Lumen `<Stack>`.
    expect(source).toContain("style={WALL_STACK_STYLE}");
  });

  it("draws the wall's on/off, value, and hidden indicators with Hearth, not the Lumen primitive", async () => {
    const source = await tileSource();
    expect(source).toContain("function WallOnOffAffordance");
    expect(source).toContain("function WallValueControl");
    expect(source).toContain("function HiddenMarker");
    // The observation indicator is mapped onto Hearth's own state tokens.
    expect(source).toContain("hearthObservationToken");
    expect(source).toContain("--hearth-on");
    // The wall value control is a Hearth range/select, not the Lumen widget.
    expect(source).toContain('accentColor: "var(--hearth-accent)"');
  });

  it("keeps the dashboard rendering on Lumen", async () => {
    const source = await tileSource();
    // The dashboard still composes the Lumen card, the Lumen control primitive,
    // its on/off chip, and the Lumen hidden badge.
    expect(source).toContain("<Card");
    expect(source).toContain("<CapabilityControl");
    expect(source).toContain("<OnOffChip");
    expect(source).toContain('<Badge tone="neutral">Hidden</Badge>');
  });
});

describe("wall value-primary control selection (design D7, D9, D16)", () => {
  const rw = { readable: true, writable: true };
  const ro = { readable: true, writable: false };

  /**
   * A value-primary device that also reports a readable on/off: the on/off is
   * readable but not writable, so the ranked primary is the writable `speed`
   * value and the card is a `default` (design.md D7, D9, D16).
   */
  function valuePrimaryWithReadableOnOff(): Capability[] {
    return [
      { kind: "switch", property: "on", access: ro, valueType: "boolean" },
      { kind: "fan", property: "speed", access: rw, valueType: "numeric" },
    ];
  }

  it("ranks the value primary and keeps the readable on/off as a non-primary state", () => {
    const capabilities = valuePrimaryWithReadableOnOff();
    const ranking = rankDeviceTile(capabilities);
    expect(ranking.action?.kind).toBe("numeric");
    expect(ranking.action?.capability.property).toBe("speed");
    expect(cardArchetype(ranking, capabilities)).toBe("default");
  });

  it("selects the wall control from the ranked primary action, not from onOff", async () => {
    const source = await tileSource();
    const branch = wallControlBranch(source);
    // The actuator is gated on the ranked on/off primary, never on `onOff`
    // alone: the buggy form rendered it for a value primary that reports a
    // readable on/off, wiring a boolean command to a non-boolean property.
    expect(branch).toContain('ranking.action?.kind === "on_off"');
    expect(branch).not.toContain("controls = onOff ?");
  });

  it("renders the value control — not the on/off actuator — for a value primary that reports on/off", async () => {
    const source = await tileSource();
    const parts = wallControlBranch(source).split(") : (");
    // Only the ranked on/off (`toggle`) branch wires the actuator.
    expect(parts[0]).toContain("<WallOnOffAffordance");
    expect(parts[0]).toContain("onToggle={togglePrimary}");
    // The value branch draws its embedded value control and never the actuator,
    // so no boolean is commanded to the value property.
    expect(parts[1]).toContain("<WallValueControl");
    expect(parts[1]).toContain("capability={actionCapability}");
    expect(parts[1]).toContain("onChange={actionControl.setValue}");
    expect(parts[1]).not.toContain("<WallOnOffAffordance");
    expect(parts[1]).not.toContain("togglePrimary");
  });

  it("keeps the readable on/off visible as a non-interactive affordance in the value branch", async () => {
    const source = await tileSource();
    const valuePart = wallControlBranch(source).split(") : (")[1];
    expect(valuePart).toContain("{onOff && <WallOnOffState state={onOff} />}");
    // Non-colour encoding: the shared glyph shape and the label, drawn without a
    // click handler — the wall's counterpart of the dashboard's `OnOffChip`.
    const component = source.slice(
      source.indexOf("function WallOnOffState"),
      source.indexOf("function WallValueControl"),
    );
    expect(component).toContain("state.icon");
    expect(component).toContain("state.label");
    expect(component).not.toContain("onClick");
    expect(component).not.toContain("<button");
  });
});

describe("unavailable card rendering (design D1, D7)", () => {
  it("draws the wall's unavailable variant with Hearth chrome and tokens", async () => {
    const source = await tileSource();
    const branch = unavailableTileSource(source);
    // A Hearth card surface matching the wall's other archetypes: its own
    // background, hairline, and radius — never the Lumen `<Card>`.
    expect(branch).toContain('background: "var(--hearth-surface)"');
    expect(branch).toContain("1px solid var(--hearth-hairline)");
    expect(branch).toContain('borderRadius: "var(--hearth-radius-md)"');
    // Hearth text tokens for the identifier and the unplug state.
    expect(branch).toContain('color: "var(--hearth-text-muted)"');
    expect(branch).toContain('color: "var(--hearth-danger)"');
    // A Hearth pill replaces the Lumen badge on the wall.
    expect(branch).toContain("function WallUnavailablePill");
    expect(branch).toContain("var(--hearth-radius-pill)");
  });

  it("keeps the dashboard's unavailable variant on the Lumen card and badge", async () => {
    const source = await tileSource();
    const branch = unavailableTileSource(source);
    // The dashboard still composes the Lumen card, the Lumen badge, and their
    // classes — untouched by the wall's Hearth branch.
    expect(branch).toContain("<Card");
    expect(branch).toContain('elevation="flat"');
    expect(branch).toContain('<Badge tone="neutral">Unavailable</Badge>');
    expect(branch).toContain("text-muted");
    expect(branch).toContain("text-danger");
  });

  it("preserves the qualified id, action slot, unplug glyph, and chrome-less contained path", async () => {
    const source = await tileSource();
    const branch = unavailableTileSource(source);
    expect(branch).toContain("{qualifiedId}");
    expect(branch).toContain("<ActionSlot action={action} />");
    expect(branch).toContain("<Unplug");
    // The `contained` early return draws no surface of its own.
    expect(branch).toContain('return <div className={cn("opacity-60", padClass)}>{inner}</div>;');
  });

  it("keeps the accessible Unavailable label on both variants", async () => {
    const source = await tileSource();
    const branch = unavailableTileSource(source);
    // The wall pill renders the label as its text; the dashboard badge keeps its own.
    expect(branch).toMatch(/>\s*Unavailable\s*<\/span>/);
    expect(branch).toContain('<Badge tone="neutral">Unavailable</Badge>');
  });
});
