/**
 * The wall's paged tile grid: draws one page of caller-supplied tiles with touch
 * page controls, so no wall widget ever scrolls.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import { WallCardActions, WallCardIconButton, WallCardLabel } from "../cards/card-anatomy.js";
import { WALL_CARD_GLYPH_SIZE } from "../cards/metrics.js";
import { resolvePagedTiles, WALL_CONTROL_GAP_PX, WALL_TILE_GAP_PX } from "../pages.js";
import type { WallWidgetSpan } from "../registry.js";

/**
 * The box a paged tile is drawn into: the height the page plan resolved for the
 * tile's row.
 */
export interface WallTileBox {
  /** The tile row's resolved height, in CSS pixels — the plan's `rowHeightPx`. */
  readonly heightPx: number;
}

export function PagedTileGrid<T>({
  items,
  keyOf,
  renderTile,
  span,
  rowUnit,
  reservedRows = 0,
  titled = false,
  label,
}: {
  /** The widget's tiles, in the order it presents them. */
  items: readonly T[];
  /** A stable key for a tile — the identifier a wall device card is addressed by. */
  keyOf: (item: T) => string;
  /**
   * The tile itself; the caller owns the card and resolves its composition from
   * the box it is handed.
   */
  renderTile: (item: T, box: WallTileBox) => ReactNode;
  span: WallWidgetSpan;
  rowUnit: number;
  /**
   * The grid rows the widget's own chrome consumes at the resolved row unit.
   */
  reservedRows?: number;
  /**
   * Whether the widget configures a title, which the plan reserves for.
   */
  titled?: boolean;
  /** What the controls page, for their accessible names — "devices", "favorites". */
  label: string;
}): ReactNode {
  const [requestedPage, setRequestedPage] = useState(0);
  const page = resolvePagedTiles({
    items,
    span,
    rowUnit,
    page: requestedPage,
    reservedRows,
    titled,
  });

  const tileBox: WallTileBox = { heightPx: page.rowHeightPx };

  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        minHeight: 0,
        flexDirection: "column",
        // The gap above the page-control row, at the value the plan reserved.
        gap: `${WALL_CONTROL_GAP_PX}px`,
      }}
    >
      {/* One page's tiles, on a uniform grid sized to the plan, clipped not scrollable. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${page.tilesAcross}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${page.rows}, ${page.rowHeightPx}px)`,
          // The inter-tile gap the plan packed the rows by.
          gap: `${WALL_TILE_GAP_PX}px`,
          alignContent: "center",
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {page.items.map((item) => (
          <div
            key={keyOf(item)}
            style={{ display: "grid", minWidth: 0, minHeight: 0, overflow: "hidden" }}
          >
            {renderTile(item, tileBox)}
          </div>
        ))}
      </div>

      {/* The page affordance, drawn only while the content pages. */}
      {page.pageCount > 1 && (
        <WallCardActions inset={false} distribution="distributed">
          <WallCardIconButton
            label={`Show the previous page of ${label}`}
            disabled={page.page === 0}
            onClick={() => setRequestedPage(page.page - 1)}
            glyph={<ChevronLeft size={WALL_CARD_GLYPH_SIZE} aria-hidden />}
          />
          <WallCardLabel>{`${page.page + 1} / ${page.pageCount}`}</WallCardLabel>
          <WallCardIconButton
            label={`Show the next page of ${label}`}
            disabled={page.page >= page.pageCount - 1}
            onClick={() => setRequestedPage(page.page + 1)}
            glyph={<ChevronRight size={WALL_CARD_GLYPH_SIZE} aria-hidden />}
          />
        </WallCardActions>
      )}
    </div>
  );
}
