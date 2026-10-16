/**
 * Wall widget span tiers and card forms: a card composes for the span it was
 * placed at, in both directions.
 */
import { WALL_CARD_FULL_HEIGHT_PX } from "./cards/card-composition.js";
import { ROW_UNIT_MIN, WALL_GUTTER_MIN_PX } from "./grid.js";
import type { WallWidgetSpan } from "./registry.js";
import { WALL_TYPE_RAMP } from "./type-ramp.js";

/** A widget's presentation tier for its declared span. */
export type WallWidgetTier = "compact" | "regular" | "roomy";

/**
 * The form a wall card composes at the placement it was given: `compact` when its
 * full form does not fit the cell's height, `full` when it does.
 */
export type WallCardForm = "compact" | "full";

/**
 * The height, in CSS pixels, at which a card composes its full form instead of its
 * compact one — the ported card's own budget for its full content.
 */
export const WALL_FULL_CARD_HEIGHT_PX = WALL_CARD_FULL_HEIGHT_PX;

/**
 * The frame's opt-in title block, in CSS pixels: the largest title the wall draws
 * plus the Hearth margin below it.
 */
export const WALL_TITLE_BLOCK_PX = Math.ceil(WALL_TYPE_RAMP.titleMax * 1.5) + 8;

/**
 * The rows a configured title costs a card inside its own cell — the title block
 * measured in the wall's shortest row.
 */
export const WALL_TITLE_ROWS = Math.ceil(WALL_TITLE_BLOCK_PX / ROW_UNIT_MIN);

/**
 * The height, in CSS pixels, of a `rows`-row cell at `rowUnit`, with the gutter
 * defaulting to its floor.
 */
export function cardHeightPx(input: { rows: number; rowUnit: number; gutterPx?: number }): number {
  const unit = Math.max(input.rowUnit, ROW_UNIT_MIN);
  const gutterPx = input.gutterPx ?? WALL_GUTTER_MIN_PX;
  return input.rows * unit + Math.max(0, input.rows - 1) * gutterPx;
}

/**
 * The form a card composes into a box `heightPx` tall: the full form only where it
 * fits, the compact form otherwise.
 */
export function resolveCardFormForHeight(heightPx: number): WallCardForm {
  return heightPx >= WALL_FULL_CARD_HEIGHT_PX ? "full" : "compact";
}

/**
 * Whether a widget's placement can render the card its type's minimum span
 * guarantees, on the width axis and the renderer's box height.
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
 * Resolves a placement's presentation tier — `compact`, `regular`, or `roomy` —
 * from its position between the type's minimum, default, and maximum spans.
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
