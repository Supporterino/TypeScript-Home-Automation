import { describe, expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  resolveCardFormForBox,
  resolveDeviceCardComposition,
  WALL_CARD_FULL_HEIGHT_PX,
  WALL_CARD_REGULAR_HEIGHT_PX,
} from "../src/app/wall/cards/card-composition.js";
import { WALL_CARD_METRICS } from "../src/app/wall/cards/metrics.js";
import {
  ROW_UNIT_MAX,
  ROW_UNIT_MIN,
  WALL_COMPACT_CARD_HEIGHT_PX,
  WALL_GUTTER_MAX_PX,
  WALL_GUTTER_MIN_PX,
} from "../src/app/wall/grid.js";
import {
  resolvePagedTiles,
  resolvePages,
  WALL_FRAME_INSET_PX,
  WALL_FRAME_RESERVED_PX,
  WALL_FRAME_TITLE_ROWS,
  WALL_PAGE_RESERVED_PX,
  WALL_TILE_CELL_COLUMNS,
  WALL_TILE_CELL_ROWS,
  WALL_TILE_GAP_PX,
} from "../src/app/wall/pages.js";
import { WALL_MIN_TOUCH_TARGET, WALL_WIDGET_REGISTRY } from "../src/app/wall/registry.js";
import {
  cardHeightPx,
  resolveCardFormForHeight,
  resolveSpanTier,
  WALL_TITLE_BLOCK_PX,
  WALL_TITLE_ROWS,
} from "../src/app/wall/span.js";

/**
 * Wall pagination: a widget whose content cannot fit its span pages rather than
 * scrolling. The page plan is pure; the widgets' wiring is asserted structurally.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");

/** The wall types that page their own content through `wall/pages.ts`. */
const TYPES = ["devices", "favorites", "room"] as const;
const WIDGETS = join(APP_DIR, "wall/widgets");
const FAVORITES = join(WIDGETS, "FavoritesWidget.tsx");
const ROOM = join(WIDGETS, "RoomWidget.tsx");
const DEVICES = join(WIDGETS, "DeviceGridWidget.tsx");

/** Removes block and line comments so prose is not mistaken for markup. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function source(path: string): Promise<string> {
  return stripComments(await readFile(path, "utf8"));
}

/** The favorites type's own spans — the smallest and largest a favorites grid is placed at. */
const FAVORITES_SPAN = WALL_WIDGET_REGISTRY.favorites.defaults;
const FAVORITES_MIN = WALL_WIDGET_REGISTRY.favorites.min;
const FAVORITES_MAX = WALL_WIDGET_REGISTRY.favorites.max;

/** The grid rows the favorites card draws above its tiles, as its widget reserves them. */
const FAVORITES_HEADER_ROWS = 2;

function items(count: number): readonly string[] {
  return Array.from({ length: count }, (_, index) => `tile-${index}`);
}

describe("resolvePagedTiles", () => {
  it("keeps content that fits its span on one page", () => {
    const plan = resolvePagedTiles({
      items: items(3),
      span: FAVORITES_SPAN,
      rowUnit: ROW_UNIT_MIN,
      page: 0,
      reservedRows: FAVORITES_HEADER_ROWS,
    });

    expect(plan.tilesPerPage).toBeGreaterThanOrEqual(3);
    expect(plan.pageCount).toBe(1);
    expect(plan.page).toBe(0);
    expect(plan.items).toEqual(items(3));
    expect(plan.tilesAcross).toBeGreaterThanOrEqual(1);
    expect(plan.rows).toBeGreaterThanOrEqual(1);
  });

  it("pages content larger than its span", () => {
    const plan = resolvePagedTiles({
      items: items(24),
      span: FAVORITES_SPAN,
      rowUnit: ROW_UNIT_MIN,
      page: 0,
      reservedRows: 2,
    });

    expect(plan.tilesPerPage).toBeGreaterThan(0);
    expect(plan.pageCount).toBe(Math.ceil(24 / plan.tilesPerPage));
    expect(plan.pageCount).toBeGreaterThan(1);
    expect(plan.items).toEqual(items(plan.tilesPerPage));
  });

  it("presents every item exactly once across its pages", () => {
    const all = items(11);
    const first = resolvePagedTiles({
      items: all,
      span: FAVORITES_SPAN,
      rowUnit: ROW_UNIT_MIN,
      page: 0,
      reservedRows: 2,
    });

    const seen: string[] = [];
    for (let page = 0; page < first.pageCount; page += 1) {
      seen.push(
        ...resolvePagedTiles({
          items: all,
          span: FAVORITES_SPAN,
          rowUnit: ROW_UNIT_MIN,
          page,
          reservedRows: 2,
        }).items,
      );
    }

    expect(seen).toEqual(all);
  });

  it("clamps a page past the last one onto the last page", () => {
    const plan = resolvePagedTiles({
      items: items(24),
      span: FAVORITES_SPAN,
      rowUnit: ROW_UNIT_MIN,
      page: 99,
      reservedRows: 2,
    });

    expect(plan.page).toBe(plan.pageCount - 1);
    expect(plan.items.length).toBeGreaterThan(0);
  });

  it("reserves the chrome the widget draws above its tiles", () => {
    const withoutHeader = resolvePagedTiles({
      items: items(24),
      span: FAVORITES_MAX,
      rowUnit: ROW_UNIT_MIN,
      page: 0,
    });
    const withHeader = resolvePagedTiles({
      items: items(24),
      span: FAVORITES_MAX,
      rowUnit: ROW_UNIT_MIN,
      page: 0,
      reservedRows: FAVORITES_HEADER_ROWS,
    });

    // The header's rows are held back in every plan, so a page never promises a
    // tile row the card cannot show.
    expect(withHeader.tilesPerPage).toBeLessThan(withoutHeader.tilesPerPage);
  });

  it("reserves the page-control row only while the content pages", () => {
    const headerPx = FAVORITES_HEADER_ROWS * ROW_UNIT_MIN;
    // The plan a paging grid resolves for one item: nothing is held back for a
    // control that is not drawn.
    const withoutPageChrome = resolvePages({
      span: FAVORITES_MAX,
      count: 40,
      rowUnit: ROW_UNIT_MIN,
      reservedPx: headerPx,
    });
    const onePage = resolvePagedTiles({
      items: items(1),
      span: FAVORITES_MAX,
      rowUnit: ROW_UNIT_MIN,
      page: 0,
      reservedRows: FAVORITES_HEADER_ROWS,
    });
    const pages = resolvePagedTiles({
      items: items(40),
      span: FAVORITES_MAX,
      rowUnit: ROW_UNIT_MIN,
      page: 0,
      reservedRows: FAVORITES_HEADER_ROWS,
    });

    expect(onePage.pageCount).toBe(1);
    expect(onePage.tilesPerPage).toBe(withoutPageChrome.tilesPerPage);
    expect(pages.pageCount).toBeGreaterThan(1);
    expect(pages.tilesPerPage).toBeLessThan(withoutPageChrome.tilesPerPage);
    expect(WALL_PAGE_RESERVED_PX).toBeGreaterThan(0);
  });

  it("reads a row unit below the wall's floor as the floor", () => {
    const unmeasured = resolvePagedTiles({
      items: items(4),
      span: FAVORITES_SPAN,
      rowUnit: 0,
      page: 0,
      reservedRows: 2,
    });
    const atFloor = resolvePagedTiles({
      items: items(4),
      span: FAVORITES_SPAN,
      rowUnit: ROW_UNIT_MIN,
      page: 0,
      reservedRows: 2,
    });

    expect(unmeasured).toEqual(atFloor);
  });

  it("reports no page for an empty set", () => {
    const plan = resolvePagedTiles({
      items: [],
      span: FAVORITES_SPAN,
      rowUnit: ROW_UNIT_MIN,
      page: 0,
    });

    expect(plan.pageCount).toBe(0);
    expect(plan.items).toEqual([]);
  });

  it("holds one tile per tile cell at the type's minimum span", () => {
    // A three-column favorites card holds a single tile across — the tile is the
    // device card's own minimum span.
    const plan = resolvePagedTiles({
      items: items(6),
      span: FAVORITES_MIN,
      rowUnit: ROW_UNIT_MIN,
      page: 0,
      reservedRows: FAVORITES_HEADER_ROWS,
    });

    expect(plan.tilesAcross).toBe(1);
    expect(plan.pageCount).toBeGreaterThan(1);
  });
});

describe("the favorites grid", () => {
  it("pages its tiles rather than scrolling them", async () => {
    const widget = await source(FAVORITES);

    expect(widget).toContain("<PagedTileGrid");
    expect(widget).toContain("items={devices}");
    // The header it draws above the tiles is reserved in the plan.
    expect(widget).toContain("reservedRows={FAVORITES_HEADER_ROWS}");
    expect(widget).not.toContain("overflowY");
    expect(widget).not.toContain("auto-fit");
  });

  it("keeps its tiles and its empty case", async () => {
    const widget = await source(FAVORITES);

    expect(widget).toContain("WallDeviceCard");
    expect(widget).toContain("contained={contained}");
    expect(widget).toContain("WallCardMessage");
    expect(widget).toContain("favoriteDevices(favorites, devicesByQualifiedId)");
  });
});

describe("the paged tiles compose for the box the grid hands them", () => {
  it("hands each host's card the box the grid drew its tile in", async () => {
    for (const path of [ROOM, FAVORITES, DEVICES]) {
      const widget = await source(path);

      // A paged tile is handed the tile's own cell — the plan's row height and the
      // tile's cell width — so it composes for the box it is drawn in.
      expect(widget, path).toContain("WallDeviceCard");
      expect(widget, path).toContain("wallTileCardBox(rowUnit, box.heightPx)");
      expect(widget, path).not.toContain("tier={tier}");
      expect(widget, path).not.toContain("cardForm={cardForm}");
    }
  });

  it("composes the ported compact card for a paged tile at any legal row unit", () => {
    // The plan bounds a tile row at 1.25× the tile's cell, and the cell at the floors
    // is exactly the compact budget — so a paged tile always composes the compact card.
    const short = resolvePages({
      span: WALL_WIDGET_REGISTRY.devices.min,
      count: 1,
      rowUnit: ROW_UNIT_MIN,
      gutterPx: WALL_GUTTER_MIN_PX,
      reservedPx: WALL_FRAME_RESERVED_PX,
    });
    expect(short.rowHeightPx).toBeGreaterThanOrEqual(WALL_COMPACT_CARD_HEIGHT_PX);
    expect(resolveCardFormForBox(short.rowHeightPx)).toBe("compact");

    const tall = resolvePages({
      span: WALL_WIDGET_REGISTRY.room.min,
      count: 4,
      rowUnit: ROW_UNIT_MAX,
      gutterPx: WALL_GUTTER_MIN_PX,
      reservedPx: WALL_FRAME_RESERVED_PX + 3 * ROW_UNIT_MAX,
    });
    expect(tall.rowHeightPx).toBeGreaterThanOrEqual(WALL_COMPACT_CARD_HEIGHT_PX);
    expect(tall.rowHeightPx).toBeLessThan(WALL_CARD_REGULAR_HEIGHT_PX);
    expect(resolveCardFormForBox(tall.rowHeightPx)).toBe("compact");
  });

  it("composes a lighter form in a short host-tile box than the same card in a tall box", () => {
    // The same card in the box a paging host hands its tile versus the box a placed
    // widget gets: the box, not the widget, decides the composition.
    const widthPx = WALL_TILE_CELL_COLUMNS * ROW_UNIT_MIN;
    const hostTilePx = resolvePages({
      span: WALL_WIDGET_REGISTRY.devices.min,
      count: 1,
      rowUnit: ROW_UNIT_MIN,
      gutterPx: WALL_GUTTER_MIN_PX,
      reservedPx: WALL_FRAME_RESERVED_PX,
    }).rowHeightPx;

    const hostTile = resolveDeviceCardComposition({
      box: { widthPx, heightPx: hostTilePx },
      hasControls: true,
      active: true,
    });
    const placed = resolveDeviceCardComposition({
      box: { widthPx, heightPx: WALL_CARD_FULL_HEIGHT_PX },
      hasControls: true,
      active: true,
    });

    // A lighter form on the host tile — the smallest composition, holding the
    // active control alone — and the card's full content in the taller box.
    expect(hostTile.form).toBe("compact");
    expect(hostTile.siblings).toBe(false);
    expect(placed.form).toBe("full");
    expect(placed.siblings).toBe(true);
    expect(hostTile.form).not.toBe(placed.form);
    // The host-tile box is still at least the ported compact card's budget, so
    // the lighter form is one the card fits rather than one it overflows.
    expect(hostTilePx).toBeGreaterThanOrEqual(WALL_COMPACT_CARD_HEIGHT_PX);
  });
});

describe("the bounded row leaves the page count alone", () => {
  it("still reports five pages for the harness's five-device room card", () => {
    // The bound acts on the resolved row height alone; the pitch, the rows packed,
    // and the page count are unchanged. The harness stage renders a 1920×1080 panel.
    const paged = resolvePagedTiles({
      items: Array.from({ length: 5 }, (_, index) => `device.${index}`),
      span: { w: 4, h: 6 },
      rowUnit: ROW_UNIT_MAX,
      gutterPx: 21.6,
      page: 0,
      reservedRows: 3,
    });

    expect(paged.pageCount).toBe(5);
    expect(paged.tilesAcross).toBe(1);
    expect(paged.tilesPerPage).toBe(1);
    expect(paged.rows).toBe(1);
  });
});

describe("the room grid", () => {
  it("pages its tiles rather than scrolling them", async () => {
    const widget = await source(ROOM);

    expect(widget).toContain("<PagedTileGrid");
    expect(widget).toContain("items={tiles}");
    expect(widget).toContain("reservedRows={ROOM_HEADER_ROWS}");
    expect(widget).not.toContain("overflowY");
    expect(widget).not.toContain("auto-fit");
  });

  it("keeps the room-wide command and the shared device tiles", async () => {
    const widget = await source(ROOM);

    // The batch command and its optimistic flow are untouched.
    expect(widget).toContain("handleRoomCommand");
    expect(widget).toContain("actuatableRoomMembers(room.members)");
    expect(widget).toContain("All on");
    expect(widget).toContain("All off");
    // Each tile is still the shared wall device card, unavailable members included.
    expect(widget).toContain("WallDeviceCard");
    expect(widget).toContain("WallDeviceUnavailable");
    expect(widget).toContain("contained={contained}");
    expect(widget).toContain("roomTiles(room.members)");
  });

  it("draws the command's outcome over the card so it cannot eat a tile row", async () => {
    const widget = await source(ROOM);

    // The card's chrome is what the page plan reserves; the command's outcome is
    // drawn over the card's foot so it cannot push a tile row under the budget.
    expect(widget).toContain("reservedRows={ROOM_HEADER_ROWS}");
    expect(widget).toContain('position: "relative"');
    expect(widget).toContain('role="alert"');
    expect(widget).toContain("skippedCount > 0");
    const notices = widget.slice(widget.indexOf("hasNotice &&"));
    expect(notices).toContain('position: "absolute"');
    expect(notices).toContain("bottom: 0");
    // Informational only: the tile row under the notices stays touch-operable.
    expect(notices).toContain('pointerEvents: "none"');
    // The notices sit after the tile grid in the source, over it — never in the
    // card's own column, where they would consume its height.
    expect(widget.indexOf("<PagedTileGrid")).toBeLessThan(widget.indexOf("hasNotice &&"));
  });
});

describe("the wall's paging chrome", () => {
  it("gives every paged tile the minimum-span tile's tier and form", () => {
    // The page plan models every tile as the device card at its minimum span, so
    // that cell's tier and form are what a paged tile must compose.
    const cell = { w: WALL_TILE_CELL_COLUMNS, h: WALL_TILE_CELL_ROWS };
    const descriptor = WALL_WIDGET_REGISTRY.light;

    expect(resolveSpanTier(cell, descriptor)).toBe("compact");
    for (const rowUnit of [ROW_UNIT_MIN, ROW_UNIT_MAX]) {
      // The tile's box is its cell: a typed device widget's frame is chrome-less.
      expect(resolveCardFormForHeight(cardHeightPx({ rows: cell.h, rowUnit }))).toBe("compact");
    }
  });

  it("tells the plan when the card carries a title", async () => {
    // The frame draws a configured title inside the card's own cell, so every grid
    // that pages through the shared layer reports it to the plan.
    for (const path of [ROOM, FAVORITES, DEVICES]) {
      const widget = await source(path);
      expect(widget, path).toContain("titled={widgetTitle(widget) !== null}");
    }

    const paged = await source(join(WIDGETS, "PagedTileGrid.tsx"));
    expect(paged).toContain("titled = false");
    expect(paged).toContain("reservedRows,\n    titled,");
  });

  it("draws the shared page controls at the wall's touch target", async () => {
    const paged = await source(join(WIDGETS, "PagedTileGrid.tsx"));

    expect(paged).toContain("<WallCardActions");
    expect(paged).toContain("<WallCardIconButton");
    expect(paged).toContain("resolvePagedTiles(");
    expect(paged).not.toContain("onMouseEnter");
  });

  it("draws the chrome at the ported control metrics and leaves the page count alone", async () => {
    const paged = await source(join(WIDGETS, "PagedTileGrid.tsx"));
    const anatomy = await source(join(APP_DIR, "wall/cards/card-anatomy.tsx"));

    // The chrome's controls are the vocabulary's own parts: the ported control height
    // and radius, declared once in the anatomy.
    expect(paged).toContain("<WallCardIconButton");
    expect(paged).toContain("<WallCardLabel>");
    expect(anatomy).toContain("width: WALL_CARD_METRICS.controlHeight");
    expect(anatomy).toContain("borderRadius: WALL_CARD_METRICS.controlRadius");
    expect(WALL_CARD_METRICS.controlHeight).toBe(WALL_MIN_TOUCH_TARGET);

    // The treatment is not a plan input: the page count is the content, the span, the
    // row unit, and the reserved rows alone.
    const items = Array.from({ length: 40 }, (_, index) => `device.${index}`);
    const plan = resolvePagedTiles({
      items,
      span: WALL_WIDGET_REGISTRY.devices.min,
      rowUnit: ROW_UNIT_MIN,
      page: 0,
    });
    expect(plan.tilesPerPage).toBe(2);
    expect(plan.pageCount).toBe(20);
  });
});

describe("the paged types' minimum spans", () => {
  it("reserves the frame inset in every plan, paging or not", () => {
    // The frame always pads, so both plans hold its inset back. The inset is the ported
    // card surface's padding, read from the card table rather than restated.
    expect(WALL_FRAME_INSET_PX).toBe(WALL_CARD_METRICS.padding);
    expect(WALL_FRAME_RESERVED_PX).toBe(2 * WALL_CARD_METRICS.padding);

    // A four-row span at the floors: holding the frame's inset back costs it a
    // tile row it would otherwise claim.
    const input = {
      span: { w: 6, h: 4 },
      count: 1,
      rowUnit: ROW_UNIT_MIN,
      gutterPx: WALL_GUTTER_MIN_PX,
    };
    const withFrame = resolvePages({ ...input, reservedPx: WALL_FRAME_RESERVED_PX });
    const withoutAny = resolvePages(input);
    expect(withFrame.tilesDown).toBeLessThan(withoutAny.tilesDown);
    // Both still promise a row at least a tile's cell tall.
    const tileCellPx = WALL_TILE_CELL_ROWS * ROW_UNIT_MIN + WALL_GUTTER_MIN_PX;
    expect(withFrame.rowHeightPx).toBeGreaterThanOrEqual(tileCellPx);
  });

  it("promises no tile row shorter than the tile's own cell", () => {
    // The pitch is the tile's own cell, so even a minimum-span paged card's row is at
    // least as tall as the compact card it holds.
    const floors = (rows: number): number => rows * ROW_UNIT_MIN + (rows - 1) * WALL_GUTTER_MIN_PX;

    for (const [type, headerRows] of [
      ["devices", 0],
      ["favorites", 2],
      ["room", 3],
    ] as const) {
      const { min } = WALL_WIDGET_REGISTRY[type];
      const cellPx = WALL_TILE_CELL_ROWS * ROW_UNIT_MIN + WALL_GUTTER_MIN_PX;
      expect(cellPx, `${type} tile cell holds the compact card`).toBeGreaterThanOrEqual(
        WALL_COMPACT_CARD_HEIGHT_PX,
      );

      for (const count of [1, 40]) {
        const plan = resolvePages({
          span: min,
          count,
          rowUnit: ROW_UNIT_MIN,
          gutterPx: WALL_GUTTER_MIN_PX,
          reservedPx: WALL_FRAME_RESERVED_PX + headerRows * ROW_UNIT_MIN,
        });
        expect(plan.rowHeightPx, `${type} with ${count} tiles`).toBeGreaterThanOrEqual(
          WALL_COMPACT_CARD_HEIGHT_PX,
        );
        expect(
          floors(min.h) - (WALL_FRAME_RESERVED_PX + headerRows * ROW_UNIT_MIN),
        ).toBeGreaterThan(0);
      }

      // The plan the widget actually resolves: a selection that fits one page uses
      // no page-control row, and still gets a row a compact card fits in.
      const onePage = resolvePagedTiles({
        items: items(1),
        span: min,
        rowUnit: ROW_UNIT_MIN,
        gutterPx: WALL_GUTTER_MIN_PX,
        page: 0,
        reservedRows: headerRows,
      });
      expect(onePage.pageCount, `${type} single page`).toBe(1);
      expect(onePage.rowHeightPx, `${type} non-paging row`).toBeGreaterThanOrEqual(
        WALL_COMPACT_CARD_HEIGHT_PX,
      );
    }
  });

  it("models the same gutter the wall draws, so the plan and the draw agree", () => {
    // The wall draws `clamp(16px, 2vmin, 24px)`; the plan cannot see the viewport, so
    // it models the *floor* — the smallest cell the wall can draw.
    const span = { w: 6, h: 6 };
    const input = { span, count: 40, rowUnit: ROW_UNIT_MIN };
    const floored = resolvePages({ ...input, gutterPx: WALL_GUTTER_MIN_PX });
    const ceilinged = resolvePages({ ...input, gutterPx: WALL_GUTTER_MAX_PX });

    expect(resolvePages(input)).toEqual(floored);
    expect(resolvePages(input)).not.toEqual(ceilinged);
    expect(resolvePages(input).rowHeightPx).toBeGreaterThanOrEqual(WALL_COMPACT_CARD_HEIGHT_PX);
  });

  it("promises a row the *drawn* cell holds on any viewport, titled or not", () => {
    // Whatever gutter the viewport resolves, the drawn tile area is at least the
    // modelled one, so the plan's row height is a lower bound for the drawn row.
    const gapPx = WALL_TILE_GAP_PX;
    const extent = (rows: number, unit: number, gutterPx: number): number =>
      rows * unit + (rows - 1) * gutterPx;
    const headerRows: Record<(typeof TYPES)[number], number> = {
      devices: 0,
      favorites: 2,
      room: 3,
    };
    const items = Array.from({ length: 400 }, (_, index) => `device.${index}`);

    for (const type of TYPES) {
      const { min } = WALL_WIDGET_REGISTRY[type];
      for (const rowUnit of [ROW_UNIT_MIN, ROW_UNIT_MAX]) {
        for (const titled of [false, true]) {
          const plan = resolvePagedTiles({
            items,
            span: min,
            rowUnit,
            page: 0,
            reservedRows: headerRows[type],
            titled,
          });
          // The rows the widget actually draws are this page's tiles.
          const rows = Math.max(1, Math.ceil(plan.items.length / plan.tilesAcross));
          const chromePx =
            headerRows[type] * rowUnit + (plan.pageCount > 1 ? WALL_PAGE_RESERVED_PX : 0);

          for (const drawnGutter of [WALL_GUTTER_MIN_PX, 20, WALL_GUTTER_MAX_PX]) {
            const drawnArea = extent(min.h, rowUnit, drawnGutter) - chromePx;
            const drawnRow = (drawnArea - (rows - 1) * gapPx) / rows;
            const where = `${type} at ${rowUnit}px rows, gutter ${drawnGutter}px, titled=${titled}`;

            expect(drawnRow, where).toBeGreaterThanOrEqual(plan.rowHeightPx);
            expect(drawnRow, where).toBeGreaterThanOrEqual(WALL_COMPACT_CARD_HEIGHT_PX);
          }
        }
      }
    }
  });

  it("reserves the frame's title, so a titled plan stays above the compact budget", () => {
    // The title is drawn inside the widget's cell, so a titled plan packs one row less
    // — the same allowance `span.ts` and the editor give a titled widget.
    expect(WALL_FRAME_TITLE_ROWS).toBe(WALL_TITLE_ROWS);
    expect(WALL_FRAME_TITLE_ROWS * ROW_UNIT_MIN).toBeGreaterThanOrEqual(WALL_TITLE_BLOCK_PX);

    const items = Array.from({ length: 400 }, (_, index) => `device.${index}`);
    for (const rowUnit of [ROW_UNIT_MIN, ROW_UNIT_MAX]) {
      for (const type of TYPES) {
        const span = WALL_WIDGET_REGISTRY[type].max;
        const untitled = resolvePagedTiles({ items, span, rowUnit, page: 0 });
        const titled = resolvePagedTiles({ items, span, rowUnit, page: 0, titled: true });

        expect(titled.rowHeightPx, `${type} at ${rowUnit}px`).toBeLessThan(untitled.rowHeightPx);
        expect(titled.pageCount).toBeGreaterThanOrEqual(untitled.pageCount);
        expect(titled.rowHeightPx).toBeGreaterThanOrEqual(WALL_COMPACT_CARD_HEIGHT_PX);
      }
    }
  });
});

describe("no wall widget scrolls", () => {
  it("leaves no scrolling container anywhere on the wall", async () => {
    const files = (await readdir(WIDGETS))
      .filter((name) => name.endsWith(".tsx"))
      .map((name) => join(WIDGETS, name));
    files.push(join(APP_DIR, "wall/WallGrid.tsx"), join(APP_DIR, "wall/WidgetFrame.tsx"));
    expect(files.length).toBeGreaterThan(5);

    for (const file of files) {
      const text = await source(file);
      expect(text, file).not.toMatch(/overflow(?:Y|X)?:\s*["']auto["']/);
      expect(text, file).not.toContain("overflow-y-auto");
      expect(text, file).not.toContain("ScrollArea");
    }
  });
});
