import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { WALL_WIDGET_CONFIG_SCHEMAS } from "@ts-ha/shared/wall-schema";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WALL_CARD_METRICS } from "../src/app/wall/cards/metrics.js";
import {
  ROW_UNIT_MIN,
  WALL_COMPACT_CARD_HEIGHT_PX,
  WALL_GUTTER_MIN_PX,
} from "../src/app/wall/grid.js";
import {
  resolvePagedTiles,
  resolvePages,
  WALL_CONTROL_GAP_PX,
  WALL_FRAME_INSET_PX,
  WALL_FRAME_RESERVED_PX,
  WALL_PAGE_CONTROL_RESERVED_PX,
  WALL_PAGE_RESERVED_PX,
  WALL_TILE_CELL_COLUMNS,
  WALL_TILE_CELL_ROWS,
  WALL_TILE_GAP_PX,
} from "../src/app/wall/pages.js";
import {
  WALL_MIN_CONTROL_GAP,
  WALL_MIN_TOUCH_TARGET,
  WALL_WIDGET_REGISTRY,
} from "../src/app/wall/registry.js";
import { deviceGridIds, resolveDeviceGridPage } from "../src/app/wall/widgets/device-grid-model.js";
import { PagedTileGrid } from "../src/app/wall/widgets/PagedTileGrid.js";

/**
 * The wall device grid: the selection and page plan are pure; the renderer's
 * wiring is asserted structurally.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const RENDERER = join(APP_DIR, "wall/widgets/DeviceGridWidget.tsx");
/** The shared paged tile grid every paging wall widget draws its page through. */
const PAGED_TILE_GRID = join(APP_DIR, "wall/widgets/PagedTileGrid.tsx");
/** The ported module where the wall's control treatment is declared once. */
const ANATOMY = join(APP_DIR, "wall/cards/card-anatomy.tsx");
const MIN = WALL_WIDGET_REGISTRY.devices.min;

/** Removes block and line comments so prose is not mistaken for markup. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function rendererSource(): Promise<string> {
  return stripComments(await readFile(RENDERER, "utf8"));
}

async function pagedTileGridSource(): Promise<string> {
  return stripComments(await readFile(PAGED_TILE_GRID, "utf8"));
}

/** The dark-scheme token declarations of `wall/hearth.css`. */
async function hearthTokens(): Promise<Record<string, string>> {
  const css = stripComments(await readFile(join(APP_DIR, "wall/hearth.css"), "utf8"));
  const boundary = css.indexOf('[data-theme="light"] [data-wall-chunk]');
  const tokens: Record<string, string> = {};
  for (const [, name, value] of css
    .slice(0, boundary)
    .matchAll(/(--hearth-[\w-]+):\s*([^;{]+);/g)) {
    if (name !== undefined && value !== undefined) tokens[name] = value.trim();
  }
  return tokens;
}

function page(ids: readonly string[], count: number, unit = ROW_UNIT_MIN, requested = 0) {
  return resolveDeviceGridPage({
    ids: ids.slice(0, count),
    span: MIN,
    rowUnit: unit,
    page: requested,
  });
}

describe("deviceGridIds", () => {
  it("keeps the author's selection in its authored order", () => {
    expect(deviceGridIds({ qualifiedIds: ["light.b", "light.a", "plug.a"] })).toEqual([
      "light.b",
      "light.a",
      "plug.a",
    ]);
  });

  it("keeps a repeated identifier once and drops a blank one", () => {
    expect(deviceGridIds({ qualifiedIds: ["light.a", "light.a", "  ", "light.b"] })).toEqual([
      "light.a",
      "light.b",
    ]);
  });

  it("yields no selection when the config is not a list of identifiers", () => {
    expect(deviceGridIds({})).toEqual([]);
    expect(deviceGridIds({ qualifiedIds: "light.a" })).toEqual([]);
    expect(deviceGridIds({ qualifiedIds: [7, null, "light.a"] })).toEqual(["light.a"]);
  });
});

describe("resolveDeviceGridPage", () => {
  it("renders exactly the selected devices when they fit one page", () => {
    const selection = ["light.a", "light.b"];
    const plan = page(selection, selection.length);

    expect(plan.pageCount).toBe(1);
    expect(plan.ids).toEqual(selection);
    expect(plan.tilesAcross).toBeGreaterThanOrEqual(1);
    expect(plan.rows).toBeGreaterThanOrEqual(1);
  });

  it("pages a selection larger than its span and reports the exact count", () => {
    const selection = Array.from({ length: 9 }, (_, index) => `light.${index}`);
    const first = page(selection, selection.length);

    expect(first.tilesPerPage).toBeGreaterThan(0);
    expect(first.pageCount).toBe(Math.ceil(selection.length / first.tilesPerPage));
    expect(first.pageCount).toBeGreaterThan(1);
    expect(first.ids).toEqual(selection.slice(0, first.tilesPerPage));
  });

  it("presents each selection member exactly once across its pages", () => {
    const selection = Array.from({ length: 7 }, (_, index) => `light.${index}`);
    const plan = page(selection, selection.length);

    const seen: string[] = [];
    for (let index = 0; index < plan.pageCount; index += 1) {
      seen.push(...page(selection, selection.length, ROW_UNIT_MIN, index).ids);
    }

    expect(seen).toEqual(selection);
    expect(new Set(seen).size).toBe(selection.length);
  });

  it("clamps a page past the last one onto the last page", () => {
    const selection = Array.from({ length: 9 }, (_, index) => `light.${index}`);
    const plan = page(selection, selection.length, ROW_UNIT_MIN, 99);

    expect(plan.page).toBe(plan.pageCount - 1);
    expect(plan.ids.length).toBeGreaterThan(0);
  });

  it("reserves the page-control row only while the selection pages", () => {
    const span = WALL_WIDGET_REGISTRY.devices.max;
    // Both plans reserve the frame's own inset, because the frame always pads;
    // only the plan that pages gives up the control row as well.
    const onePage = resolvePages({
      span,
      count: 1,
      rowUnit: ROW_UNIT_MIN,
      reservedPx: WALL_FRAME_RESERVED_PX,
    });
    const paging = resolvePages({
      span,
      count: 40,
      rowUnit: ROW_UNIT_MIN,
      reservedPx: WALL_PAGE_RESERVED_PX,
    });

    expect(paging.tilesDown).toBeLessThan(onePage.tilesDown);
    // Neither plan promises a row shorter than a tile's own cell. The cell is the
    // *drawn* one: the plan and the wall share the gutter floor.
    const tileCellPx = WALL_TILE_CELL_ROWS * ROW_UNIT_MIN + WALL_GUTTER_MIN_PX;
    expect(tileCellPx).toBeGreaterThanOrEqual(WALL_COMPACT_CARD_HEIGHT_PX);
    for (const plan of [onePage, paging]) {
      expect(plan.rowHeightPx).toBeGreaterThanOrEqual(tileCellPx);
    }

    const spanned = resolveDeviceGridPage({
      ids: ["a"],
      span,
      rowUnit: ROW_UNIT_MIN,
      page: 0,
    });
    const paged = resolveDeviceGridPage({
      ids: Array.from({ length: 40 }, (_, index) => `light.${index}`),
      span,
      rowUnit: ROW_UNIT_MIN,
      page: 0,
    });

    // A single-page grid keeps every cell for tiles; a paging grid gives up the
    // control row, so it never promises a tile row the card cannot show.
    expect(spanned.pageCount).toBe(1);
    expect(paged.pageCount).toBeGreaterThan(1);
    expect(paged.tilesPerPage).toBeLessThan(spanned.tilesPerPage);
  });

  it("reads a row unit below the wall's floor as the floor", () => {
    const unmeasured = resolveDeviceGridPage({
      ids: ["a"],
      span: MIN,
      rowUnit: 0,
      page: 0,
    });
    const atFloor = resolveDeviceGridPage({
      ids: ["a"],
      span: MIN,
      rowUnit: ROW_UNIT_MIN,
      page: 0,
    });

    expect(unmeasured).toEqual(atFloor);
  });

  it("reports no page for an empty selection", () => {
    const plan = resolveDeviceGridPage({ ids: [], span: MIN, rowUnit: ROW_UNIT_MIN, page: 0 });

    expect(plan.pageCount).toBe(0);
    expect(plan.ids).toEqual([]);
  });
});

describe("the devices descriptor", () => {
  it("is a control widget bound to the shared devices schema", () => {
    const descriptor = WALL_WIDGET_REGISTRY.devices;

    expect(descriptor.type).toBe("devices");
    expect(descriptor.grammar).toBe("control");
    expect(descriptor.configSchema).toBe(WALL_WIDGET_CONFIG_SCHEMAS.devices);
    expect(typeof descriptor.renderer).toBe("function");
  });

  it("holds at least a page's row of tiles at its minimum span", () => {
    // The minimum span must be at least one tile cell in each direction, and it
    // must physically hold a tile row once the page controls are accounted for.
    expect(MIN.w).toBeGreaterThanOrEqual(WALL_TILE_CELL_COLUMNS);
    expect(MIN.h).toBeGreaterThanOrEqual(WALL_TILE_CELL_ROWS);
    // Two tile columns wide — the smallest span that presents a page's first row of
    // minimum-span tiles two across.
    expect(MIN.w).toBe(2 * WALL_TILE_CELL_COLUMNS);

    const cell = WALL_TILE_CELL_ROWS * ROW_UNIT_MIN;
    const flush = MIN.h * ROW_UNIT_MIN + (MIN.h - 1) * WALL_MIN_CONTROL_GAP * 3;
    expect(flush - WALL_PAGE_RESERVED_PX).toBeGreaterThanOrEqual(cell);

    const plan = resolveDeviceGridPage({
      ids: ["a", "b", "c", "d"],
      span: MIN,
      rowUnit: ROW_UNIT_MIN,
      page: 0,
    });
    expect(plan.rows).toBeGreaterThanOrEqual(1);
  });

  it("reserves the frame inset, one control row, and the control gap", () => {
    // The reservation is the frame's ported inset, read from the card table rather
    // than restated, one page-control row at the wall's touch target, and the gap.
    expect(WALL_FRAME_INSET_PX).toBe(WALL_CARD_METRICS.padding);
    expect(WALL_PAGE_RESERVED_PX).toBe(
      2 * WALL_FRAME_INSET_PX + WALL_MIN_TOUCH_TARGET + WALL_MIN_CONTROL_GAP,
    );
    expect(WALL_MIN_TOUCH_TARGET).toBeGreaterThanOrEqual(42);
  });

  it("mirrors the frame inset the stylesheet declares", async () => {
    // The frame pads a control card with `--hearth-card-padding`; the reservation must agree.
    const tokens = await hearthTokens();
    expect(tokens["--hearth-card-padding"]).toBe(`${WALL_FRAME_INSET_PX}px`);
  });
});

describe("the device grid renderer", () => {
  it("draws exactly the page's selected devices as shared wall device cards", async () => {
    const source = await rendererSource();
    const paged = await pagedTileGridSource();

    // The grid hands the shared paged tile grid its selection; that grid draws the
    // page through the shared pagination layer.
    expect(source).toContain("deviceGridIds(widget.config)");
    expect(source).toContain("items={ids}");
    expect(source).toContain("<PagedTileGrid");
    expect(source).toContain("WallDeviceCard");
    // The frame draws the card's surface, so each contained tile draws none.
    expect(source).toContain("contained={contained}");
    expect(paged).toContain("resolvePagedTiles(");
    expect(paged).toContain("page.items.map(");
  });

  it("is a uniform grid that clips rather than scrolling", async () => {
    const source = await rendererSource();
    const paged = await pagedTileGridSource();

    expect(paged).toContain("page.tilesAcross");
    expect(paged).toContain("page.rows");
    expect(paged).toContain('overflow: "hidden"');
    for (const widget of [source, paged]) {
      expect(widget).not.toContain("overflowY");
      expect(widget).not.toContain('overflow: "auto"');
    }
  });

  it("presents touch page controls only while the selection pages", async () => {
    const paged = await pagedTileGridSource();
    const controls = paged.slice(paged.indexOf("pageCount > 1"));

    expect(paged).toContain("page.pageCount > 1");
    expect(controls).toContain("<WallCardIconButton");
    // WallCardIconButton draws the wall's touch-sized ported control in both
    // directions, in the vocabulary's own actions row.
    expect(controls).toContain("setRequestedPage");
    expect(controls).toContain("disabled={page.page === 0}");
    expect(controls).toContain("disabled={page.page >= page.pageCount - 1}");
  });

  it("draws the page controls at the ported control height and radius", async () => {
    const paged = await pagedTileGridSource();
    const anatomy = stripComments(await readFile(ANATOMY, "utf8"));

    // The chrome's page controls are the vocabulary's own parts: the ported control
    // height and radius, declared once in the anatomy.
    expect(paged).toContain("<WallCardActions");
    expect(paged).toContain("<WallCardIconButton");
    expect(paged).toContain("<WallCardLabel>");
    expect(anatomy).toContain("width: WALL_CARD_METRICS.controlHeight");
    expect(anatomy).toContain("borderRadius: WALL_CARD_METRICS.controlRadius");
    expect(WALL_CARD_METRICS.controlHeight).toBe(WALL_MIN_TOUCH_TARGET);
  });

  it("explains an empty selection inside its own area", async () => {
    const source = await rendererSource();

    expect(source).toContain("ids.length === 0");
    expect(source).toContain("WallCardMessage");
  });
});

describe("the paged tile grid's drawn rows", () => {
  /** The page's tiles; the identity a tile is keyed and rendered by. */
  function tiles(count: number): readonly string[] {
    return Array.from({ length: count }, (_, index) => `device.${index}`);
  }

  /**
   * Renders one page of {@link PagedTileGrid} to static markup, comparing the drawn
   * row height against `plan.rowHeightPx` rather than a repeated literal.
   */
  function renderPage(input: { span: { w: number; h: number }; rowUnit: number; count: number }): {
    html: string;
    plan: ReturnType<typeof resolvePagedTiles<string>>;
  } {
    const plan = resolvePagedTiles({
      items: tiles(input.count),
      span: input.span,
      rowUnit: input.rowUnit,
      page: 0,
    });
    const html = renderToStaticMarkup(
      createElement(PagedTileGrid, {
        items: tiles(input.count),
        keyOf: (item: string) => item,
        renderTile: (item: string) => createElement("span", null, item),
        span: input.span,
        rowUnit: input.rowUnit,
        label: "devices",
      }),
    );
    return { html, plan };
  }

  it("draws each row at the plan's resolved height for a one-row page", () => {
    // A device grid at its minimum span on the harness panel: its one tile row is
    // drawn at the height the plan resolved rather than stretched to fill the widget.
    const { html, plan } = renderPage({ span: MIN, rowUnit: ROW_UNIT_MIN, count: 2 });

    expect(plan.rows).toBe(1);
    expect(html).toContain(`grid-template-rows:repeat(${plan.rows}, ${plan.rowHeightPx}px)`);
    // The block is centred in the leftover height, not stretched into it.
    expect(html).toContain("align-content:center");
  });

  it("draws each row at the plan's resolved height for a several-row page", () => {
    const { html, plan } = renderPage({ span: { w: 12, h: 12 }, rowUnit: ROW_UNIT_MIN, count: 12 });

    expect(plan.rows).toBe(3);
    expect(html).toContain(`grid-template-rows:repeat(${plan.rows}, ${plan.rowHeightPx}px)`);
    expect(html).toContain("align-content:center");
  });

  it("reserves one control gap plus one control row — the plan's page-control chrome", () => {
    // `wall/pages.ts` reserves the gap above the page-control row and the row itself.
    // The row is the wall's touch target, the ported control height.
    expect(WALL_CONTROL_GAP_PX + WALL_CARD_METRICS.controlHeight).toBe(
      WALL_PAGE_CONTROL_RESERVED_PX,
    );
    expect(WALL_TILE_GAP_PX).toBe(WALL_MIN_CONTROL_GAP);
    expect(WALL_CONTROL_GAP_PX).toBe(WALL_MIN_CONTROL_GAP);
  });

  it("draws those gaps and that row, with no inset the plan does not reserve", () => {
    // The regression this guards: the drawn chrome once exceeded the plan's reservation,
    // so the tiles grid clipped. The draw now reads the plan's own gaps.
    const { html, plan } = renderPage({ span: MIN, rowUnit: ROW_UNIT_MIN, count: 40 });
    expect(plan.pageCount).toBeGreaterThan(1);

    // The gap above the page-control row and the inter-tile gap are the plan's.
    expect(html).toContain(`gap:${WALL_CONTROL_GAP_PX}px`);
    expect(html).toContain(`gap:${WALL_TILE_GAP_PX}px`);
    // The row's controls carry the ported control height, and the row adds no
    // ported control-spacing inset, so the chrome it draws is the reservation.
    expect(html).toContain(`height:${WALL_CARD_METRICS.controlHeight}px`);
    expect(html).not.toContain(`padding:${WALL_CARD_METRICS.controlSpacing}px`);
  });

  it("reads the plan's gaps and drops the row's inset in the renderer's source", async () => {
    const paged = await pagedTileGridSource();

    expect(paged).toMatch(/gap: `\$\{WALL_CONTROL_GAP_PX\}px`/);
    expect(paged).toMatch(/gap: `\$\{WALL_TILE_GAP_PX\}px`/);
    expect(paged).toContain('<WallCardActions inset={false} distribution="distributed">');
  });
});
