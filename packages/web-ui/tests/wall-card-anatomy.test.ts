import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sliderFraction } from "../src/app/wall/cards/card-anatomy.js";
import {
  resolveEnumControlForm,
  WALL_CARD_CONTROL_MAX_WIDTH_PX,
  WALL_CARD_ENUM_SIBLING_RESERVE_PX,
  wallCardEnumRowWidthPx,
} from "../src/app/wall/cards/card-composition.js";
import { WALL_CARD_METRICS } from "../src/app/wall/cards/metrics.js";
import { WALL_MIN_CONTROL_GAP, WALL_MIN_TOUCH_TARGET } from "../src/app/wall/registry.js";

/**
 * The shared card anatomy (design.md D1, D2; specs/wall-display "Wall Device
 * Presentation" — "A card presents the ported anatomy" — and "Touch Operation").
 * There is no DOM harness, so the geometry is covered through the pure
 * {@link sliderFraction} and the ported metrics, and the components are asserted
 * structurally against the tokens they must draw — the same style as
 * `wall-card-vocab.test.ts`.
 *
 * The ported control height is 42 px (design.md D2, D4); the spec's "Touch
 * Operation" is modified to that value. That value is also the wall's shared
 * `WALL_MIN_TOUCH_TARGET` (`wall/registry.ts`), so this test asserts the card's
 * own ported control height equals the shared constant rather than a repeated
 * literal — the card declares the value it is required to meet.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const ANATOMY = join(APP_DIR, "wall/cards/card-anatomy.tsx");

/** The spec's modified minimum touch target: the ported card system's control height. */
const PORTED_TOUCH_TARGET_PX = 42;

/** Removes block and line comments so prose is not mistaken for code. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function source(path: string): Promise<string> {
  return stripComments(await readFile(path, "utf8"));
}

describe("sliderFraction", () => {
  it("maps a value across its range, clamped to [0, 1]", () => {
    expect(sliderFraction(0, 0, 100)).toBe(0);
    expect(sliderFraction(50, 0, 100)).toBe(0.5);
    expect(sliderFraction(100, 0, 100)).toBe(1);
    expect(sliderFraction(-10, 0, 100)).toBe(0);
    expect(sliderFraction(150, 0, 100)).toBe(1);
    expect(sliderFraction(20, 10, 30)).toBe(0.5);
  });

  it("reads an empty track rather than dividing by a collapsed range", () => {
    expect(sliderFraction(5, 10, 10)).toBe(0);
    expect(sliderFraction(5, 10, 0)).toBe(0);
  });
});

describe("the ported touch target", () => {
  it("meets the wall's shared minimum touch target", () => {
    expect(WALL_CARD_METRICS.controlHeight).toBe(WALL_MIN_TOUCH_TARGET);
  });

  it("sizes the slider to the same control height", () => {
    expect(WALL_CARD_METRICS.sliderHeight).toBeGreaterThanOrEqual(PORTED_TOUCH_TARGET_PX);
    expect(WALL_CARD_METRICS.sliderHeight).toBe(PORTED_TOUCH_TARGET_PX);
  });

  it("sizes the icon affordance's control to the ported control height", async () => {
    const anatomy = await source(ANATOMY);

    // The visible shape is the 36 px icon size; the control around it is the touch target.
    expect(anatomy).toContain("minWidth: WALL_CARD_METRICS.controlHeight");
    expect(anatomy).toContain("minHeight: WALL_CARD_METRICS.controlHeight");
    expect(anatomy).toContain("width: WALL_CARD_ICON_SIZE");
  });
});

describe("the adjacent-control separation", () => {
  it("keeps at least the wall's floor between controls", () => {
    expect(WALL_CARD_METRICS.controlSpacing).toBeGreaterThanOrEqual(WALL_MIN_CONTROL_GAP);
    expect(WALL_CARD_METRICS.controlSpacing).toBe(12);
  });

  it("spaces the actions row by the ported control spacing", async () => {
    const anatomy = await source(ANATOMY);

    expect(anatomy).toMatch(/gap: `\$\{WALL_CARD_METRICS\.controlSpacing\}px`/);
  });
});

describe("the card anatomy components", () => {
  it("exposes the icon, text, actions, and slider parts", async () => {
    const anatomy = await source(ANATOMY);

    for (const part of ["WallCardIcon", "WallCardText", "WallCardActions", "WallCardSlider"]) {
      expect(anatomy).toContain(`export function ${part}`);
    }
  });

  it("bounds an enumerated option's label so its row is a finite width", async () => {
    // The option control is drawn at `WALL_CARD_CONTROL_MAX_WIDTH_PX` (the ported
    // control height) with an ellipsis, and it never shrinks below that bound: an
    // enumerated control that declares more values than its row holds composes a
    // single affordance instead, so an option is never squeezed below the wall's
    // touch target and an option row can never overflow the card (specs/wall-display
    // "A card's content fits its span", "Touch Operation").
    const anatomy = await source(ANATOMY);

    expect(anatomy).toContain("export function WallCardOption");
    expect(anatomy).toContain("flexShrink: 0");
    expect(anatomy).toContain("flexBasis: WALL_CARD_CONTROL_MAX_WIDTH_PX");
    expect(anatomy).toContain("minWidth: WALL_CARD_CONTROL_MAX_WIDTH_PX");
    expect(anatomy).toContain("maxWidth: WALL_CARD_CONTROL_MAX_WIDTH_PX");
    expect(anatomy).toContain('textOverflow: "ellipsis"');
    expect(anatomy).not.toContain("flexShrink: 1");
  });

  it("pads the actions row by the ported control spacing on each side", async () => {
    // The row's own horizontal padding is what `wall/grid.ts`'s minimum column
    // span derivation accounts for, so it is asserted here against the metric.
    const anatomy = await source(ANATOMY);

    expect(anatomy).toMatch(/padding: `\$\{WALL_CARD_METRICS\.controlSpacing\}px`/);
  });

  it("draws the ported slider as the wall's own range chrome", async () => {
    const anatomy = await source(ANATOMY);

    expect(anatomy).toContain('className="hearth-card-slider"');
    expect(anatomy).toContain('type="range"');
    expect(anatomy).toContain("WALL_CARD_METRICS.sliderRadius");
    expect(anatomy).toContain("WALL_CARD_METRICS.sliderHeight");
    expect(anatomy).toContain("sliderFraction(value, min, max)");
  });

  it("draws only Hearth tokens and the ported colour helpers, never a literal colour", async () => {
    const anatomy = await source(ANATOMY);

    expect(anatomy).toContain("var(--hearth-");
    expect(anatomy).toContain("toCssColorWithAlpha");
    expect(anatomy).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(anatomy).not.toMatch(/\brgba?\(/);
  });
});

describe("resolveEnumControlForm", () => {
  /** A minimum-span device box: three columns at the wall's 50 px row-unit floor. */
  const BOX = { widthPx: 3 * 50, heightPx: 300 };

  it("draws options while every permitted value fits the row at the touch target", () => {
    expect(resolveEnumControlForm({ box: BOX, values: ["a", "b"] })).toBe("segmented");
    // Three options need 3 × 42 + 2 × 12 = 150 px, more than the 126 px a
    // minimum-span row leaves (the box minus the row's own padding).
    expect(resolveEnumControlForm({ box: BOX, values: ["a", "b", "c"] })).toBe("single");
  });

  it("falls back to one affordance for a six-value enum beside a value control", () => {
    const values = ["off", "heat", "cool", "auto", "dry", "fan_only"];
    for (const widthPx of [150, 224, 336]) {
      expect(
        resolveEnumControlForm({
          box: { widthPx, heightPx: 300 },
          values,
          reservedPx: WALL_CARD_ENUM_SIBLING_RESERVE_PX,
        }),
        `${widthPx}px box`,
      ).toBe("single");
    }
  });

  it("reserves a sibling value control's width so the control keeps the touch target", () => {
    const values = ["a", "b", "c"];
    // Three options fit a 174 px row alone (each at the control width)…
    const row = { widthPx: 3 * WALL_CARD_CONTROL_MAX_WIDTH_PX + 2 * 12 + 2 * 12, heightPx: 300 };
    expect(resolveEnumControlForm({ box: row, values })).toBe("segmented");
    // …but not beside a value control, whose own width the row reserves.
    expect(
      resolveEnumControlForm({ box: row, values, reservedPx: WALL_CARD_ENUM_SIBLING_RESERVE_PX }),
    ).toBe("single");
  });

  it("offers no segmented row for an empty value set", () => {
    expect(resolveEnumControlForm({ box: BOX, values: [] })).toBe("single");
  });

  it("never segments into an option below the wall's touch target", () => {
    // A segmented row is chosen only when every option, each at the control width,
    // fits the row — so the per-option width is always at least the target.
    const wide = { widthPx: 336, heightPx: 300 };
    const values = ["a", "b", "c", "d", "e"];
    expect(resolveEnumControlForm({ box: wide, values })).toBe("segmented");

    const availablePx = wide.widthPx - 2 * WALL_CARD_METRICS.controlSpacing;
    expect(wallCardEnumRowWidthPx(values.length)).toBeLessThanOrEqual(availablePx);
    const perOptionPx = (availablePx - (values.length - 1) * 12) / values.length;
    expect(perOptionPx).toBeGreaterThanOrEqual(WALL_CARD_CONTROL_MAX_WIDTH_PX);
  });
});

describe("the enumerated-control affordance", () => {
  it("exposes the segmented option, the single dropdown, and the chooser", async () => {
    const anatomy = await source(ANATOMY);

    for (const part of ["WallCardOption", "WallCardDropdown", "WallCardEnumControl"]) {
      expect(anatomy).toContain(`export function ${part}`);
    }
  });

  it("chooses its form from the box and keeps the touch target either way", async () => {
    const anatomy = await source(ANATOMY);

    expect(anatomy).toContain("resolveEnumControlForm(");
    // The single affordance is a native select listing every value, at the control
    // height and no narrower than the touch target.
    expect(anatomy).toContain("<select");
    expect(anatomy).toContain('className="hearth-card-select"');
    expect(anatomy).toContain("minWidth: WALL_CARD_METRICS.controlHeight");
    expect(anatomy).toContain("values.map(");
  });
});
