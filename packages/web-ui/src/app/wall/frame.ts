/**
 * Pure decisions for the widget frame and the wall's own chrome: the surface it
 * draws, the opt-in title rule, and the chrome's ported text treatment.
 */
import type { WallWidget, WallWidgetType } from "@ts-ha/shared";
import { isWallDeviceClass } from "./cards/device-class.js";
import { WALL_CARD_METRICS } from "./cards/metrics.js";
import { WALL_FRAME_RESERVED_PX } from "./pages.js";
import type { WallWidgetGrammar } from "./registry.js";
import { cardHeightPx, WALL_TITLE_BLOCK_PX, type WallSpanDescriptor } from "./span.js";

/**
 * The surface a frame draws for a widget's grammar: chrome-less for `ambient`,
 * the ported card surface for `control`.
 */
export interface WallFrameChrome {
  /** Whether the frame renders a control surface. */
  surface: boolean;
  /** The control surface background token, or `null` for a chrome-less readout. */
  background: string | null;
  /** The control surface border color token, or `null` for a chrome-less readout. */
  borderColor: string | null;
  /** The control surface corner radius token, or `null` for a chrome-less readout. */
  radius: string | null;
  /** The control surface content inset token, or `null` for a chrome-less readout. */
  padding: string | null;
}

/** Maps a widget's grammar to the frame surface it draws. */
export function wallFrameChrome(grammar: WallWidgetGrammar): WallFrameChrome {
  if (grammar === "ambient") {
    return { surface: false, background: null, borderColor: null, radius: null, padding: null };
  }
  return {
    surface: true,
    background: "var(--hearth-surface)",
    borderColor: "var(--hearth-hairline)",
    radius: "var(--hearth-card-radius)",
    padding: "var(--hearth-card-padding)",
  };
}

/**
 * The zone band's surface: a tinted field one container level behind its member
 * tiles, drawn at the ported card surface.
 */
export interface WallBandChrome {
  /** The band's field background token. */
  background: string;
  /** The band's corner radius token. */
  radius: string;
  /** The band's content inset token — the ported card surface's own padding. */
  padding: string;
}

/** The zone band's surface tokens, from Hearth's own band field and the ported card surface. */
export function wallBandChrome(): WallBandChrome {
  return {
    background: "var(--hearth-band)",
    radius: "var(--hearth-card-radius)",
    padding: "var(--hearth-card-padding)",
  };
}

/**
 * The wall chrome's ported text treatment: the ported card table's family,
 * weight, and tracking.
 */
export interface WallChromeTextStyle {
  /** The ported card table's display face. */
  fontFamily: string;
  /** The ported primary line's weight. */
  fontWeight: number;
  /** The ported primary line's letter spacing. */
  letterSpacing: string;
}

/** The ported family/weight/tracking the wall's own chrome is drawn with. */
export function wallChromeTextStyle(): WallChromeTextStyle {
  return {
    fontFamily: "var(--hearth-font-display)",
    fontWeight: WALL_CARD_METRICS.primaryWeight,
    letterSpacing: `${WALL_CARD_METRICS.primaryTracking}px`,
  };
}

/**
 * Whether the frame draws a widget's card surface. Every typed device widget is
 * chrome-less, so its single card owns the surface.
 */
export function wallFrameDrawsSurface(type: WallWidgetType, grammar: WallWidgetGrammar): boolean {
  if (isWallDeviceClass(type)) return false;
  return wallFrameChrome(grammar).surface;
}

/**
 * The widget's configured title, or `null` when none is set.
 */
export function widgetTitle(widget: WallWidget): string | null {
  const configured = widget.config.title;
  if (typeof configured === "string" && configured.trim().length > 0) return configured;
  return null;
}

/**
 * The height, in CSS pixels, the renderer's box gets at its type's minimum span,
 * with no title.
 */
export function minimumRendererBoxHeightPx(input: {
  descriptor: WallSpanDescriptor;
  rowUnit: number;
  framed: boolean;
  gutterPx?: number;
}): number {
  return rendererBoxHeightPx({
    cellHeightPx: cardHeightPx({
      rows: input.descriptor.min.h,
      rowUnit: input.rowUnit,
      ...(input.gutterPx === undefined ? {} : { gutterPx: input.gutterPx }),
    }),
    framed: input.framed,
    titled: false,
  });
}

/**
 * The height, in CSS pixels, a widget's renderer gets inside its cell after the
 * frame's inset and the opted-in title. Never negative.
 */
export function rendererBoxHeightPx(input: {
  cellHeightPx: number;
  framed: boolean;
  titled: boolean;
}): number {
  const chrome =
    (input.framed ? WALL_FRAME_RESERVED_PX : 0) + (input.titled ? WALL_TITLE_BLOCK_PX : 0);
  return Math.max(0, input.cellHeightPx - chrome);
}

/**
 * What a widget presents instead of a clipped card when its cell is too small
 * for the composition its type's minimum span guarantees.
 */
export const WALL_TOO_SMALL_MESSAGE =
  "This widget’s cell is too small for its minimum size at this panel. Resize it in the wall editor.";
