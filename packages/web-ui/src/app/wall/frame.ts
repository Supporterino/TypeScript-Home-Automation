/**
 * Pure decisions for the widget frame (design.md D2, D6; specs/wall-display
 * "Wall Glanceability", "Wall Visual Language"). Dependency-free so the
 * ambient-vs-control presentation and the opt-in title rule are reachable by
 * `bun test` without a DOM, while {@link WidgetFrame} stays a thin wrapper. The
 * composition model is unchanged: only the tokens the frame draws with move from
 * Lumen to Hearth.
 */
import type { WallWidget, WallWidgetType } from "@ts-ha/shared";
import { isWallDeviceClass } from "./cards/device-class.js";
import { WALL_FRAME_RESERVED_PX } from "./pages.js";
import type { WallWidgetGrammar } from "./registry.js";
import { cardHeightPx, WALL_TITLE_BLOCK_PX, type WallSpanDescriptor } from "./span.js";

/**
 * The surface a frame draws for a widget's grammar. `ambient` readouts are
 * chrome-less — no surface, no border, no background — so large type sits
 * directly on the panel; `control` widgets draw a Hearth surface tile with a
 * hairline border and the Hearth radius (design.md D2, "Wall Visual Language").
 * Every token is wall-owned (`--hearth-*`), never a Lumen alias.
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
}

/** Maps a widget's grammar to the frame surface it draws (design.md D2). */
export function wallFrameChrome(grammar: WallWidgetGrammar): WallFrameChrome {
  if (grammar === "ambient") {
    return { surface: false, background: null, borderColor: null, radius: null };
  }
  return {
    surface: true,
    background: "var(--hearth-surface)",
    borderColor: "var(--hearth-hairline)",
    radius: "var(--hearth-radius-md)",
  };
}

/**
 * The zone band's surface (wall-zones-and-fit D2; specs/wall-display "Wall
 * Zones"). A band is one container level *behind* its member tiles: a tinted,
 * radiused field carrying the zone's caption, drawn from Hearth's own
 * `--hearth-band` token — a slightly lifted field between the canvas and a
 * member's surface. Member widgets keep their own surface, so a band never
 * nests one surface in another ("A card is a single surface").
 */
export interface WallBandChrome {
  /** The band's field background token. */
  background: string;
  /** The band's corner radius token. */
  radius: string;
}

/** The zone band's surface tokens, from Hearth's own band and radius scale. */
export function wallBandChrome(): WallBandChrome {
  return { background: "var(--hearth-band)", radius: "var(--hearth-radius-md)" };
}

/**
 * Whether the frame draws a widget's card surface. Every typed device widget's
 * frame is chrome-less: its single device card owns the surface (or, for a
 * read-only card, deliberately draws none), so the frame must not draw a second
 * one (design.md D2, D9; specs/wall-display "A card is a single surface"). Every
 * other type keeps the grammar-derived surface, so the mapping in
 * {@link wallFrameChrome} is unchanged.
 */
export function wallFrameDrawsSurface(type: WallWidgetType, grammar: WallWidgetGrammar): boolean {
  if (isWallDeviceClass(type)) return false;
  return wallFrameChrome(grammar).surface;
}

/**
 * The widget's configured title, or `null` when none is set (design.md D3).
 * Headers are opt-in: without a configured title the widget's own content
 * labels it, so the type label is never used as a fallback.
 */
export function widgetTitle(widget: WallWidget): string | null {
  const configured = widget.config.title;
  if (typeof configured === "string" && configured.trim().length > 0) return configured;
  return null;
}

/**
 * The height, in CSS pixels, the renderer's own box gets at its type's minimum
 * span, with no title — the box a minimum-span card is guaranteed, and therefore
 * the floor a titled card's own box must still meet (wall-zones-and-fit D3, D4;
 * specs/wall-display "Span-Aware Card Presentation"). The frame's inset is taken
 * out exactly as {@link rendererBoxHeightPx} takes it out of the placement's cell,
 * so the two boxes are comparable for a surfaced frame and are the two cells for a
 * chrome-less one.
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
 * The height, in CSS pixels, a widget's renderer actually gets inside its cell
 * (wall-zones-and-fit D3, D4; specs/wall-display "Span-Aware Card
 * Presentation"). The frame spends part of the cell on its own inset — when it
 * draws a control surface — and on the opt-in title it renders above the
 * renderer, so a form resolved against the whole cell would promise the renderer
 * room the frame has already taken. Never negative: a cell smaller than the
 * frame's own chrome leaves no box rather than a negative one.
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
 * The wall's "too small" explanation (wall-zones-and-fit D3, D5;
 * specs/wall-display "Panel Fit"): what a widget presents instead of a clipped
 * card when its cell cannot hold the composition its type's minimum span
 * guarantees — a placement authored before a minimum was re-derived, or written
 * through the API, and a renderer's own composition that its remaining box
 * cannot hold even at a legal span. Single-sourced here so the frame's guard and
 * a renderer that resolves its own compositions explain the same thing in the
 * same words.
 */
export const WALL_TOO_SMALL_MESSAGE =
  "This widget’s cell is too small for its minimum size at this panel. Resize it in the wall editor.";
