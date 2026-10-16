/**
 * Pure selection and pagination for the wall device grid, through the wall's shared
 * pagination layer.
 */
import { resolvePagedTiles } from "../pages.js";
import type { WallWidgetSpan } from "../registry.js";

/**
 * The devices a device grid's config selects, in authored order: non-empty
 * identifiers, each kept once.
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

/** One rendered page of a device grid. */
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
 * Resolves the page a device grid draws, through the shared pagination layer.
 */
export function resolveDeviceGridPage(input: {
  readonly ids: readonly string[];
  readonly span: WallWidgetSpan;
  readonly rowUnit: number;
  readonly page: number;
  /**
   * Whether the widget configures a title — the only chrome the grid reserves
   * beyond the frame's own.
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
