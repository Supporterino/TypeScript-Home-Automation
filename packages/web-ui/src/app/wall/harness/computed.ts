/**
 * Every value the panel shows, and every value the bench hands a renderer,
 * computed through the wall's own functions (design.md D2, D7; tasks 5.3, 6.1,
 * 6.2).
 *
 * The harness re-implements no composition arithmetic: `cellHeightPx` is
 * `span.ts`'s `cardHeightPx`, the renderer's box is `frame.ts`'s
 * `rendererBoxHeightPx`, the tier is `span.ts`'s `resolveSpanTier`, the form is
 * `resolveCardFormForHeight`, the row unit is `grid.ts`'s `wallGridMetrics`, and
 * "could the editor author this span?" is `editor/model.ts`'s
 * `updateWidgetPlacement` — the same call the editor's own resize control makes,
 * so a span the editor would clamp is clamped here too. This module is pure, so
 * the whole derivation is reachable by `bun test` without a DOM.
 *
 * `WidgetFrame` resolves the same chain for the wall it renders; this module is
 * the panel's and the bench's view of it, and `tests/wall-harness-panel.test.ts`
 * asserts the two agree.
 */
import { WALL_GRID_COLUMNS, WALL_GRID_MAX_ROWS, type WallWidget } from "@ts-ha/shared";
import { updateWidgetPlacement } from "../editor/model.js";
import { resolveDraftPreview } from "../editor/preview.js";
import {
  minimumRendererBoxHeightPx,
  rendererBoxHeightPx,
  wallFrameDrawsSurface,
  widgetTitle,
} from "../frame.js";
import { wallGridMetrics } from "../grid.js";
import { getWidgetDescriptor, type WallWidgetDescriptor } from "../registry.js";
import {
  cardHeightPx,
  composesMinimumSpan,
  resolveCardFormForHeight,
  resolveSpanTier,
  type WallCardForm,
  type WallWidgetTier,
} from "../span.js";
import { HARNESS_PANEL_SIZES, type HarnessBenchControls, type HarnessPanel } from "./messages.js";

/** The wall's own composition values for one widget at one panel (tasks 5.3, 6.1). */
export interface HarnessWidgetValues {
  descriptor: WallWidgetDescriptor;
  /** The wall's `contained` for this type — `wallFrameDrawsSurface(type, grammar)` (D2). */
  framed: boolean;
  titled: boolean;
  /** The widget's cell height, in CSS pixels — `cardHeightPx({ rows: h, rowUnit })`. */
  cellHeightPx: number;
  /** The height the renderer's own box gets — `rendererBoxHeightPx(...)`. */
  rendererHeightPx: number;
  tier: WallWidgetTier;
  cardForm: WallCardForm;
  /** The box a minimum-span card of this type is guaranteed — the below-minimum floor. */
  minimumRendererHeightPx: number;
  /** Whether the placement cannot render the card its type's minimum span guarantees. */
  tooSmall: boolean;
  /** The type's registry placement bounds, for the panel's hints. */
  min: { w: number; h: number };
  max: { w: number; h: number };
}

/** The panel's resolved row unit for a widget list — the wall's own `wallGridMetrics` (D2). */
export function panelRowUnit(widgets: readonly WallWidget[], panelHeightPx: number): number {
  return wallGridMetrics(panelHeightPx, widgets).rowUnit;
}

/** The panel size the stage document is laid out at (D3). */
export function panelHeightPx(panel: HarnessPanel): number {
  return HARNESS_PANEL_SIZES[panel].height;
}

/** Resolves every value the panel shows for one widget, through the wall's own functions. */
export function widgetValues(widget: WallWidget, rowUnit: number): HarnessWidgetValues {
  const descriptor = getWidgetDescriptor(widget.type);
  const framed = wallFrameDrawsSurface(widget.type, descriptor.grammar);
  const titled = widgetTitle(widget) !== null;
  const cellHeightPx = cardHeightPx({ rows: widget.h, rowUnit });
  const rendererHeightPx = rendererBoxHeightPx({ cellHeightPx, framed, titled });
  const minimumRendererHeightPx = minimumRendererBoxHeightPx({ descriptor, rowUnit, framed });

  return {
    descriptor,
    framed,
    titled,
    cellHeightPx,
    rendererHeightPx,
    tier: resolveSpanTier(widget, descriptor),
    cardForm: resolveCardFormForHeight(rendererHeightPx),
    minimumRendererHeightPx,
    tooSmall: !composesMinimumSpan({
      placement: widget,
      descriptor,
      rendererHeightPx,
      minimumRendererHeightPx,
    }),
    min: descriptor.min,
    max: descriptor.max,
  };
}

/**
 * Whether the editor would author a `{w, h}` span for this widget. Decided by the
 * editor's own placement rule — its clamping is the test — so a span below the
 * type's minimum, above its maximum, or under a titled card's raised floor is
 * not reachable, with no bounds re-declared here.
 */
function editorAcceptsSpan(widget: WallWidget, w: number, h: number): boolean {
  const placed = updateWidgetPlacement({ widgets: [widget] }, widget.id, { w, h, x: 0, y: 0 });
  const next = placed.widgets[0];
  return next !== undefined && next.w === w && next.h === h;
}

/**
 * Every renderer-box height a legal placement of this widget's type produces at
 * this row unit (task 6.2). The candidate spans cover the whole grid and the
 * editor's own rule decides which of them are legal, so the set is exact for the
 * panel the bench is judged at — which is what makes a hand-set height that no
 * placement produces visibly unreachable rather than merely unusual.
 */
export function reachableRendererHeights(widget: WallWidget, rowUnit: number): readonly number[] {
  const descriptor = getWidgetDescriptor(widget.type);
  const framed = wallFrameDrawsSurface(widget.type, descriptor.grammar);
  const titled = widgetTitle(widget) !== null;
  const heights = new Set<number>();

  for (let w = 1; w <= WALL_GRID_COLUMNS; w += 1) {
    for (let h = 1; h <= WALL_GRID_MAX_ROWS; h += 1) {
      if (!editorAcceptsSpan(widget, w, h)) continue;
      heights.add(
        rendererBoxHeightPx({ cellHeightPx: cardHeightPx({ rows: h, rowUnit }), framed, titled }),
      );
    }
  }

  return [...heights].sort((a, b) => a - b);
}

/**
 * The panel's bench overrides (design.md D7; tasks 6.1, 6.2). A field left `null`
 * falls back to the value the Stage computes, so the bench opens agreeing with
 * the stage, a hand-set field is always shown *beside* that value, and one click
 * puts every field back (D7's mitigation).
 */
export interface HarnessBenchOverrides {
  contained: boolean | null;
  tier: WallWidgetTier | null;
  cardForm: WallCardForm | null;
  rendererHeightPx: number | null;
  rowUnit: number | null;
}

/** No overrides: every bench input is the Stage-computed value. */
export const NO_BENCH_OVERRIDES: HarnessBenchOverrides = {
  contained: null,
  tier: null,
  cardForm: null,
  rendererHeightPx: null,
  rowUnit: null,
};

/** Resolves the bench's inputs from the selected widget's Stage values and the panel's overrides. */
export function resolveBenchControls(
  widget: WallWidget | null,
  values: HarnessWidgetValues | null,
  rowUnit: number,
  overrides: HarnessBenchOverrides,
): HarnessBenchControls {
  return {
    widget,
    contained: overrides.contained ?? values?.framed ?? true,
    tier: overrides.tier ?? values?.tier ?? "regular",
    cardForm: overrides.cardForm ?? values?.cardForm ?? "full",
    rendererHeightPx: overrides.rendererHeightPx ?? values?.rendererHeightPx ?? 0,
    rowUnit: overrides.rowUnit ?? rowUnit,
  };
}

/**
 * The editor's own fit verdict for the widget list this panel renders, at this
 * panel — `null` when it fits. The preview resolver is the editor's, so the panel
 * reports a refusal in the editor's words rather than in a second opinion;
 * passing the panel's own size is what makes the verdict true for the panel the
 * developer is looking at rather than for the wall's reference panel (tasks 5.1,
 * 6.2).
 */
export function panelFitSummary(
  widgets: readonly WallWidget[],
  panel: HarnessPanel,
): string | null {
  const preview = resolveDraftPreview({ widgets: [...widgets] }, HARNESS_PANEL_SIZES[panel]);
  return preview.fit === "tooLarge" ? preview.summary : null;
}
