/**
 * Wall zone bands (wall-zones-and-fit D2; specs/wall-display "Wall Zones",
 * "Widget Grid Layout"). A zone is an additive label on the flat grid: the
 * widgets that share a `zone` render inside one labelled band drawn behind
 * them, and grouping never changes a widget's authored placement.
 *
 * This module owns the pure grouping, so the wall grid and the editor's draft
 * preview resolve zones from one rule. It is deliberately dependency-free (no
 * React, no DOM) so the grouping is reachable by `bun test`.
 */
import type { WallWidget } from "@ts-ha/shared";

/**
 * One zone's bounding box on the wall grid, in cells (design.md D2) — the same
 * cell space {@link WallWidget} is placed in, so the band can be drawn at the
 * members' grid placement without further arithmetic.
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
 * first-appearance order so a profile's bands are stable across renders and
 * match the authored widget order.
 *
 * The band is the bounding box of its members, so a disjoint zone — the same
 * label at two unrelated regions — yields one band spanning both. That is
 * accepted for scope (band selection is the author's, surfaced by the editor's
 * preview); see design.md D2. A widget that declares no zone — and a blank
 * label, which the shared schema already rejects — renders outside every band
 * and contributes to none.
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
