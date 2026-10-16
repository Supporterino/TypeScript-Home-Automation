/**
 * The composition every typed wall device card resolves from the box it is given:
 * form, orientation, sibling controls, and the enumerated control's shape.
 */
import type { WallDeviceLayout } from "@ts-ha/shared";
import { WALL_CARD_METRICS } from "./metrics.js";

/**
 * The box a wall device card composes into, in CSS pixels. A card never overflows
 * it.
 */
export interface WallCardBox {
  /** The width the card was given, in CSS pixels. */
  readonly widthPx: number;
  /** The height the card was given, in CSS pixels. */
  readonly heightPx: number;
}

/**
 * The form a wall device card composes at the box it was given: `compact` the
 * smallest composition, `full` a box beyond the card's content.
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
 * The state-item row, in CSS pixels: the card's inset, the icon affordance at the
 * control height, and the inset again.
 */
export const WALL_CARD_STATE_ROW_HEIGHT_PX = 2 * CARD_INSET_PX + CARD_ROW_PX;

/** One control row, in CSS pixels: the control at the ported height and its trailing gap. */
export const WALL_CARD_CONTROL_ROW_HEIGHT_PX = CARD_ROW_PX + CARD_ROW_GAP_PX;

/**
 * The widest a single control is drawn on a card at the card's minimum span, in CSS
 * pixels — the ported control height.
 */
export const WALL_CARD_CONTROL_MAX_WIDTH_PX = WALL_CARD_METRICS.controlHeight;

/**
 * The most controls one card's actions row draws at the card's minimum span — a
 * cover's Open/Stop/Close transport.
 */
export const WALL_CARD_MAX_ROW_CONTROLS = 3;

/**
 * The widest control row a card draws at its minimum span, in CSS pixels: its
 * controls, the control spacing, and the actions row's own padding.
 */
export const WALL_CARD_CONTROL_ROW_MIN_WIDTH_PX =
  WALL_CARD_MAX_ROW_CONTROLS * WALL_CARD_CONTROL_MAX_WIDTH_PX +
  (WALL_CARD_MAX_ROW_CONTROLS - 1) * CARD_ROW_GAP_PX +
  2 * CARD_ROW_INSET_PX;

/**
 * The form an enumerated control takes in a card's actions row: `segmented` one
 * affordance per value, `single` one carrying all.
 */
export type WallCardEnumForm = "segmented" | "single";

/**
 * The width, in CSS pixels, a row of `count` enumerated options needs — each at the
 * control width plus the spacing between them.
 */
export function wallCardEnumRowWidthPx(count: number): number {
  if (count <= 0) return 0;
  return count * WALL_CARD_CONTROL_MAX_WIDTH_PX + (count - 1) * CARD_ROW_GAP_PX;
}

/**
 * The width, in CSS pixels, a value control and its separating spacing reserve in a
 * shared actions row — one control's width.
 */
export const WALL_CARD_ENUM_SIBLING_RESERVE_PX = WALL_CARD_CONTROL_MAX_WIDTH_PX + CARD_ROW_GAP_PX;

/**
 * The form an enumerated control composes from the box the card is given: a row of
 * options only while every value fits, one affordance otherwise.
 */
export function resolveEnumControlForm(input: {
  box: WallCardBox;
  /** The permitted values the control offers. */
  values: readonly (string | number)[];
  /**
   * The width, in CSS pixels, the row's other controls and their spacing reserve.
   */
  reservedPx?: number;
}): WallCardEnumForm {
  if (input.values.length === 0) return "single";
  const availablePx = input.box.widthPx - 2 * CARD_ROW_INSET_PX - (input.reservedPx ?? 0);
  return wallCardEnumRowWidthPx(input.values.length) <= availablePx ? "segmented" : "single";
}

/**
 * The box that holds the card's smallest composition — its state item and one
 * control row.
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
 * The width, in CSS pixels, the name-and-state column needs to stay legible at the
 * ported sizes.
 */
export const WALL_CARD_STATE_ITEM_MIN_WIDTH_PX = 96;

/**
 * The narrowest box, in CSS pixels, the inline composition fits: the inset, the icon
 * affordance, the state column, and the active control.
 */
export const WALL_CARD_INLINE_MIN_WIDTH_PX =
  2 * CARD_INSET_PX +
  CARD_ROW_PX +
  CARD_ROW_GAP_PX +
  WALL_CARD_STATE_ITEM_MIN_WIDTH_PX +
  CARD_ROW_GAP_PX +
  CARD_ROW_PX;

/**
 * The form a card composes into a box `heightPx` tall: the richest form whose
 * threshold the box meets, `compact` below all of them.
 */
export function resolveCardFormForBox(heightPx: number): WallDeviceCardForm {
  if (heightPx >= WALL_CARD_FULL_HEIGHT_PX) return "full";
  if (heightPx >= WALL_CARD_REGULAR_HEIGHT_PX) return "regular";
  return "compact";
}

/** What a box composes a card into — its form, its orientation, and its controls. */
export interface WallDeviceCardComposition {
  /** How much of the card's content the box holds. */
  readonly form: WallDeviceCardForm;
  /** The direction the card lays its state item and its actions row out. */
  readonly orientation: WallDeviceCardOrientation;
  /**
   * Whether the actions row carries the device's other controls beside the active
   * one. A compact box holds the active control alone.
   */
  readonly siblings: boolean;
  /**
   * Whether the actions row is drawn: the device has controls and they are not
   * hidden while it is inactive.
   */
  readonly controls: boolean;
}

/**
 * Resolves a card's composition from the box it is given and its own configuration:
 * the form, the orientation, and whether the actions row is drawn.
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
 * The card root's own layout for a resolved composition: a stacked column, or the
 * inline row that splits the box between state item and controls.
 */
export interface WallCardRootLayout {
  readonly display: "flex" | "grid";
  readonly flexDirection?: "column";
  readonly gridTemplateColumns?: string;
  readonly alignItems?: "center";
}

/**
 * The root's own layout for a composition, shared by every card.
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
 * The box a card is composed into when its widget hands it none — the box of its
 * fullest composition.
 */
export const DEFAULT_WALL_CARD_BOX: WallCardBox = Object.freeze({
  widthPx: WALL_CARD_INLINE_MIN_WIDTH_PX,
  heightPx: WALL_CARD_FULL_HEIGHT_PX,
});

/**
 * The box a placed wall card is composed into, from geometry the wall knows without
 * measuring: its column span at the row unit, and the renderer's box height.
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
