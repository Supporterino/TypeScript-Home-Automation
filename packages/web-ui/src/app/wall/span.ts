/**
 * Wall widget span tiers and card forms (design.md D2, D3; specs/wall-display
 * "Span-Aware Card Presentation"). A card composes its content for the span it
 * was placed at, in both directions: it never overflows its cells and a large
 * span never repeats the composition a small span renders.
 *
 * Two pure decisions live here, on two different measures, because they answer
 * two different questions:
 *
 * - {@link resolveSpanTier} answers *how much room the widget has* on the
 *   registry's own measure — the area of the placement between the type's
 *   `min`/`defaults`/`max` — and drives a type's scale detail (a readout's font
 *   tier, a link's label size).
 * - {@link resolveCardFormForHeight} answers *what actually fits the renderer's
 *   own box*: a card whose full form is taller than the box it was given must
 *   compose its compact form, whatever its area tier says.
 *
 * {@link composesMinimumSpan} is the guard the two are derived against: a
 * placement the editor would never author — below its type's minimum on either
 * axis — is explained rather than clipped. A renderer whose own composition has
 * its own budget resolves it against {@link resolveCardFormForHeight}'s box (see
 * `frame.ts`'s `rendererBoxHeightPx`), passed to it through `WallWidgetProps`.
 *
 * A render-time measure-and-shrink was rejected (design.md D3), which keeps both
 * decisions pure: no DOM, no `ResizeObserver`, reachable by `bun test`.
 */
import { WALL_CARD_FULL_HEIGHT_PX } from "./cards/card-composition.js";
import { ROW_UNIT_MIN, WALL_GUTTER_MIN_PX } from "./grid.js";
import type { WallWidgetSpan } from "./registry.js";
import { WALL_TYPE_RAMP } from "./type-ramp.js";

/** A widget's presentation tier for its declared span (design.md D3). */
export type WallWidgetTier = "compact" | "regular" | "roomy";

/**
 * The form a wall card composes at the placement it was given (design.md D3;
 * specs/wall-display "Span-Aware Card Presentation"): `compact` when the card's
 * full form does not fit the cell's height, `full` when it does.
 */
export type WallCardForm = "compact" | "full";

/**
 * The height, in CSS pixels, at which a card composes its full form instead of
 * its compact one (design.md D2, D5). It is the ported card's own budget for its
 * full content — its state item and two control rows — read from the card module
 * rather than restated, so the form boundary and the cards the wall ports cannot
 * drift. The smallest card the ported system produces
 * (`wall/grid.ts`'s `WALL_COMPACT_CARD_HEIGHT_PX`) is the budget below it.
 */
export const WALL_FULL_CARD_HEIGHT_PX = WALL_CARD_FULL_HEIGHT_PX;

/**
 * The frame's opt-in title block, in CSS pixels: the largest title the wall draws
 * (`WALL_TYPE_RAMP.titleMax`) at the app's body leading, plus the Hearth margin
 * below it. The frame subtracts it from a cell's height before asking what fits,
 * because the renderer's box is what is left — a titled card has that much less
 * room, and a bounded allowance keeps the answer pure.
 */
export const WALL_TITLE_BLOCK_PX = Math.ceil(WALL_TYPE_RAMP.titleMax * 1.5) + 8;

/**
 * The rows a configured title costs a card inside its own cell — the title block
 * measured in the wall's shortest row.
 *
 * A title is drawn above the renderer inside the *same* cell, so the title block
 * is height the cell no longer has for the renderer. Every type's registry
 * minimum span is derived for an *untitled* card — the row unit from the ported
 * compact card (D5), the paging types' minimum spans from their own chrome — so a
 * titled card's floor is the type's minimum span plus these rows. The render-side
 * twin is {@link composesMinimumSpan}, whose box test is the same rule in pixels;
 * `wall-span.test.ts` asserts the two agree at every row unit, so the editor's row
 * floor and the wall's guard cannot drift.
 */
export const WALL_TITLE_ROWS = Math.ceil(WALL_TITLE_BLOCK_PX / ROW_UNIT_MIN);

/**
 * The height, in CSS pixels, of a `rows`-row cell at `rowUnit` — the wall's own
 * cell geometry: `rows · unit + (rows − 1) · gutter`. The gutter defaults to its
 * floor, the smallest cell any panel can draw.
 */
export function cardHeightPx(input: { rows: number; rowUnit: number; gutterPx?: number }): number {
  const unit = Math.max(input.rowUnit, ROW_UNIT_MIN);
  const gutterPx = input.gutterPx ?? WALL_GUTTER_MIN_PX;
  return input.rows * unit + Math.max(0, input.rows - 1) * gutterPx;
}

/**
 * The form a card composes into a box `heightPx` tall (design.md D3; specs/wall-
 * display "Span-Aware Card Presentation"): the full form only where it fits, the
 * compact form otherwise — whose budget (`WALL_COMPACT_CARD_HEIGHT_PX` in
 * `wall/grid.ts`) the wall's own minimum span guarantees. A card can therefore
 * never overflow or clip the box it was given.
 *
 * The height is the *renderer's own box*, not the whole cell: the frame spends
 * part of the cell on its inset and, when configured, on the title above the
 * renderer (see `frame.ts`'s `rendererBoxHeightPx`).
 */
export function resolveCardFormForHeight(heightPx: number): WallCardForm {
  return heightPx >= WALL_FULL_CARD_HEIGHT_PX ? "full" : "compact";
}

/**
 * Whether a widget's placement can render the card its type's minimum span
 * guarantees (design.md D3, D5; specs/wall-display "Span-Aware Card
 * Presentation", "Panel Fit"). Two axes decide it:
 *
 * - the placement must meet the type's minimum *width*, because a cell one column
 *   narrow reflows a card's control or tile row and silently loses a whole
 *   touch-target row;
 * - the renderer's own box must meet the box a minimum-span card gets, because
 *   everything the frame spends above the renderer — its inset, and the opt-in
 *   title — is height the cell no longer has for the card. Comparing boxes rather
 *   than cells is what makes the guard title-aware: a titled card's cell must be
 *   taller than its type's minimum by the title block ({@link WALL_TITLE_ROWS},
 *   the editor's twin of this rule), so a titled minimum-span card is explained
 *   rather than having its bottom row clipped by the frame.
 *
 * A placement that fails either test — authored before a minimum was re-derived,
 * or written through the API — cannot render the card its type guarantees, so the
 * wall explains it instead of clipping it.
 */
export function composesMinimumSpan(input: {
  placement: WallWidgetSpan;
  descriptor: WallSpanDescriptor;
  /** The height the renderer's own box gets at this placement, in CSS pixels. */
  rendererHeightPx: number;
  /** The height that box gets at the type's minimum span, with no title, in CSS pixels. */
  minimumRendererHeightPx: number;
}): boolean {
  return (
    input.placement.w >= input.descriptor.min.w &&
    input.rendererHeightPx >= input.minimumRendererHeightPx
  );
}

/** The descriptor spans a tier is derived from — the registry's own `min`/`defaults`/`max`. */
export interface WallSpanDescriptor {
  readonly min: WallWidgetSpan;
  readonly defaults: WallWidgetSpan;
  readonly max: WallWidgetSpan;
}

/** A span's area in cells — the scalar the tiers are compared on. */
function spanArea(span: WallWidgetSpan): number {
  return span.w * span.h;
}

/**
 * Resolves a placement's presentation tier from its type's spans.
 *
 * The descriptor's three reference spans are its own minimum, default, and
 * maximum placement, so the tier is the placement's position between them:
 *
 * - `compact` — no larger than the descriptor's minimum, or as near it as the
 *   midpoint between the minimum and the default. This covers a type whose
 *   default *is* its minimum (every typed device widget, the scene type), so its
 *   smallest legal card always gets the compact composition the minimum span was
 *   derived for (design.md D2, D5).
 * - `roomy` — at or above the midpoint between the default and the maximum, so
 *   a card near its largest legal span expands rather than repeating `regular`.
 * - `regular` — everything between, which includes the descriptor's default
 *   placement.
 *
 * A placement below the minimum (impossible through the editor, which clamps)
 * resolves `compact`, and a placement above the maximum resolves `roomy`.
 */
export function resolveSpanTier(
  placement: WallWidgetSpan,
  descriptor: WallSpanDescriptor,
): WallWidgetTier {
  const size = spanArea(placement);
  const compactCeiling = (spanArea(descriptor.min) + spanArea(descriptor.defaults)) / 2;
  const roomyFloor = (spanArea(descriptor.defaults) + spanArea(descriptor.max)) / 2;

  if (size <= compactCeiling) return "compact";
  if (size >= roomyFloor) return "roomy";
  return "regular";
}
