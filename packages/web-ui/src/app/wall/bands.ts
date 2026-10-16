/**
 * Wall zone bands: a zone is an additive label, so the widgets sharing a `zone`
 * render inside one labelled band drawn behind them.
 */
import type { WallWidget } from "@ts-ha/shared";

/**
 * One zone's bounding box on the wall grid, in cells.
 */
export interface WallBand {
  /** The zone label the band carries. */
  readonly zone: string;
  /** The band's left/top cell and span: the bounding box of its members. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Groups widgets by `zone` and returns each zone's bounding box, in
 * first-appearance order. A disjoint label yields one band spanning both.
 */
export function resolveBands(widgets: readonly WallWidget[]): readonly WallBand[] {
  const bands = new Map<string, WallBand>();

  for (const widget of widgets) {
    const zone = widget.zone?.trim();
    if (!zone) continue;

    const band = bands.get(zone);
    if (!band) {
      bands.set(zone, { zone, x: widget.x, y: widget.y, w: widget.w, h: widget.h });
      continue;
    }

    const x = Math.min(band.x, widget.x);
    const y = Math.min(band.y, widget.y);
    const right = Math.max(band.x + band.w, widget.x + widget.w);
    const bottom = Math.max(band.y + band.h, widget.y + widget.h);
    bands.set(zone, { zone, x, y, w: right - x, h: bottom - y });
  }

  return [...bands.values()];
}
