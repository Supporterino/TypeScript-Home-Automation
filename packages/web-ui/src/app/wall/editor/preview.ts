/**
 * The editor's draft preview: a pure resolver that shows a draft composition as the
 * wall's target panel will.
 */
import { WALL_GRID_COLUMNS, type WallProfileConfig } from "@ts-ha/shared";
import { resolveBands } from "../bands.js";
import { widgetTitle } from "../frame.js";
import { WALL_GUTTER_MAX_PX, type WallFitOutcome, wallGridMetrics } from "../grid.js";
import { getWidgetDescriptor } from "../registry.js";
import { deviceGridIds, resolveDeviceGridPage } from "../widgets/device-grid-model.js";

/**
 * The wall's target panel, in CSS pixels — the panel the editor previews at.
 */
export const WALL_PANEL_WIDTH_PX = 1920;
export const WALL_PANEL_HEIGHT_PX = 1080;

/** A box in the panel's own pixel coordinates, from its top-left corner. */
export interface WallPreviewBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** One widget's wireframe cell. */
export interface WallPreviewWidget {
  readonly id: string;
  /** The type's label, so the wireframe names each cell without rendering a widget. */
  readonly label: string;
  /** The zone the widget declares, or `null`. */
  readonly zone: string | null;
  readonly box: WallPreviewBox;
}

/** One zone's wireframe band — the bounding box of the widgets that share it. */
export interface WallPreviewBand {
  readonly zone: string;
  readonly box: WallPreviewBox;
}

/** A device grid's page count, as the widget itself would present it. */
export interface WallPreviewGrid {
  readonly widgetId: string;
  /** How many devices the grid's selection holds. */
  readonly devices: number;
  /** How many pages that selection pages into at this panel's row unit. */
  readonly pages: number;
}

/** The draft's resolved preview. */
export interface WallDraftPreview {
  readonly panel: { readonly width: number; readonly height: number };
  /** The wall's resolved gutter, in panel pixels. */
  readonly gutter: number;
  /** The grid's resolved row unit for this panel, in CSS pixels. */
  readonly rowUnit: number;
  /** The grid's resolved column width, in panel pixels. */
  readonly columnWidth: number;
  /** Whether the draft fits the panel at the wall's floors. */
  readonly fit: WallFitOutcome;
  /** The composition's height and the panel's usable height, in CSS pixels. */
  readonly contentHeight: number;
  readonly usableHeight: number;
  readonly widgets: readonly WallPreviewWidget[];
  readonly bands: readonly WallPreviewBand[];
  readonly grids: readonly WallPreviewGrid[];
  /** The verdict the editor shows, and the reason a save is refused. */
  readonly summary: string;
}

/** The panel the editor previews against, unless a caller judges another one. */
export function wallTargetPanel(): { width: number; height: number } {
  return { width: WALL_PANEL_WIDTH_PX, height: WALL_PANEL_HEIGHT_PX };
}

/** The grid's column width inside a panel of `panelWidth`, in panel pixels. */
function columnWidthFor(panelWidth: number, gutter: number): number {
  return (panelWidth - 2 * gutter - (WALL_GRID_COLUMNS - 1) * gutter) / WALL_GRID_COLUMNS;
}

/** Maps a placement's cells to its box in the panel's pixel geometry. */
function cellBox(
  cell: { x: number; y: number; w: number; h: number },
  geometry: { gutter: number; columnWidth: number; rowUnit: number },
): WallPreviewBox {
  const { gutter, columnWidth, rowUnit } = geometry;
  return {
    left: gutter + cell.x * (columnWidth + gutter),
    top: gutter + cell.y * (rowUnit + gutter),
    width: cell.w * columnWidth + (cell.w - 1) * gutter,
    height: cell.h * rowUnit + (cell.h - 1) * gutter,
  };
}

/**
 * Resolves a draft's preview: the panel it is judged at, the fit verdict, the
 * wireframe's geometry, and each device grid's page count.
 */
export function resolveDraftPreview(
  config: WallProfileConfig,
  panel: { width: number; height: number } = wallTargetPanel(),
): WallDraftPreview {
  const widgets = config.widgets;
  const metrics = wallGridMetrics(panel.height, widgets);
  const geometry = {
    gutter: WALL_GUTTER_MAX_PX,
    columnWidth: columnWidthFor(panel.width, WALL_GUTTER_MAX_PX),
    rowUnit: metrics.rowUnit,
  };

  const previewWidgets: WallPreviewWidget[] = widgets.map((widget) => ({
    id: widget.id,
    label: getWidgetDescriptor(widget.type).label,
    zone: typeof widget.zone === "string" && widget.zone.length > 0 ? widget.zone : null,
    box: cellBox(widget, geometry),
  }));

  const bands: WallPreviewBand[] = resolveBands(widgets).map((band) => ({
    zone: band.zone,
    box: cellBox(band, geometry),
  }));

  const grids: WallPreviewGrid[] = widgets
    .filter((widget) => widget.type === "devices")
    .map((widget) => {
      const devices = deviceGridIds(widget.config);
      // The page count comes from the same rule the widget pages through.
      const page = resolveDeviceGridPage({
        ids: devices,
        span: widget,
        rowUnit: metrics.rowUnit,
        page: 0,
        titled: widgetTitle(widget) !== null,
      });
      return { widgetId: widget.id, devices: devices.length, pages: page.pageCount };
    });

  const panelLabel = `${panel.width} × ${panel.height}`;
  const summary =
    metrics.outcome === "fits"
      ? `Fits the ${panelLabel} panel: ${Math.round(metrics.contentHeight)} px of composition in ${Math.round(metrics.usableHeight)} px at the wall's floors.`
      : `Too large for the ${panelLabel} panel: ${Math.round(metrics.contentHeight)} px of composition in ${Math.round(metrics.usableHeight)} px at the wall's floors. Remove or resize a widget.`;

  return {
    panel,
    gutter: geometry.gutter,
    rowUnit: metrics.rowUnit,
    columnWidth: geometry.columnWidth,
    fit: metrics.outcome,
    contentHeight: metrics.contentHeight,
    usableHeight: metrics.usableHeight,
    widgets: previewWidgets,
    bands,
    grids,
    summary,
  };
}
