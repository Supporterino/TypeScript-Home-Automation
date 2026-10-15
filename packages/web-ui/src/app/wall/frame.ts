/**
 * Pure decisions for the widget frame and the wall's own chrome (design.md D2,
 * D6, W3, W4; specs/wall-display "Wall Glanceability", "Wall Visual Language").
 * Dependency-free so the ambient-vs-control presentation, the opt-in title rule
 * and the chrome's ported text treatment are reachable by `bun test` without a
 * DOM, while {@link WidgetFrame} stays a thin wrapper. The composition model is
 * unchanged: the frame and the band draw the *ported card surface* (its radius and
 * its padding), and the wall's own chrome — the title, the band caption, the
 * panel's explanations — adopts the ported family/weight/tracking while keeping
 * the wall's own title and label tiers.
 */
import type { WallWidget, WallWidgetType } from "@ts-ha/shared";
import { isWallDeviceClass } from "./cards/device-class.js";
import { WALL_CARD_METRICS } from "./cards/metrics.js";
import { WALL_FRAME_RESERVED_PX } from "./pages.js";
import type { WallWidgetGrammar } from "./registry.js";
import { cardHeightPx, WALL_TITLE_BLOCK_PX, type WallSpanDescriptor } from "./span.js";

/**
 * The surface a frame draws for a widget's grammar. `ambient` readouts are
 * chrome-less — no surface, no border, no background — so large type sits
 * directly on the panel; `control` widgets draw a Hearth surface tile with a
 * hairline border at the **ported card surface** — its radius and its padding —
 * so a control widget's tile and a device card's are the same surface (design.md
 * W3; specs/wall-display "A widget's surface is a card's surface"). Every token
 * is wall-owned (`--hearth-*`), never a Lumen alias, and the surface's radius and
 * padding are the ported card's own, mirrored by `wall/cards/metrics.ts`.
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

/** Maps a widget's grammar to the frame surface it draws (design.md D2, W3). */
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
 * The zone band's surface (wall-zones-and-fit D2; design.md W3; specs/wall-display
 * "Wall Zones"). A band is one container level *behind* its member tiles: a
 * tinted field carrying the zone's caption, drawn from Hearth's own
 * `--hearth-band` token — a slightly lifted field between the canvas and a
 * member's surface — at the **ported card surface**, so a band and the card
 * standing on it are the same surface (specs/wall-display "A widget's surface is
 * a card's surface"). Member widgets keep their own surface, so a band never
 * nests one surface in another ("A card is a single surface").
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
 * The wall chrome's ported text treatment (design.md W4; specs/wall-display "Wall
 * Visual Language"): the ported card table's family, weight and tracking — nothing
 * else. The wall's own chrome — the opt-in widget title, the zone band's caption
 * and the panel's own explanations — sits outside a widget's content and labels
 * containers rather than readings, so it adopts the *treatment* while keeping the
 * wall's own title/label tier as its size and its own colour: a container label is
 * never given a card role's semantics (`WallCardLabel` carries a card's role).
 *
 * The three values are read from {@link WALL_CARD_METRICS} rather than restated, so
 * a chrome caption cannot drift from the card surface it sits beside.
 */
export interface WallChromeTextStyle {
  /** The ported card table's display face. */
  fontFamily: string;
  /** The ported primary line's weight. */
  fontWeight: number;
  /** The ported primary line's letter spacing. */
  letterSpacing: string;
}

/** The ported family/weight/tracking the wall's own chrome is drawn with (design.md W4). */
export function wallChromeTextStyle(): WallChromeTextStyle {
  return {
    fontFamily: "var(--hearth-font-display)",
    fontWeight: WALL_CARD_METRICS.primaryWeight,
    letterSpacing: `${WALL_CARD_METRICS.primaryTracking}px`,
  };
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
