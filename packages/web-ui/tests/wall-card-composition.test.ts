import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DEFAULT_WALL_CARD_BOX,
  resolveCardFormForBox,
  resolveDeviceCardComposition,
  WALL_CARD_COMPACT_HEIGHT_PX,
  WALL_CARD_CONTROL_MAX_WIDTH_PX,
  WALL_CARD_CONTROL_ROW_HEIGHT_PX,
  WALL_CARD_CONTROL_ROW_MIN_WIDTH_PX,
  WALL_CARD_FULL_HEIGHT_PX,
  WALL_CARD_INLINE_MIN_WIDTH_PX,
  WALL_CARD_MAX_ROW_CONTROLS,
  WALL_CARD_REGULAR_HEIGHT_PX,
  WALL_CARD_STATE_ROW_HEIGHT_PX,
  wallCardRootLayout,
} from "../src/app/wall/cards/card-composition.js";
import { WALL_CARD_METRICS } from "../src/app/wall/cards/metrics.js";
import { ROW_UNIT_MIN } from "../src/app/wall/grid.js";

/**
 * The per-card options and box-resolved composition: the pure resolver and the
 * root-layout helper it drives.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const CARDS = join(APP_DIR, "wall/cards");

const EVERY_CARD = [
  "LightCard.tsx",
  "CoverCard.tsx",
  "EntityCard.tsx",
  "NumberCard.tsx",
  "SelectCard.tsx",
  "FanCard.tsx",
  "ClimateCard.tsx",
  "LockCard.tsx",
] as const;

/** The cards whose actions row carries a value control beside the device's other controls. */
const SIBLING_CARDS = ["LightCard.tsx", "FanCard.tsx", "ClimateCard.tsx"] as const;

/** The cards whose actions row exists only where the device has controls. */
const CONTROL_CARDS = [
  "LightCard.tsx",
  "CoverCard.tsx",
  "NumberCard.tsx",
  "SelectCard.tsx",
  "FanCard.tsx",
  "ClimateCard.tsx",
  "LockCard.tsx",
] as const;

/** Removes block and line comments so prose is not mistaken for code. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function cardSource(name: string): Promise<string> {
  return stripComments(await readFile(join(CARDS, name), "utf8"));
}

/** The box a card is given, in CSS pixels. */
function box(widthPx: number, heightPx: number) {
  return { widthPx, heightPx };
}

describe("resolveCardFormForBox", () => {
  it("resolves the three compositions from the box's height", () => {
    expect(resolveCardFormForBox(WALL_CARD_COMPACT_HEIGHT_PX)).toBe("compact");
    expect(resolveCardFormForBox(WALL_CARD_REGULAR_HEIGHT_PX - 1)).toBe("compact");
    expect(resolveCardFormForBox(WALL_CARD_REGULAR_HEIGHT_PX)).toBe("regular");
    expect(resolveCardFormForBox(WALL_CARD_FULL_HEIGHT_PX - 1)).toBe("regular");
    expect(resolveCardFormForBox(WALL_CARD_FULL_HEIGHT_PX)).toBe("full");
  });

  it("composes a richer form into a taller box rather than inflating the smaller one", () => {
    const short = resolveCardFormForBox(WALL_CARD_COMPACT_HEIGHT_PX);
    const medium = resolveCardFormForBox(WALL_CARD_REGULAR_HEIGHT_PX);
    const tall = resolveCardFormForBox(WALL_CARD_FULL_HEIGHT_PX);

    // A taller box composes a *different* form, never the smaller one enlarged.
    expect(short).not.toBe(medium);
    expect(medium).not.toBe(tall);
    expect(short).not.toBe(tall);
  });

  it("resolves the slim one-row form below the compact composition's budget", () => {
    // A one-row device cell at the wall's row-unit floor is shorter than the smallest
    // stacked composition, so it composes the slim line instead.
    expect(WALL_CARD_COMPACT_HEIGHT_PX).toBeGreaterThan(ROW_UNIT_MIN);
    expect(resolveCardFormForBox(ROW_UNIT_MIN)).toBe("slim");
    expect(resolveCardFormForBox(WALL_CARD_COMPACT_HEIGHT_PX - 1)).toBe("slim");
    // The compact budget itself is where the slim form ends.
    expect(resolveCardFormForBox(WALL_CARD_COMPACT_HEIGHT_PX)).toBe("compact");
  });

  it("derives each threshold from the card's own ported rows", () => {
    const row = WALL_CARD_METRICS.controlHeight;
    const gap = WALL_CARD_METRICS.padding;

    // The state-item row is the card's inset plus the icon affordance plus the inset.
    expect(WALL_CARD_STATE_ROW_HEIGHT_PX).toBe(2 * gap + row);
    // A control row is the control and its trailing ported control spacing.
    expect(WALL_CARD_CONTROL_ROW_HEIGHT_PX).toBe(row + WALL_CARD_METRICS.controlSpacing);
    expect(WALL_CARD_COMPACT_HEIGHT_PX).toBe(
      WALL_CARD_STATE_ROW_HEIGHT_PX + WALL_CARD_CONTROL_ROW_HEIGHT_PX,
    );
    expect(WALL_CARD_REGULAR_HEIGHT_PX).toBe(
      WALL_CARD_COMPACT_HEIGHT_PX + WALL_CARD_CONTROL_ROW_HEIGHT_PX,
    );
    expect(WALL_CARD_FULL_HEIGHT_PX).toBe(
      WALL_CARD_REGULAR_HEIGHT_PX + WALL_CARD_CONTROL_ROW_HEIGHT_PX,
    );
  });

  it("derives the widest control row from the ported control geometry", () => {
    // The widest row a card draws at its minimum span is its controls, the ported control
    // spacing between them, and the row's own padding.
    expect(WALL_CARD_CONTROL_MAX_WIDTH_PX).toBe(WALL_CARD_METRICS.controlHeight);
    expect(WALL_CARD_MAX_ROW_CONTROLS).toBe(3);
    expect(WALL_CARD_CONTROL_ROW_MIN_WIDTH_PX).toBe(
      WALL_CARD_MAX_ROW_CONTROLS * WALL_CARD_CONTROL_MAX_WIDTH_PX +
        (WALL_CARD_MAX_ROW_CONTROLS - 1) * WALL_CARD_METRICS.controlSpacing +
        2 * WALL_CARD_METRICS.controlSpacing,
    );
    expect(WALL_CARD_CONTROL_ROW_MIN_WIDTH_PX).toBe(174);
  });
});

describe("resolveDeviceCardComposition", () => {
  const boxed = box(WALL_CARD_INLINE_MIN_WIDTH_PX, WALL_CARD_REGULAR_HEIGHT_PX);

  it("follows the card's own natural composition for the default layout", () => {
    const composition = resolveDeviceCardComposition({
      box: boxed,
      hasControls: true,
      active: true,
    });
    expect(composition.orientation).toBe("stacked");
    expect(composition.controls).toBe(true);
    expect(composition.siblings).toBe(true);
  });

  it("names the stacked composition for a vertical layout", () => {
    const composition = resolveDeviceCardComposition({
      box: boxed,
      layout: "vertical",
      hasControls: true,
      active: true,
    });
    expect(composition.orientation).toBe("stacked");
  });

  it("composes the inline row for a horizontal layout in a wide enough box", () => {
    const composition = resolveDeviceCardComposition({
      box: boxed,
      layout: "horizontal",
      hasControls: true,
      active: true,
    });
    expect(composition.orientation).toBe("inline");
  });

  it("keeps the stacked composition for a horizontal layout in a narrow box", () => {
    const composition = resolveDeviceCardComposition({
      box: box(WALL_CARD_INLINE_MIN_WIDTH_PX - 1, WALL_CARD_REGULAR_HEIGHT_PX),
      layout: "horizontal",
      hasControls: true,
      active: true,
    });
    expect(composition.orientation).toBe("stacked");
  });

  it("hides the controls of an inactive device when they are collapsible", () => {
    const shown = resolveDeviceCardComposition({
      box: boxed,
      collapsibleControls: true,
      hasControls: true,
      active: true,
    });
    const hidden = resolveDeviceCardComposition({
      box: boxed,
      collapsibleControls: true,
      hasControls: true,
      active: false,
    });
    expect(shown.controls).toBe(true);
    expect(hidden.controls).toBe(false);
  });

  it("keeps the non-control composition while the controls are hidden", () => {
    const hidden = resolveDeviceCardComposition({
      box: boxed,
      layout: "horizontal",
      collapsibleControls: true,
      hasControls: true,
      active: false,
    });
    const withoutControls = resolveDeviceCardComposition({
      box: boxed,
      layout: "horizontal",
      hasControls: false,
      active: false,
    });

    // Hiding the controls changes nothing but the actions row: the form, the orientation,
    // and the sibling rule are the composition of the non-control content.
    expect(hidden.controls).toBe(false);
    expect(hidden.form).toBe(withoutControls.form);
    expect(hidden.orientation).toBe(withoutControls.orientation);
    expect(hidden.siblings).toBe(withoutControls.siblings);
  });

  it("resolves the same composition for the same box and configuration", () => {
    const input = {
      box: box(WALL_CARD_INLINE_MIN_WIDTH_PX, WALL_CARD_FULL_HEIGHT_PX),
      layout: "horizontal" as const,
      hasControls: true,
      active: true,
    };
    expect(resolveDeviceCardComposition(input)).toEqual(resolveDeviceCardComposition(input));
  });

  it("composes the active control alone in a compact box", () => {
    const composition = resolveDeviceCardComposition({
      box: box(WALL_CARD_INLINE_MIN_WIDTH_PX, WALL_CARD_COMPACT_HEIGHT_PX),
      hasControls: true,
      active: true,
    });
    expect(composition.form).toBe("compact");
    expect(composition.siblings).toBe(false);
  });

  it("draws no sibling controls in a slim box — the slim line has no actions row", () => {
    const composition = resolveDeviceCardComposition({
      box: box(WALL_CARD_INLINE_MIN_WIDTH_PX, WALL_CARD_COMPACT_HEIGHT_PX - 1),
      hasControls: false,
      active: true,
    });
    expect(composition.form).toBe("slim");
    expect(composition.siblings).toBe(false);
  });

  it("defaults an unwired card to the box of its fullest composition", () => {
    expect(resolveCardFormForBox(DEFAULT_WALL_CARD_BOX.heightPx)).toBe("full");
    expect(DEFAULT_WALL_CARD_BOX.widthPx).toBeGreaterThanOrEqual(WALL_CARD_INLINE_MIN_WIDTH_PX);
  });
});

describe("wallCardRootLayout", () => {
  it("stacks the state item over the actions row in the stacked composition", () => {
    const layout = wallCardRootLayout({
      form: "regular",
      orientation: "stacked",
      siblings: true,
      controls: true,
    });
    expect(layout.display).toBe("flex");
    expect(layout.flexDirection).toBe("column");
  });

  it("lays a composed card out as one row, giving the state item the whole box while its controls are hidden", () => {
    const composed = wallCardRootLayout({
      form: "regular",
      orientation: "inline",
      siblings: true,
      controls: true,
    });
    const hidden = wallCardRootLayout({
      form: "regular",
      orientation: "inline",
      siblings: true,
      controls: false,
    });

    expect(composed.display).toBe("grid");
    expect(composed.gridTemplateColumns).toBe("minmax(0, 1fr) minmax(0, 1fr)");
    // One control surface, one column: hiding the controls does not reflow the card.
    expect(hidden.display).toBe("grid");
    expect(hidden.gridTemplateColumns).toBe("minmax(0, 1fr)");
  });
});

describe("every card resolves its own options and box", () => {
  for (const name of EVERY_CARD) {
    it(`${name} resolves its composition from the box and its config`, async () => {
      const source = await cardSource(name);
      expect(source).toContain("resolveDeviceCardComposition(");
      expect(source).toContain("box ?? DEFAULT_WALL_CARD_BOX");
      expect(source).toContain("config?.layout");
      expect(source).toContain("config?.collapsible_controls");
      expect(source).toContain("wallCardRootLayout(composition)");
    });
  }

  for (const name of CONTROL_CARDS) {
    it(`${name} presents its actions row only while its controls are shown`, async () => {
      const source = await cardSource(name);
      expect(source).toContain("composition.controls");
    });
  }

  for (const name of SIBLING_CARDS) {
    it(`${name} composes the other controls beside the active one from the box`, async () => {
      const source = await cardSource(name);
      expect(source).toContain("composition.siblings");
    });
  }

  for (const name of EVERY_CARD) {
    it(`${name} branches to the shared slim line at a slim box`, async () => {
      const source = await cardSource(name);
      // The line is composed once, in the anatomy; each card only branches to it.
      expect(source).toContain("WallCardSlim");
      expect(source).toContain('composition.form === "slim"');
    });
  }
});
