import { describe, expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
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
  WALL_TILE_CELL_SPAN,
  WALL_TILE_GAP_PX,
} from "../src/app/wall/pages.js";
import { WALL_WIDGET_REGISTRY } from "../src/app/wall/registry.js";
import {
  cardHeightPx,
  resolveCardFormForHeight,
  resolveSpanTier,
  WALL_TITLE_BLOCK_PX,
  WALL_TITLE_ROWS,
} from "../src/app/wall/span.js";

/**
 * Wall pagination (wall-zones-and-fit D5, D12; specs/wall-display "Panel Fit").
 * A widget whose own content cannot fit its span pages rather than overflowing or
 * scrolling, so no wall widget scrolls. The page plan is pure, so it is asserted
 * directly; the widgets' wiring is asserted structurally — the same style as
 * `wall-read-only.test.ts` — because there is no DOM harness.
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
    // device card's own minimum span (wall-zones-and-fit D4, D12).
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

    expect(widget).toContain("WallDeviceTile");
    expect(widget).toContain("contained={contained}");
    expect(widget).toContain("WallCardMessage");
    expect(widget).toContain("favoriteDevices(favorites, devicesByQualifiedId)");
  });

  it("gives each tile the tile's own tier and form, not the widget's", async () => {
    const widget = await source(FAVORITES);

    // A paged tile is the device card at the wall's minimum-span tile cell, so it
    // must compose the tier and form that cell resolves; forwarding the enclosing
    // widget's tier would draw a larger form inside a minimum-span tile and clip
    // it (the same ones the device grid gives its tiles).
    expect(widget).toContain('tier="compact"');
    expect(widget).toContain('cardForm="compact"');
    expect(widget).not.toContain("tier={tier}");
    expect(widget).not.toContain("cardForm={cardForm}");
  });
});

describe("the room grid", () => {
  it("gives each tile the tile's own tier and form, not the widget's", async () => {
    const widget = await source(ROOM);

    expect(widget).toContain('tier="compact"');
    expect(widget).toContain('cardForm="compact"');
    expect(widget).not.toContain("tier={tier}");
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
    expect(widget).toContain("WallDeviceTile");
    expect(widget).toContain("unavailable");
    expect(widget).toContain("contained={contained}");
    expect(widget).toContain("roomTiles(room.members)");
  });

  it("draws the command's outcome over the card so it cannot eat a tile row", async () => {
    const widget = await source(ROOM);

    // The card's chrome — the glyph, the count, the command row — is what the page
    // plan reserves. The command's own outcome is *not* part of it: it is drawn
    // over the card's foot, so reporting a command on a minimum-span room card
    // cannot push a tile row under the compact budget, and cannot reflow (and so
    // re-page) the tiles that command just actuated.
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
    // The page plan models every tile as the device card at its minimum span
    // (`WALL_TILE_CELL_SPAN` cells per axis), so that cell's tier and form are
    // what a paged tile must compose — derived, not assumed, from the registry
    // and the cell height.
    const cell = { w: WALL_TILE_CELL_SPAN, h: WALL_TILE_CELL_SPAN };
    const descriptor = WALL_WIDGET_REGISTRY.device;

    expect(resolveSpanTier(cell, descriptor)).toBe("compact");
    for (const rowUnit of [ROW_UNIT_MIN, ROW_UNIT_MAX]) {
      // The tile's box is its cell: the `device` frame is chrome-less.
      expect(resolveCardFormForHeight(cardHeightPx({ rows: cell.h, rowUnit }))).toBe("compact");
    }
  });

  it("tells the plan when the card carries a title", async () => {
    // The frame draws a configured title inside the card's own cell, so every grid
    // that pages through the shared layer reports it — otherwise a titled card's
    // tile rows would be squeezed under the compact budget the minimum spans are
    // derived against (wall-zones-and-fit D3, D4).
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

    expect(paged).toContain("<WallCardAffordance>");
    expect(paged).toContain("<WallButton");
    expect(paged).toContain("resolvePagedTiles(");
    expect(paged).not.toContain("onMouseEnter");
  });
});

describe("the paged types' minimum spans", () => {
  it("reserves the frame inset in every plan, paging or not", () => {
    // The frame always pads, so both plans hold its inset back — a widget that
    // fits one page must not claim the frame's own room for its tiles.
    expect(WALL_FRAME_RESERVED_PX).toBe(2 * WALL_FRAME_INSET_PX);

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
    const tileCellPx = WALL_TILE_CELL_SPAN * ROW_UNIT_MIN + WALL_GUTTER_MIN_PX;
    expect(withFrame.rowHeightPx).toBeGreaterThanOrEqual(tileCellPx);
  });

  it("promises no tile row shorter than the tile's own cell", () => {
    // The pitch is the tile's own cell, so even the row a *minimum-span* paged
    // card presents is at least as tall as the compact card it holds — the value
    // row inside it keeps the wall's touch target. Asserted for the non-paging
    // plan, the paging plan and the shared paged contract.
    const floors = (rows: number): number => rows * ROW_UNIT_MIN + (rows - 1) * WALL_GUTTER_MIN_PX;

    for (const [type, headerRows] of [
      ["devices", 0],
      ["favorites", 2],
      ["room", 3],
    ] as const) {
      const { min } = WALL_WIDGET_REGISTRY[type];
      const cellPx = WALL_TILE_CELL_SPAN * ROW_UNIT_MIN + WALL_GUTTER_MIN_PX;
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
    // The wall draws `clamp(16px, 2vmin, 24px)`; the plan cannot see the viewport,
    // so it models the *floor* — the smallest cell the wall can draw — exactly as
    // `span.ts`'s card geometry does. Modelling the ceiling would promise a row the
    // drawn cell cannot hold.
    const span = { w: 6, h: 6 };
    const input = { span, count: 40, rowUnit: ROW_UNIT_MIN };
    const floored = resolvePages({ ...input, gutterPx: WALL_GUTTER_MIN_PX });
    const ceilinged = resolvePages({ ...input, gutterPx: WALL_GUTTER_MAX_PX });

    expect(resolvePages(input)).toEqual(floored);
    expect(resolvePages(input)).not.toEqual(ceilinged);
    expect(resolvePages(input).rowHeightPx).toBeGreaterThanOrEqual(WALL_COMPACT_CARD_HEIGHT_PX);
  });

  it("promises a row the *drawn* cell holds on any viewport, titled or not", () => {
    // Both halves of the guarantee share one geometry: whatever gutter the viewport
    // resolves, the drawn tile area is at least the modelled one, so the plan's row
    // height is a lower bound for the row the wall actually draws — and that row
    // holds the compact card (wall-zones-and-fit D5; specs/wall-display "A
    // selection too large pages rather than scrolls"). A configured title is part of
    // that geometry: the frame draws it out of the same cell, so the plan reserves
    // it and the drawn box loses it — the one reservation the drawn row would
    // otherwise be short by exactly `WALL_TITLE_BLOCK_PX`.
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
    // The title is drawn inside the widget's cell, so a titled plan packs one row
    // less. It is the same allowance `span.ts` gives the type's minimum span and the
    // editor gives a titled widget's height floor — one row of the wall's shortest
    // cell — so the page math and the editor cannot drift.
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
