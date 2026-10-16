/**
 * Every value the panel shows, and every value the bench hands a renderer, computed
 * through the wall's own functions.
 */
import { WALL_GRID_COLUMNS, WALL_GRID_MAX_ROWS, type WallWidget } from "@ts-ha/shared";
import type { DeviceDescriptor } from "../../types.js";
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
import { boundDeviceReadOnly, effectiveSpanDescriptor } from "../slim.js";
import {
  cardHeightPx,
  composesMinimumSpan,
  resolveCardFormForHeight,
  resolveSpanTier,
  type WallCardForm,
  type WallWidgetTier,
} from "../span.js";
import { WALL_HARNESS_FIXTURES } from "./fixtures.js";
import { HARNESS_PANEL_SIZES, type HarnessBenchControls, type HarnessPanel } from "./messages.js";

/**
 * A widget's bound device within a device set, or `undefined` when it binds none — the
 * same lookup the wall's own frame performs against the store.
 */
function boundDevice(
  widget: WallWidget,
  devices: Iterable<DeviceDescriptor>,
): DeviceDescriptor | undefined {
  const qualifiedId =
    typeof widget.config.qualifiedId === "string" ? widget.config.qualifiedId : "";
  if (qualifiedId.length === 0) return undefined;
  for (const device of devices) {
    if (device.qualifiedId === qualifiedId) return device;
  }
  return undefined;
}

/** The wall's own composition values for one widget at one panel. */
export interface HarnessWidgetValues {
  descriptor: WallWidgetDescriptor;
  /** What the wall passes as `contained` here — `wallFrameDrawsSurface(type, grammar, widget)`. */
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

/** The panel's resolved row unit for a widget list — the wall's own `wallGridMetrics`. */
export function panelRowUnit(widgets: readonly WallWidget[], panelHeightPx: number): number {
  return wallGridMetrics(panelHeightPx, widgets).rowUnit;
}

/** The panel size the stage document is laid out at. */
export function panelHeightPx(panel: HarnessPanel): number {
  return HARNESS_PANEL_SIZES[panel].height;
}

/**
 * Resolves every value the panel shows for one widget, through the wall's own functions.
 * `devices` is the same device set the stage's store receives, so a bound device toggled
 * absent degrades the panel's preview exactly as it degrades the wall.
 */
export function widgetValues(
  widget: WallWidget,
  rowUnit: number,
  devices: Iterable<DeviceDescriptor>,
): HarnessWidgetValues {
  const descriptor = getWidgetDescriptor(widget.type);
  // The effective minimum reads the widget's bound device in that set: a control-less one
  // resolves a single row, and a missing one degrades to the type's own minimum as the
  // frame's own resolver does.
  const effective = effectiveSpanDescriptor(
    descriptor,
    boundDeviceReadOnly(descriptor, boundDevice(widget, devices)),
  );
  const framed = wallFrameDrawsSurface(widget.type, descriptor.grammar, widget);
  const titled = widgetTitle(widget) !== null;
  const cellHeightPx = cardHeightPx({ rows: widget.h, rowUnit });
  const rendererHeightPx = rendererBoxHeightPx({ cellHeightPx, framed, titled });
  const minimumRendererHeightPx = minimumRendererBoxHeightPx({
    descriptor: effective,
    rowUnit,
    framed,
  });

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
      descriptor: effective,
      rendererHeightPx,
      minimumRendererHeightPx,
    }),
    min: descriptor.min,
    max: descriptor.max,
  };
}

/**
 * Whether the editor would author a `{w, h}` span for this widget, decided by the
 * editor's own placement rule against the fixture roster's devices.
 */
function editorAcceptsSpan(widget: WallWidget, w: number, h: number): boolean {
  const placed = updateWidgetPlacement(
    { widgets: [widget] },
    widget.id,
    { w, h, x: 0, y: 0 },
    undefined,
    WALL_HARNESS_FIXTURES.devices,
  );
  const next = placed.widgets[0];
  return next !== undefined && next.w === w && next.h === h;
}

/**
 * Every renderer-box height a legal placement of this widget's type produces at this
 * row unit.
 */
export function reachableRendererHeights(widget: WallWidget, rowUnit: number): readonly number[] {
  const descriptor = getWidgetDescriptor(widget.type);
  const titled = widgetTitle(widget) !== null;
  const heights = new Set<number>();

  for (let w = 1; w <= WALL_GRID_COLUMNS; w += 1) {
    for (let h = 1; h <= WALL_GRID_MAX_ROWS; h += 1) {
      if (!editorAcceptsSpan(widget, w, h)) continue;
      const framed = wallFrameDrawsSurface(widget.type, descriptor.grammar, { w, h });
      heights.add(
        rendererBoxHeightPx({ cellHeightPx: cardHeightPx({ rows: h, rowUnit }), framed, titled }),
      );
    }
  }

  return [...heights].sort((a, b) => a - b);
}

/**
 * The panel's bench overrides. A field left `null` falls back to the value the Stage
 * computes.
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
 * The editor's own fit verdict for the widget list this panel renders, at this panel —
 * `null` when it fits.
 */
export function panelFitSummary(
  widgets: readonly WallWidget[],
  panel: HarnessPanel,
): string | null {
  const preview = resolveDraftPreview({ widgets: [...widgets] }, HARNESS_PANEL_SIZES[panel]);
  return preview.fit === "tooLarge" ? preview.summary : null;
}
