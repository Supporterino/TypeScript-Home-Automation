/**
 * Pure trigger-request builder for the wall scene-button widget (design.md D8;
 * specs/wall-display "Scene Buttons Trigger Automations"), plus the tile's
 * space-aware composition (wall-zones-and-fit D3, D4; specs/wall-display
 * "Span-Aware Card Presentation").
 *
 * A scene button stores an automation name and reuses the existing manual
 * trigger path; no scene model is introduced. The bound automation's first
 * declared trigger type is used so the request matches how the admin
 * interface triggers it, falling back to a valid default when the automation
 * is unknown (not yet loaded, or deleted) so the request body is never the
 * `400`-inducing unknown type. DOM-free and testable.
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
 * `--hearth-space-3`, the token the tile pads with.
 */
const SCENE_INSET_PX = 12;

/**
 * The scene glyph tile's side, in CSS pixels, on a tile with room — larger than
 * the wall's touch target, so a roomy card reads from further away. Declared here
 * because the stacked composition's budget is derived from it as well as drawn
 * with it.
 */
export const SCENE_LARGE_GLYPH_PX = 72;

/** The scene glyph's icon side, in CSS pixels, on a tile with room. */
export const SCENE_LARGE_GLYPH_SIZE = 36;

/** The gap between the scene glyph and its label, in CSS pixels — Hearth's `--hearth-space-2`. */
const SCENE_GAP_PX = 8;

/**
 * The scene label's line, in CSS pixels — the wall's label tier at the app's body
 * leading. The label never wraps (the wall's card label is one ellipsized line),
 * so a single line bounds both compositions.
 */
const SCENE_LABEL_LINE_PX = Math.ceil(WALL_TYPE_RAMP.label * 1.5);

/** The composition a scene tile draws at its placement (wall-zones-and-fit D3, D4). */
export type SceneTileLayout = "row" | "column";

/**
 * The scene tile's own minimum span — the registry's `scene.min`, declared here
 * because the tile resolves its own compositions and this module stays free of
 * the widget registry (whose import cycle would make a module-scope read a
 * temporal-dead-zone error, as `card-vocab.tsx` documents). `wall-scene-tile.test.ts`
 * asserts it against `WALL_WIDGET_REGISTRY.scene.min`.
 */
export const SCENE_MIN_SPAN: WallWidgetSpan = { w: 2, h: 2 };

/**
 * The height, in CSS pixels, the scene tile's row composition needs — the glyph
 * tile at the wall's touch target beside the label, inside the button's own
 * inset. This is the scene's *own* budget: a box at least this tall draws the row
 * without clipping it.
 */
export const SCENE_ROW_HEIGHT_PX =
  2 * SCENE_INSET_PX + Math.max(wallTileMetrics("wall").control, SCENE_LABEL_LINE_PX);

/**
 * The height, in CSS pixels, the scene tile's stacked composition needs — the
 * larger glyph tile above the label, inside the button's own inset. Likewise the
 * scene's own budget for its taller composition, derived from the parts it draws
 * rather than from the wall light card's much larger full form.
 */
export const SCENE_STACKED_HEIGHT_PX =
  2 * SCENE_INSET_PX + SCENE_LARGE_GLYPH_PX + SCENE_GAP_PX + SCENE_LABEL_LINE_PX;

/**
 * The scene tile's composition for `rendererHeightPx` — the height of the box the
 * renderer was actually given — and `placement`, the span it was placed at
 * (wall-zones-and-fit D3, D4; specs/wall-display "Span-Aware Card Presentation").
 *
 * The tile leads with its glyph beside the label in one row — the tile's original
 * anatomy — and centres the larger glyph over the label only on a card with room.
 * "Room" is two things, and both are the *scene's own*:
 *
 * - the box must hold the stacked composition ({@link SCENE_STACKED_HEIGHT_PX}),
 *   so a wide-but-short cell (a 4×2 or 6×2 scene) keeps the row and cannot clip;
 * - the placement must be larger than the type's own minimum span, so the
 *   minimum-span card never *pre-empts* the composition a larger span draws. The
 *   box alone cannot decide this for the scene: at the top of the row-unit range a
 *   two-row cell already affords the stacked budget (144 px against 131 px), so a
 *   box-only rule would draw the type's *minimum* span identically to every larger
 *   span — exactly what the "a card at a larger span MUST NOT repeat the
 *   composition it renders at a smaller span" requirement forbids. (The light
 *   card needs no such clause: its full budget is taller than any minimum-span
 *   cell can ever reach, so its box rule already implies it.)
 *
 * A box below even the row's budget cannot arise: the frame only lets a card
 * through whose box holds the box a minimum-span card gets
 * (`WidgetFrame`'s `composesMinimumSpan` over `frame.ts`'s
 * `minimumRendererBoxHeightPx`), and that minimum box — 96 px for this type at the
 * wall's floors — already holds the row. `wall-scene-tile.test.ts` asserts that
 * invariant, so the tile needs no third case. Whichever composition resolves, its
 * budget fits the box.
 */
export function sceneTileLayout(input: {
  rendererHeightPx: number;
  placement: WallWidgetSpan;
}): SceneTileLayout {
  if (input.rendererHeightPx >= SCENE_STACKED_HEIGHT_PX && exceedsMinimumSpan(input.placement)) {
    return "column";
  }
  return "row";
}

/** Whether a scene placement is larger than the type's minimum span on either axis. */
function exceedsMinimumSpan(placement: WallWidgetSpan): boolean {
  return placement.w > SCENE_MIN_SPAN.w || placement.h > SCENE_MIN_SPAN.h;
}
