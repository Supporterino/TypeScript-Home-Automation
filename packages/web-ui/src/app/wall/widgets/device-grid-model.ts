/**
 * Pure selection and pagination for the wall device grid (wall-zones-and-fit
 * D12; specs/wall-display "Device Grid Widget", "Panel Fit"). A device grid's
 * device set is the one the author selected explicitly; this module turns that
 * selection into the page the renderer draws and the page count the editor
 * reports — through the wall's shared pagination layer (`wall/pages.ts`), so the
 * device grid, the favorites grid, and the room grid page by the same rule and
 * the wall and the editor cannot disagree about how many pages a selection
 * implies. Kept dependency-free (no React, no DOM) so it stays reachable by
 * `bun test`.
 */
import { resolvePagedTiles } from "../pages.js";
import type { WallWidgetSpan } from "../registry.js";

/**
 * The devices a device grid's config selects, in authored order. A value that is
 * not a list of non-empty strings yields no selection, and a repeated identifier
 * is kept once — a device cannot be drawn twice, and a duplicate would collide
 * with a tile's React key.
 */
export function deviceGridIds(config: Record<string, unknown>): readonly string[] {
  const value: unknown = config.qualifiedIds;
  if (!Array.isArray(value)) return [];
  const entries: unknown[] = value;

  const seen = new Set<string>();
  const ids: string[] = [];
  for (const entry of entries) {
    if (typeof entry !== "string") continue;
    const id = entry.trim();
    if (id.length === 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** One rendered page of a device grid (design.md D12). */
export interface DeviceGridPage {
  /** The identifiers this page draws, in selection order. */
  readonly ids: readonly string[];
  /** The clamped page index this page is (`0`-based). */
  readonly page: number;
  /** How many pages the selection occupies; `0` for an empty selection. */
  readonly pageCount: number;
  /** The tile grid's column count — how many tiles a page row holds. */
  readonly tilesAcross: number;
  /** The tile grid's row count for this page's tiles. */
  readonly rows: number;
  /** How many tiles one page presents. */
  readonly tilesPerPage: number;
}

/**
 * Resolves the page a device grid draws, through the shared pagination layer
 * (design.md D5, D12; specs/wall-display "Panel Fit"). A device grid draws no
 * chrome above its tiles, so its plan reserves nothing beyond the frame's own —
 * its inset, and its title when the widget configures one.
 */
export function resolveDeviceGridPage(input: {
  readonly ids: readonly string[];
  readonly span: WallWidgetSpan;
  readonly rowUnit: number;
  readonly page: number;
  /**
   * Whether the widget configures a title. The grid draws no chrome of its own, so
   * this is the only thing it reserves beyond the shared layer's own frame chrome —
   * and the editor's preview passes the same flag, so the page count it reports is
   * the one the wall draws (wall-zones-and-fit D3, D4).
   */
  readonly titled?: boolean;
  readonly gutterPx?: number;
}): DeviceGridPage {
  const page = resolvePagedTiles({
    items: input.ids,
    span: input.span,
    rowUnit: input.rowUnit,
    page: input.page,
    titled: input.titled,
    gutterPx: input.gutterPx,
  });

  return {
    ids: page.items,
    page: page.page,
    pageCount: page.pageCount,
    tilesAcross: page.tilesAcross,
    rows: page.rows,
    tilesPerPage: page.tilesPerPage,
  };
}
