/**
 * The wall's paged tile grid (wall-zones-and-fit D5, D12; specs/wall-display
 * "Panel Fit", "Widget Catalog"). A wall widget whose own content can exceed the
 * span it was placed at pages it rather than overflowing or scrolling: one page at
 * a time, on a uniform grid, with touch page controls — so no wall widget ever
 * scrolls. The page plan comes from the shared pure pagination layer
 * (`wall/pages.ts`), which the device grid, the favorites grid, and the room grid
 * all resolve through, so they page by one rule.
 *
 * The tiles themselves are supplied by the caller, so each widget keeps its own
 * single-sourced card (`WallDeviceCard`, the tile's own device class), its own
 * ordering, and its own empty and absent cases.
 *
 * A tile row is drawn at the height the plan resolved — the tile's own cell
 * bounded against inflation ({@link WallPagePlan.rowHeightPx}; design.md D4;
 * specs/wall-display "Paged Tile Sizing") — rather than stretched to the widget's
 * leftover height, so the rows the wall draws are the rows the plan resolved and
 * the widget centres the space it does not need. Each tile is handed that box
 * through `renderTile` (design.md D7), so the caller resolves the card's
 * composition from the box the tile is actually drawn in.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import { resolvePagedTiles } from "../pages.js";
import type { WallWidgetSpan } from "../registry.js";
import { WallButton, WallCardAffordance, WallCardLabel, wallControlGapPx } from "./card-vocab.js";

/**
 * The box a paged tile is drawn into (design.md D4, D7; specs/wall-display
 * "Paged Tile Sizing"): the height the page plan resolved for the tile's row,
 * handed to the caller through {@link PagedTileGrid}'s `renderTile` so the tile
 * composes for the box it is drawn in — in every widget that pages — rather than
 * for the widget that surrounds it.
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
   * the box it is handed (design.md D7). The box is the height the plan drew the
   * tile's row at, so the caller's card composes for the box it is drawn in.
   */
  renderTile: (item: T, box: WallTileBox) => ReactNode;
  span: WallWidgetSpan;
  rowUnit: number;
  /**
   * The grid rows the widget's own chrome — whatever it draws above the tiles,
   * such as its header and count — consumes at the resolved row unit, so the page
   * never promises a tile row the card cannot show.
   */
  reservedRows?: number;
  /**
   * Whether the widget configures a title. The frame draws it inside the same cell
   * above the renderer, so the plan reserves it too — otherwise a titled card's
   * tile rows would be squeezed under the compact budget the minimum spans are
   * derived against (wall-zones-and-fit D3, D4).
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
        gap: `${wallControlGapPx()}px`,
      }}
    >
      {/* One page's tiles, on a uniform grid sized to the plan: each row is drawn
          at the height the plan resolved for the tile's own cell, and the block is
          centred in the space the widget's leftover height provides rather than
          stretched into it (specs/wall-display "Paged Tile Sizing"). The area is
          clipped rather than scrollable, so the wall never scrolls (specs/
          wall-display "Panel Fit"). */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${page.tilesAcross}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${page.rows}, ${page.rowHeightPx}px)`,
          gap: `${wallControlGapPx()}px`,
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

      {/* The page affordance, drawn only while the content pages. Each control is
          a touch-sized Hearth affordance, operable without hovering. */}
      {page.pageCount > 1 && (
        <WallCardAffordance>
          <WallButton
            label={`Show the previous page of ${label}`}
            disabled={page.page === 0}
            onClick={() => setRequestedPage(page.page - 1)}
          >
            <ChevronLeft size={20} aria-hidden />
          </WallButton>
          <WallCardLabel>{`${page.page + 1} / ${page.pageCount}`}</WallCardLabel>
          <WallButton
            label={`Show the next page of ${label}`}
            disabled={page.page >= page.pageCount - 1}
            onClick={() => setRequestedPage(page.page + 1)}
          >
            <ChevronRight size={20} aria-hidden />
          </WallButton>
        </WallCardAffordance>
      )}
    </div>
  );
}
