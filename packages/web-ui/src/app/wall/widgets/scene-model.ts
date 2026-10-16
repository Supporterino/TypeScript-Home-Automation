/**
 * Pure trigger-request builder for the wall scene-button widget, plus the tile's
 * space-aware composition.
 */
import type { Automation, TriggerContext } from "../../types.js";
import type { WallWidgetSpan } from "../registry.js";
import { wallTileMetrics } from "../scale.js";
import { WALL_TYPE_RAMP } from "../type-ramp.js";

/** The trigger type used when the bound automation's own type cannot be resolved. */
export const DEFAULT_MANUAL_TRIGGER_TYPE: TriggerContext["type"] = "cron";

export interface SceneTriggerRequest {
  /** The automation to trigger. */
  name: string;
  /** The manual trigger type resolved from the bound automation, or the default. */
  type: TriggerContext["type"];
}

/** Resolves the manual-trigger request a scene button issues. */
export function sceneTriggerRequest(
  automationName: string,
  automations: readonly Automation[],
): SceneTriggerRequest {
  const automation = automations.find((candidate) => candidate.name === automationName);
  return {
    name: automationName,
    type: automation?.triggers[0]?.type ?? DEFAULT_MANUAL_TRIGGER_TYPE,
  };
}

/**
 * The scene button's own inset, in CSS pixels per side — Hearth's
 * `--hearth-space-3`, the token the framed tile pads with.
 */
const SCENE_INSET_PX = 12;

/** The framed scene button's own inset, as the Hearth token it pads with. */
const SCENE_INSET = "var(--hearth-space-3)";

/**
 * The compact one-row tile's inset, as a CSS length: the whole cell is the button,
 * so the chrome-less composition draws flush.
 */
const SCENE_COMPACT_INSET = "0px";

/**
 * The scene glyph tile's side, in CSS pixels, on a tile with room — larger than the
 * wall's touch target.
 */
export const SCENE_LARGE_GLYPH_PX = 72;

/** The scene glyph's icon side, in CSS pixels, on a tile with room. */
export const SCENE_LARGE_GLYPH_SIZE = 36;

/** The gap between the scene glyph and its label, in CSS pixels — Hearth's `--hearth-space-2`. */
const SCENE_GAP_PX = 8;

/**
 * The scene label's line, in CSS pixels — the wall's label tier at the app's body
 * leading.
 */
const SCENE_LABEL_LINE_PX = Math.ceil(WALL_TYPE_RAMP.label * 1.5);

/**
 * The composition a scene tile draws at its placement: the chrome-less one-row
 * `compact` form, the framed `row`, and the framed `column` stack.
 */
export type SceneTileLayout = "compact" | "row" | "column";

/**
 * The scene tile's own minimum span — the registry's `scene.min`, declared here to
 * keep this module free of the widget registry.
 */
export const SCENE_MIN_SPAN: WallWidgetSpan = { w: 2, h: 1 };

/**
 * The height, in CSS pixels, the scene tile's compact one-row composition needs: the
 * glyph tile at the wall's touch target beside the label, with no button inset. The
 * whole one-row cell is the button, so this is what must fit its height.
 */
export const SCENE_COMPACT_HEIGHT_PX = Math.max(
  wallTileMetrics("wall").control,
  SCENE_LABEL_LINE_PX,
);

/**
 * The height, in CSS pixels, the scene tile's framed row composition needs: the glyph
 * tile at the wall's touch target beside the label, inside the button's inset.
 */
export const SCENE_ROW_HEIGHT_PX = 2 * SCENE_INSET_PX + SCENE_COMPACT_HEIGHT_PX;

/**
 * The height, in CSS pixels, the scene tile's stacked composition needs: the larger
 * glyph tile above the label, inside the button's inset.
 */
export const SCENE_STACKED_HEIGHT_PX =
  2 * SCENE_INSET_PX + SCENE_LARGE_GLYPH_PX + SCENE_GAP_PX + SCENE_LABEL_LINE_PX;

/**
 * The inset a scene tile draws with: the framed tile pads by its own inset, the
 * compact one-row form draws flush so the whole cell is the scene's touch target.
 */
export function sceneTileInset(layout: SceneTileLayout): string {
  return layout === "compact" ? SCENE_COMPACT_INSET : SCENE_INSET;
}

/**
 * The scene tile's composition for `rendererHeightPx` and `placement`: a placement at
 * the type's one-row minimum composes the chrome-less compact form; above it the
 * framed tile returns, the stacked form only on a box with room.
 */
export function sceneTileLayout(input: {
  rendererHeightPx: number;
  placement: WallWidgetSpan;
}): SceneTileLayout {
  if (input.placement.h <= SCENE_MIN_SPAN.h) return "compact";
  if (input.rendererHeightPx >= SCENE_STACKED_HEIGHT_PX) return "column";
  return "row";
}
