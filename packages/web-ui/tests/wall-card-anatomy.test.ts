import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sliderFraction } from "../src/app/wall/cards/card-anatomy.js";
import {
  resolveEnumControlForm,
  WALL_CARD_CONTROL_MAX_WIDTH_PX,
  WALL_CARD_CONTROL_ROW_MIN_WIDTH_PX,
  WALL_CARD_ENUM_SIBLING_RESERVE_PX,
  wallCardEnumRowWidthPx,
} from "../src/app/wall/cards/card-composition.js";
import { WALL_CARD_METRICS } from "../src/app/wall/cards/metrics.js";
import { WALL_MIN_DEVICE_COLUMNS } from "../src/app/wall/grid.js";
import { WALL_MIN_CONTROL_GAP, WALL_MIN_TOUCH_TARGET } from "../src/app/wall/registry.js";

/**
 * The wall's card anatomy: the geometry through the pure {@link sliderFraction}
 * and the ported metrics; the components asserted structurally.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const ANATOMY = join(APP_DIR, "wall/cards/card-anatomy.tsx");

/** The spec's modified minimum touch target: the ported card system's control height. */
const PORTED_TOUCH_TARGET_PX = 42;

/**
 * A metric written as a literal rather than drawn from the ported table. A `0`
 * reset and a hairline's `1px` border are not treated as metrics.
 */
const LITERAL_METRIC =
  /(?:minWidth|maxWidth|minHeight|maxHeight|width|height|padding|paddingTop|gap|borderRadius|fontSize|lineHeight|letterSpacing):\s*(?!0(?:px)?\b)\d/;

/** The widget parts the ported module declares for everything that is not a device card. */
const WIDGET_VOCABULARY = [
  "WallCardLabel",
  "WallCardReading",
  "WallCardStateItem",
  "WallCardControl",
  "WallCardRoute",
  "WallCardMessage",
] as const;

/**
 * The source of one function declaration in the anatomy module, so a part's own
 * style can be asserted rather than the module's.
 */
function functionSource(anatomy: string, name: string): string {
  const start = anatomy.indexOf(`function ${name}(`);
  expect(start, `${name} is defined`).toBeGreaterThanOrEqual(0);
  const next = anatomy.slice(start + 1).search(/\n(?:export )?function /);
  return anatomy.slice(start, next === -1 ? anatomy.length : start + 1 + next);
}

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
    // The option control is drawn at `WALL_CARD_CONTROL_MAX_WIDTH_PX` with an ellipsis,
    // and it never shrinks below that bound.
    const anatomy = await source(ANATOMY);

    expect(anatomy).toContain("export function WallCardOption");
    expect(anatomy).toContain("flexShrink: 0");
    expect(anatomy).toContain("flexBasis: WALL_CARD_CONTROL_MAX_WIDTH_PX");
    expect(anatomy).toContain("minWidth: WALL_CARD_CONTROL_MAX_WIDTH_PX");
    expect(anatomy).toContain("maxWidth: WALL_CARD_CONTROL_MAX_WIDTH_PX");
    expect(anatomy).toContain('textOverflow: "ellipsis"');
    expect(anatomy).not.toContain("flexShrink: 1");
  });

  it("insets the actions row by the ported control spacing, and lets a caller drop it", async () => {
    // A device card keeps the row's inset; the page-control row drops it, because the
    // page plan reserves that row at the ported control height alone.
    const anatomy = await source(ANATOMY);
    const actions = functionSource(anatomy, "WallCardActions");

    expect(actions).toContain("inset = true");
    expect(actions).toMatch(/padding: inset \? `\$\{WALL_CARD_METRICS\.controlSpacing\}px` : 0/);
    expect(actions).toMatch(/gap: `\$\{WALL_CARD_METRICS\.controlSpacing\}px`/);
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

describe("the actions row distribution", () => {
  it("spreads a row of fixed controls across the card rather than bunching or centring it", async () => {
    const anatomy = await source(ANATOMY);
    const actions = functionSource(anatomy, "WallCardActions");

    // The row declares its own mode; the component never inspects its children.
    expect(actions).toContain("distribution: WallCardActionsDistribution");
    expect(actions).toContain('distribution === "flexible" ? "center" : "space-between"');
    // A fixed row spreads to both edges, so it fills the card without floating centred.
    expect(actions).toContain('"space-between"');
  });

  it("keeps a flexible control flexible and centres the fixed controls beside it", async () => {
    const anatomy = await source(ANATOMY);
    const actions = functionSource(anatomy, "WallCardActions");
    const slider = functionSource(anatomy, "WallCardSlider");

    // The row centres instead of stretching, and never resizes a control itself, so a
    // fixed icon control is not grown to fill and the slider is not squeezed.
    expect(actions).toContain('"center"');
    expect(actions).not.toContain("flexGrow");
    expect(actions).not.toContain("flexBasis");
    // The flexible control keeps the grow it declares for itself.
    expect(slider).toContain('flex: "1 1 0"');
  });

  it("leaves the ported control treatment and the derived minimum column span unchanged", async () => {
    const anatomy = await source(ANATOMY);
    const actions = functionSource(anatomy, "WallCardActions");

    // Distribution consumes width a card already has: it adds only a main-axis
    // alignment, so no control's height or radius is written by the row.
    expect(actions).not.toContain("height");
    expect(actions).not.toContain("borderRadius");
    // The ported control height and radius stand…
    expect(WALL_CARD_METRICS.controlHeight).toBe(42);
    expect(WALL_CARD_METRICS.controlRadius).toBe(12);
    // …so the widest control row (three controls at the ported height) is unmoved…
    expect(WALL_CARD_CONTROL_ROW_MIN_WIDTH_PX).toBe(
      3 * WALL_CARD_METRICS.controlHeight +
        2 * WALL_CARD_METRICS.controlSpacing +
        2 * WALL_CARD_METRICS.controlSpacing,
    );
    expect(WALL_CARD_CONTROL_ROW_MIN_WIDTH_PX).toBe(174);
    // …and the minimum column span derived from it is unmoved.
    expect(WALL_MIN_DEVICE_COLUMNS).toBe(3);
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

describe("the widget vocabulary", () => {
  it("declares every widget part beside the device parts", async () => {
    // The one card vocabulary: the parts everything that is not a device card composes.
    const anatomy = await source(ANATOMY);

    for (const part of WIDGET_VOCABULARY) {
      expect(anatomy).toContain(`export function ${part}`);
    }
  });

  it("sizes the labelled control and the route to the ported control height and radius", async () => {
    // One treatment, declared once and drawn by both, so a wall control and a card's
    // control cannot differ.
    const anatomy = await source(ANATOMY);
    const treatment = functionSource(anatomy, "wallCardControlStyle");

    expect(treatment).toContain("minWidth: WALL_CARD_METRICS.controlHeight");
    expect(treatment).toContain("minHeight: WALL_CARD_METRICS.controlHeight");
    expect(treatment).toContain("borderRadius: WALL_CARD_METRICS.controlRadius");
    // …and both the labelled control and the route draw that one style rather than a
    // treatment of their own.
    expect(functionSource(anatomy, "WallCardControl")).toContain("...wallCardControlStyle()");
    expect(functionSource(anatomy, "WallCardRoute")).toContain("...wallCardControlStyle()");
  });

  it("spaces a widget's controls by the ported control spacing", async () => {
    // The vocabulary's actions row spaces a widget's adjacent controls by the ported
    // control spacing, so a touch intended for one cannot activate its neighbour.
    const anatomy = await source(ANATOMY);

    expect(anatomy).toMatch(/gap: `\$\{WALL_CARD_METRICS\.controlSpacing\}px`/);
    expect(WALL_CARD_METRICS.controlSpacing).toBeGreaterThanOrEqual(WALL_MIN_CONTROL_GAP);
  });

  it("draws a state item's reading at the size its caller resolved", async () => {
    // A widget's reading keeps the wall's own readout tier, so the state item takes its
    // size from the caller and falls back to the ported secondary size.
    const anatomy = await source(ANATOMY);
    const item = functionSource(anatomy, "WallCardStateItem");
    const reading = functionSource(anatomy, "WallCardReading");

    expect(item).toContain("size={readingSize}");
    expect(reading).toContain("size = WALL_CARD_SECONDARY_FONT_SIZE");
    expect(reading).toContain("fontSize: size");
  });

  it("keeps a reading's value and its unit on one line", async () => {
    // A readout's value is never rendered separately from its unit: the reading is one
    // run, and it never wraps.
    const anatomy = await source(ANATOMY);

    expect(functionSource(anatomy, "WallCardReading")).toContain('whiteSpace: "nowrap"');
  });

  it("draws no metric as a literal, in the device parts or the widget parts", async () => {
    // The ported table is the one declaration site (`wall/cards/metrics.ts`); a part that
    // wrote a number would be a second one.
    const anatomy = await source(ANATOMY);

    expect(anatomy).not.toMatch(LITERAL_METRIC);
    expect(anatomy).toContain("WALL_CARD_METRICS.");
  });

  it("imports no part of the widget registry, so the vocabulary stays cycle-free", async () => {
    // The registry imports every widget renderer, which imports this module, so a
    // registry read here would close that cycle.
    const anatomy = await source(ANATOMY);

    expect(anatomy).not.toContain("registry.js");
    expect(anatomy).toContain("./metrics.js");
  });
});
