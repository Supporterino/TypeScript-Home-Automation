/**
 * The composition every typed wall device card resolves from the box it is
 * given (design.md D6; specs/wall-display "Wall Device Presentation" and
 * "Span-Aware Card Presentation"). A card's composition is a pure function of
 * the box it is handed — both dimensions — and its own configuration, so the
 * same box composes identically wherever the card is drawn and nothing is
 * measured at render time (design.md D3 of the superseded change rejected a
 * render-time measure-and-shrink).
 *
 * Four independent decisions live here, mirroring `wall/span.ts`'s own
 * form-resolution pattern (`resolveCardFormForHeight` over the renderer's box)
 * but at the card's own budget and in the ported metrics (design.md D2):
 *
 * - {@link resolveCardFormForBox} answers *how much of the card's content the
 *   box holds*: the smallest composition the type permits, one that cannot hold
 *   the card's full content, and one that does — so a taller box composes a
 *   richer form rather than inflating the smaller one. Its `siblings` rule is the
 *   same answer applied to the actions row: a compact box holds the active
 *   control alone, and the device's other controls compose from `regular` up.
 * - {@link resolveDeviceCardComposition}'s `orientation` answers *which way the
 *   card lays out*: its own natural stacked composition, or the inline row a
 *   `horizontal` layout composes where the box is wide enough for it.
 * - its `controls` answers *whether the actions row is drawn at all*: a device
 *   with controls keeps them unless `collapsible_controls` is set and the device
 *   is inactive, and a card whose controls are hidden keeps the composition of
 *   its non-control content — the form and orientation above never depend on
 *   whether the actions row is present.
 * - {@link resolveEnumControlForm} answers *what shape an enumerated control
 *   takes*: one affordance per permitted value while every value fits the
 *   actions row at the ported control width, or one affordance carrying them all
 *   — read from the box's width and a sibling control's reserve, so an option is
 *   never squeezed below the touch target.
 *
 * Deliberately dependency-free beyond the ported metrics — no React, no DOM —
 * so every decision is reachable by `bun test`.
 */
import type { WallDeviceLayout } from "@ts-ha/shared";
import { WALL_CARD_METRICS } from "./metrics.js";

/**
 * The box a wall device card composes into, in CSS pixels (specs/wall-display
 * "Span-Aware Card Presentation" — a card resolves its composition from the box
 * it is given in both directions). A card never overflows it and a wider or
 * taller box never repeats the composition a smaller one drew.
 */
export interface WallCardBox {
  /** The width the card was given, in CSS pixels. */
  readonly widthPx: number;
  /** The height the card was given, in CSS pixels. */
  readonly heightPx: number;
}

/**
 * The form a wall device card composes at the box it was given (specs/wall-display
 * "Span-Aware Card Presentation"): `compact` is the smallest composition the
 * type permits, `regular` the card's full content, and `full` a box beyond that
 * — every control plus the reading promoted. Each step is the richest the box
 * holds, never a smaller composition inflated into the space.
 */
export type WallDeviceCardForm = "compact" | "regular" | "full";

/** The direction a card lays its state item and its actions row out. */
export type WallDeviceCardOrientation = "stacked" | "inline";

/** The card's own inset on each side — the ported card padding. */
const CARD_INSET_PX = WALL_CARD_METRICS.padding;

/** One control's height — the ported control height, which is the wall's touch target. */
const CARD_ROW_PX = WALL_CARD_METRICS.controlHeight;

/** The gap below a control row — the ported control spacing. */
const CARD_ROW_GAP_PX = WALL_CARD_METRICS.controlSpacing;

/** The actions row's own horizontal padding, per side — the ported control spacing. */
const CARD_ROW_INSET_PX = WALL_CARD_METRICS.controlSpacing;

/**
 * The state-item row, in CSS pixels: the card's own inset, the icon affordance
 * at the control height, and the inset again. The name-and-state column beside
 * it is bounded by the ported primary/secondary leading, so it never makes the
 * row taller than the affordance.
 */
export const WALL_CARD_STATE_ROW_HEIGHT_PX = 2 * CARD_INSET_PX + CARD_ROW_PX;

/** One control row, in CSS pixels: the control at the ported height and its trailing gap. */
export const WALL_CARD_CONTROL_ROW_HEIGHT_PX = CARD_ROW_PX + CARD_ROW_GAP_PX;

/**
 * The widest a single control is drawn on a card at the card's minimum span, in
 * CSS pixels — the ported control height. An icon control is exactly this wide;
 * an enumerated option's label is bounded by it too, with an ellipsis (see
 * `card-anatomy.tsx`'s `WallCardOption`), so an option row is bounded exactly as
 * an icon row is (design.md D2; specs/wall-display "A card's content fits its
 * span" — "an option/icon control's own width is bounded").
 */
export const WALL_CARD_CONTROL_MAX_WIDTH_PX = WALL_CARD_METRICS.controlHeight;

/**
 * The most controls one card's actions row draws at the card's minimum span —
 * the widest bounded row the ported anatomy produces: a cover's discrete
 * Open/Stop/Close transport (a light card's expanded row is the same count, and
 * its value control shrinks). It is the count {@link WALL_CARD_CONTROL_ROW_MIN_WIDTH_PX}
 * measures, and therefore what `wall/grid.ts`'s minimum device column span is
 * derived from (design.md D2; specs/wall-display "A light card fits its minimum
 * span").
 */
export const WALL_CARD_MAX_ROW_CONTROLS = 3;

/**
 * The widest control row a card draws at its minimum span, in CSS pixels: its
 * controls (each bounded by {@link WALL_CARD_CONTROL_MAX_WIDTH_PX}), the ported
 * control spacing between them, and the actions row's own horizontal padding
 * (`card-anatomy.tsx` pads `WallCardActions` by the control spacing on each
 * side). `wall/grid.ts` derives the minimum device column span from it, so a card
 * at its type's minimum span never clips a control horizontally (specs/wall-display
 * "A light card fits its minimum span", "A card's content fits its span").
 */
export const WALL_CARD_CONTROL_ROW_MIN_WIDTH_PX =
  WALL_CARD_MAX_ROW_CONTROLS * WALL_CARD_CONTROL_MAX_WIDTH_PX +
  (WALL_CARD_MAX_ROW_CONTROLS - 1) * CARD_ROW_GAP_PX +
  2 * CARD_ROW_INSET_PX;

/**
 * The form an enumerated control takes in a card's actions row (design.md D2,
 * D6; specs/wall-display "Touch Operation", "A card's content fits its span").
 * `segmented` draws one affordance per permitted value; `single` draws one
 * affordance carrying every value.
 */
export type WallCardEnumForm = "segmented" | "single";

/**
 * The width, in CSS pixels, a row of `count` enumerated options needs: each
 * option at {@link WALL_CARD_CONTROL_MAX_WIDTH_PX} — the ported control height,
 * which is the wall's touch target and an option's width as well as its bound —
 * and the ported control spacing between them. The option width is fixed in both
 * directions — an option is never narrower than the touch target — so the count
 * alone determines the row's width.
 */
export function wallCardEnumRowWidthPx(count: number): number {
  if (count <= 0) return 0;
  return count * WALL_CARD_CONTROL_MAX_WIDTH_PX + (count - 1) * CARD_ROW_GAP_PX;
}

/**
 * The width, in CSS pixels, a value control and the control spacing separating it
 * from an enumerated control reserve in a shared actions row — one control's
 * width, so the value control is never squeezed below the touch target to make an
 * option row fit.
 */
export const WALL_CARD_ENUM_SIBLING_RESERVE_PX = WALL_CARD_CONTROL_MAX_WIDTH_PX + CARD_ROW_GAP_PX;

/**
 * The form an enumerated control composes from the box the card is given
 * (design.md D2, D6; specs/wall-display "Touch Operation" — "Controls are
 * touch-sized" — and "A card's content fits its span"). A row of options is drawn
 * only while every permitted value fits the actions row at the ported control
 * width — the wall's touch target — with nothing to shrink; a control with more
 * values than fit, or with no values at all, is drawn as one single affordance
 * carrying every value, so an option is never squeezed below the touch target and
 * the row never overflows the box. Pure: the answer is a function of the box's
 * width, its values, and the width a sibling control reserves, never a
 * render-time measurement.
 */
export function resolveEnumControlForm(input: {
  box: WallCardBox;
  /** The permitted values the control offers. */
  values: readonly (string | number)[];
  /**
   * The width, in CSS pixels, the row's other controls (and the control spacing
   * separating them) reserve — {@link WALL_CARD_ENUM_SIBLING_RESERVE_PX} when a
   * value control shares the row, `0` when the enumerated control is its only
   * child.
   */
  reservedPx?: number;
}): WallCardEnumForm {
  if (input.values.length === 0) return "single";
  const availablePx = input.box.widthPx - 2 * CARD_ROW_INSET_PX - (input.reservedPx ?? 0);
  return wallCardEnumRowWidthPx(input.values.length) <= availablePx ? "segmented" : "single";
}

/**
 * The box that holds the card's smallest composition — its state item and one
 * control row. A box at least this tall composes the compact form; it is the
 * budget a card type's minimum span is derived from.
 */
export const WALL_CARD_COMPACT_HEIGHT_PX =
  WALL_CARD_STATE_ROW_HEIGHT_PX + WALL_CARD_CONTROL_ROW_HEIGHT_PX;

/** The box that holds the card's full content — its state item and two control rows. */
export const WALL_CARD_REGULAR_HEIGHT_PX =
  WALL_CARD_COMPACT_HEIGHT_PX + WALL_CARD_CONTROL_ROW_HEIGHT_PX;

/** The box beyond the card's full content, where its reading is promoted rather than stretched. */
export const WALL_CARD_FULL_HEIGHT_PX =
  WALL_CARD_REGULAR_HEIGHT_PX + WALL_CARD_CONTROL_ROW_HEIGHT_PX;

/**
 * The width, in CSS pixels, the name-and-state column needs to stay legible at
 * the ported sizes — a bounded allowance for the shortened device name over its
 * reading, so the inline composition never squeezes the column below a readable
 * width.
 */
export const WALL_CARD_STATE_ITEM_MIN_WIDTH_PX = 96;

/**
 * The narrowest box, in CSS pixels, the inline composition fits: the card's
 * inset, the icon affordance, the state-item column, and the active control, each
 * separated by the ported control spacing. A `horizontal` layout is composed only
 * where the box is at least this wide; a narrower box presents the card's own
 * stacked composition rather than one that overflows it.
 */
export const WALL_CARD_INLINE_MIN_WIDTH_PX =
  2 * CARD_INSET_PX +
  CARD_ROW_PX +
  CARD_ROW_GAP_PX +
  WALL_CARD_STATE_ITEM_MIN_WIDTH_PX +
  CARD_ROW_GAP_PX +
  CARD_ROW_PX;

/**
 * The form a card composes into a box `heightPx` tall (specs/wall-display
 * "Span-Aware Card Presentation"): the richest form whose threshold the box
 * meets, and `compact` — the card's smallest composition — for any shorter box.
 * A card can therefore never overflow or clip the box it was given, and a box
 * that admits a richer form composes one rather than enlarging a smaller form
 * into the space.
 */
export function resolveCardFormForBox(heightPx: number): WallDeviceCardForm {
  if (heightPx >= WALL_CARD_FULL_HEIGHT_PX) return "full";
  if (heightPx >= WALL_CARD_REGULAR_HEIGHT_PX) return "regular";
  return "compact";
}

/** What a box composes a card into — its form, its orientation, and its controls (design.md D6). */
export interface WallDeviceCardComposition {
  /** How much of the card's content the box holds. */
  readonly form: WallDeviceCardForm;
  /** The direction the card lays its state item and its actions row out. */
  readonly orientation: WallDeviceCardOrientation;
  /**
   * Whether the actions row carries the device's other controls beside the
   * active one. A compact box holds the active control alone; the card's full
   * content — every declared control — composes from `regular` up.
   */
  readonly siblings: boolean;
  /**
   * Whether the actions row is drawn: the device has controls and they are not
   * hidden while it is inactive. A card whose controls are hidden keeps the
   * composition above unchanged, so it keeps the composition of its non-control
   * content rather than reflowing into a different card.
   */
  readonly controls: boolean;
}

/**
 * Resolves a card's composition from the box it is given and its own
 * configuration (design.md D6; specs/wall-display "Wall Device Presentation",
 * "Span-Aware Card Presentation"). `default` follows the card's own natural
 * composition, which is the stacked one; `vertical` names it explicitly; and
 * `horizontal` composes the inline row where the box is wide enough for it.
 * `collapsibleControls` hides the actions row only while the device is inactive,
 * and never changes the form or the orientation.
 */
export function resolveDeviceCardComposition(input: {
  box: WallCardBox;
  /** The card's configured layout; absent is the card's own natural composition. */
  layout?: WallDeviceLayout;
  /** Whether the card hides its controls while the device is inactive. */
  collapsibleControls?: boolean;
  /** Whether the device declares at least one control the card can drive. */
  hasControls: boolean;
  /** Whether the device is currently active (on, open, or otherwise not idle). */
  active: boolean;
}): WallDeviceCardComposition {
  const form = resolveCardFormForBox(input.box.heightPx);
  const inline =
    input.layout === "horizontal" && input.box.widthPx >= WALL_CARD_INLINE_MIN_WIDTH_PX;

  return {
    form,
    orientation: inline ? "inline" : "stacked",
    siblings: form !== "compact",
    controls: input.hasControls && !(input.collapsibleControls === true && !input.active),
  };
}

/**
 * The card root's own layout for a resolved composition (design.md D6;
 * specs/wall-display "Span-Aware Card Presentation"). A stacked card lays its
 * state item and its actions row out in a column; an inline card lays them out as
 * one row, splitting the box between them — or giving the state item the whole of
 * it while its controls are hidden, so hiding the controls never reflows the card
 * into a different composition. A plain style object rather than a React type, so
 * the module stays free of React and the layout a composition resolves is
 * reachable by `bun test`.
 */
export interface WallCardRootLayout {
  readonly display: "flex" | "grid";
  readonly flexDirection?: "column";
  readonly gridTemplateColumns?: string;
  readonly alignItems?: "center";
}

/**
 * The root's own layout for a composition. A card spreads it onto its surface, so
 * the direction its composition resolved is drawn by one shared rule rather than
 * per card.
 */
export function wallCardRootLayout(composition: WallDeviceCardComposition): WallCardRootLayout {
  if (composition.orientation !== "inline") {
    return { display: "flex", flexDirection: "column" };
  }
  return {
    display: "grid",
    gridTemplateColumns: composition.controls ? "minmax(0, 1fr) minmax(0, 1fr)" : "minmax(0, 1fr)",
    alignItems: "center",
  };
}

/**
 * The box a card is composed into when its widget hands it no measured one — the
 * box of its fullest composition, so an unwired card draws its complete content
 * rather than silently dropping a control.
 */
export const DEFAULT_WALL_CARD_BOX: WallCardBox = Object.freeze({
  widthPx: WALL_CARD_INLINE_MIN_WIDTH_PX,
  heightPx: WALL_CARD_FULL_HEIGHT_PX,
});

/**
 * The box a *placed* wall card is composed into, from the geometry the wall
 * knows without measuring anything at render time (design.md D3; specs/wall-display
 * "Span-Aware Card Presentation"). The height is the renderer's own resolved box
 * (`frame.ts`'s `rendererBoxHeightPx`). The width is the widget's column span at
 * the wall's row unit — the wall's own conservative estimate: a wall column is
 * never *narrower* than a row is tall (`wall/pages.ts` records the same fact), so
 * `columns · rowUnit` can only under-state the real width and a card can never
 * compose a form wider than the box it is actually drawn in. Two decisions read
 * that width — the `horizontal` layout's inline composition, and
 * {@link resolveEnumControlForm}'s choice between one affordance per value and a
 * single affordance — and the under-stated width can only push the enumerated
 * control towards the single affordance, so the safety argument holds for both:
 * the form the box resolves always fits the box the card is actually drawn in.
 */
export function placedDeviceCardBox(input: {
  /** The widget's column span, in grid cells. */
  columns: number;
  /** The panel's resolved row unit, in CSS pixels. */
  rowUnit: number;
  /** The height the renderer's own box gets, in CSS pixels. */
  heightPx: number;
}): WallCardBox {
  return { widthPx: input.columns * input.rowUnit, heightPx: input.heightPx };
}
