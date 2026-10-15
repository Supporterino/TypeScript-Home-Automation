import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type Capability, WALL_GRID_COLUMNS, type WallWidget } from "@ts-ha/shared";
import type { DeviceDescriptor } from "../src/app/types.js";
import { climateCardModel } from "../src/app/wall/cards/ClimateCard.js";
import { coverCardModel } from "../src/app/wall/cards/CoverCard.js";
import {
  placedDeviceCardBox,
  resolveCardFormForBox,
  resolveDeviceCardComposition,
  WALL_CARD_COMPACT_HEIGHT_PX,
  WALL_CARD_CONTROL_MAX_WIDTH_PX,
  WALL_CARD_CONTROL_ROW_HEIGHT_PX,
  WALL_CARD_CONTROL_ROW_MIN_WIDTH_PX,
  WALL_CARD_MAX_ROW_CONTROLS,
  WALL_CARD_STATE_ROW_HEIGHT_PX,
} from "../src/app/wall/cards/card-composition.js";
import {
  deviceCanDriveClass,
  isWallDeviceClass,
  WALL_DEVICE_CLASSES,
  type WallDeviceClass,
} from "../src/app/wall/cards/device-class.js";
import { fanCardModel } from "../src/app/wall/cards/FanCard.js";
import { lightCardControls } from "../src/app/wall/cards/LightCard.js";
import { lockCardModel } from "../src/app/wall/cards/LockCard.js";
import { WALL_CARD_METRICS } from "../src/app/wall/cards/metrics.js";
import { numberCardControl } from "../src/app/wall/cards/NumberCard.js";
import { selectCardModel } from "../src/app/wall/cards/SelectCard.js";
import {
  ROW_UNIT_MAX,
  ROW_UNIT_MIN,
  WALL_GUTTER_MIN_PX,
  WALL_MIN_DEVICE_COLUMNS,
} from "../src/app/wall/grid.js";
import { panelRowUnit, widgetValues } from "../src/app/wall/harness/computed.js";
import { DEFAULT_DRAFT, shownWidgets } from "../src/app/wall/harness/draft.js";
import {
  DEVICE_CLASS_DEVICE_IDS,
  WALL_HARNESS_FIXTURES,
} from "../src/app/wall/harness/fixtures.js";
import {
  HARNESS_PANEL_SIZES,
  HARNESS_THEMES,
  type HarnessPanel,
} from "../src/app/wall/harness/messages.js";
import { resolvePagedTiles, WALL_TILE_CELL_COLUMNS } from "../src/app/wall/pages.js";
import { getWidgetDescriptor } from "../src/app/wall/registry.js";
import { wallTileCardBox } from "../src/app/wall/widgets/DeviceWidget.js";
import { deviceGridIds } from "../src/app/wall/widgets/device-grid-model.js";

/**
 * The harness walk, done programmatically (task 9.4; design.md D2, D5, D7;
 * specs/wall-display "Wall Device Presentation" — "A light card fits its minimum
 * span" — "Span-Aware Card Presentation" — "A card's content fits its span" —
 * "Touch Operation", "Wall Visual Language").
 *
 * The literal walk this task asks for is a hand check: there is no browser and no
 * DOM test kit here, so nothing can *render* a card. What this file can do is the
 * strongest reachable equivalent — it drives the wall's own functions (the same
 * chain `computed.ts` shows in the panel: `wallGridMetrics` → `cardHeightPx` →
 * `rendererBoxHeightPx` → `placedDeviceCardBox` → `resolveDeviceCardComposition`)
 * for every typed card at its type's minimum span on both panels, and asserts the
 * card's own ported rows fit the box the renderer is actually handed. It changes
 * no wall behaviour; it pins what the change promises.
 *
 * The horizontal axis is asserted too, on the wall's own geometry: a typed
 * widget's minimum column span is derived from the widest control row a card
 * draws (`WALL_CARD_CONTROL_ROW_MIN_WIDTH_PX`), and the drawn cell on each panel
 * holds it — so a minimum-span card never clips a control horizontally. What
 * stays a human walk is the rendered pixel result in the browser: colour,
 * legibility at distance, and the scheme's contrast.
 */
const PANELS: readonly HarnessPanel[] = ["landscape", "portrait"];
const HARNESS_DIR = join(import.meta.dir, "..", "src/app/wall/harness");
const CARDS_DIR = join(import.meta.dir, "..", "src/app/wall/cards");

const DEVICES_BY_ID = new Map(
  WALL_HARNESS_FIXTURES.devices.map((device) => [device.qualifiedId, device]),
);

/** The roster device backing one wall device class — the device a walk selects for it. */
function deviceFor(deviceClass: WallDeviceClass): DeviceDescriptor {
  const device = DEVICES_BY_ID.get(DEVICE_CLASS_DEVICE_IDS[deviceClass]);
  if (!device) throw new Error(`the fixture roster carries no "${deviceClass}" device`);
  return device;
}

/** A typed widget of `deviceClass` at its type's minimum span, bound to the class's roster device. */
function minimumSpanWidget(deviceClass: WallDeviceClass): WallWidget {
  const { min } = getWidgetDescriptor(deviceClass);
  return {
    id: `walk-${deviceClass}`,
    type: deviceClass,
    config: { qualifiedId: DEVICE_CLASS_DEVICE_IDS[deviceClass] },
    x: 0,
    y: 0,
    w: min.w,
    h: min.h,
  };
}

/**
 * Whether a card of `deviceClass` draws an actions row for `capabilities` —
 * resolved through each card's own model, exactly as the card resolves it, so the
 * test cannot disagree with the card about which controls it presents. The entity
 * card is the card's own control (a whole-surface toggle), so it never draws an
 * actions row.
 */
const CARD_HAS_CONTROLS: Readonly<Record<WallDeviceClass, (c: Capability[]) => boolean>> = {
  light: (capabilities) => lightCardControls(capabilities).length > 0,
  cover: (capabilities) => coverCardModel(capabilities).transportProperty !== undefined,
  fan: (capabilities) => {
    const model = fanCardModel(capabilities);
    return model.percentage !== undefined || model.presets !== undefined;
  },
  climate: (capabilities) => {
    const model = climateCardModel(capabilities);
    return model.setpoint !== undefined || model.mode !== undefined;
  },
  lock: (capabilities) => lockCardModel(capabilities).property !== undefined,
  number: (capabilities) => numberCardControl(capabilities) !== undefined,
  select: (capabilities) => selectCardModel(capabilities).control !== undefined,
  entity: () => false,
};

/** Removes block and line comments so prose is not mistaken for a call or a token. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("the harness draft reaches every typed card", () => {
  for (const panel of PANELS) {
    it(`places a typed widget for every device class (${panel})`, () => {
      const widgets = shownWidgets(DEFAULT_DRAFT, panel);

      for (const deviceClass of WALL_DEVICE_CLASSES) {
        const widget = widgets.find((candidate) => candidate.type === deviceClass);
        expect(widget, `${panel}: a ${deviceClass} widget`).toBeDefined();

        // The placed widget binds a roster device its class can actually drive,
        // so a walk of the stage renders the card rather than the contained
        // "cannot be driven" explanation.
        const device = deviceFor(deviceClass);
        expect(widget?.config.qualifiedId, `${panel}: ${deviceClass} binding`).toBe(
          device.qualifiedId,
        );
        expect(
          deviceCanDriveClass(device.capabilities, deviceClass),
          `${panel}: ${deviceClass} is drivable`,
        ).toBe(true);
        expect(isWallDeviceClass(deviceClass)).toBe(true);
      }
    });
  }
});

describe("every typed card at its minimum span, on both panels", () => {
  for (const panel of PANELS) {
    for (const deviceClass of WALL_DEVICE_CLASSES) {
      it(`${deviceClass} fits its minimum-span box on the ${panel} panel`, () => {
        const widget = minimumSpanWidget(deviceClass);
        const descriptor = getWidgetDescriptor(deviceClass);
        // The type's minimum span (2×2 for every typed device widget) — the span
        // the walk inspects the card at.
        expect(widget.w).toBe(descriptor.min.w);
        expect(widget.h).toBe(descriptor.min.h);

        const rowUnit = panelRowUnit(
          shownWidgets(DEFAULT_DRAFT, panel),
          HARNESS_PANEL_SIZES[panel].height,
        );
        const values = widgetValues(widget, rowUnit);
        // A device widget's frame draws no surface and the widget configures no
        // title, so the renderer's box is the whole cell — and the wall does not
        // report the placement as too small.
        expect(values.framed).toBe(false);
        expect(values.titled).toBe(false);
        expect(values.tooSmall).toBe(false);

        const box = placedDeviceCardBox({
          columns: widget.w,
          rowUnit,
          heightPx: values.rendererHeightPx,
        });
        expect(box).toEqual({
          widthPx: widget.w * rowUnit,
          heightPx: values.rendererHeightPx,
        });

        const composition = resolveDeviceCardComposition({
          box,
          hasControls: CARD_HAS_CONTROLS[deviceClass](deviceFor(deviceClass).capabilities),
          active: true,
        });

        // The box admits exactly one form; the composition is that form, never a
        // taller one, and — the draft configuring no layout — the card composes
        // its own (stacked) direction.
        expect(composition.form).toBe(resolveCardFormForBox(box.heightPx));
        // At the minimum span every card composes its compact form.
        expect(composition.form).toBe("compact");
        expect(composition.orientation).toBe("stacked");

        // The card's own content, in its own ported metrics — its state row, plus
        // its actions row only while the controls are drawn — fits the box.
        const requiredPx =
          WALL_CARD_STATE_ROW_HEIGHT_PX +
          (composition.controls ? WALL_CARD_CONTROL_ROW_HEIGHT_PX : 0);
        expect(
          requiredPx,
          `${deviceClass} at ${panel}: ${requiredPx}px of card in a ${box.heightPx}px box`,
        ).toBeLessThanOrEqual(box.heightPx);

        // The fullest compact card still fits, so the bound does not depend on
        // which controls this device happens to declare.
        expect(WALL_CARD_COMPACT_HEIGHT_PX).toBeLessThanOrEqual(box.heightPx);
      });
    }
  }
});

describe("a minimum-span card never clips a control horizontally", () => {
  /** The wall's drawn gutter on a panel viewport: `clamp(16px, 2vmin, 24px)` of its own `vmin`. */
  function gutterPx(panel: HarnessPanel): number {
    const { width, height } = HARNESS_PANEL_SIZES[panel];
    return Math.min(24, Math.max(16, (2 * Math.min(width, height)) / 100));
  }

  /** One grid column's drawn width on a panel, in CSS pixels. */
  function columnWidthPx(panel: HarnessPanel, gutter: number): number {
    return (
      (HARNESS_PANEL_SIZES[panel].width - (WALL_GRID_COLUMNS + 1) * gutter) / WALL_GRID_COLUMNS
    );
  }

  it("derives the row width from the wall's own card metrics", () => {
    // The row is the controls (each bounded by the ported control height), the
    // ported control spacing between them, and the actions row's own horizontal
    // padding — the same numbers the ported cards draw with.
    expect(WALL_CARD_MAX_ROW_CONTROLS).toBe(3);
    expect(WALL_CARD_CONTROL_MAX_WIDTH_PX).toBe(WALL_CARD_METRICS.controlHeight);
    expect(WALL_CARD_CONTROL_ROW_MIN_WIDTH_PX).toBe(
      WALL_CARD_MAX_ROW_CONTROLS * WALL_CARD_CONTROL_MAX_WIDTH_PX +
        (WALL_CARD_MAX_ROW_CONTROLS - 1) * WALL_CARD_METRICS.controlSpacing +
        2 * WALL_CARD_METRICS.controlSpacing,
    );
    expect(WALL_CARD_CONTROL_ROW_MIN_WIDTH_PX).toBe(174);
  });

  it("takes its control count from the widest card row the fixture roster draws", () => {
    // The count is a card fact, not a span literal: a cover's discrete transport
    // is Open, Stop, Close — the most bounded controls any card row draws (a value
    // control shrinks out of the bound).
    const model = coverCardModel(deviceFor("cover").capabilities);
    expect(model.transportProperty).toBeDefined();
    expect(model.stop).not.toBeNull();
    expect(2 + (model.stop !== null ? 1 : 0)).toBe(WALL_CARD_MAX_ROW_CONTROLS);
  });

  for (const panel of PANELS) {
    it(`holds the widest control row at a typed widget's minimum span (${panel})`, () => {
      const gutter = gutterPx(panel);
      const column = columnWidthPx(panel, gutter);
      // A `columns`-wide cell is that many columns plus the gutters between them.
      const cellWidthPx = (columns: number): number => columns * column + (columns - 1) * gutter;

      // The typed widgets' minimum span holds the widest control row a card draws
      // at its minimum span, so no control is clipped horizontally on either
      // panel (specs/wall-display "A light card fits its minimum span").
      for (const deviceClass of WALL_DEVICE_CLASSES) {
        const { min } = getWidgetDescriptor(deviceClass);
        expect(min.w, `${deviceClass} columns`).toBe(WALL_MIN_DEVICE_COLUMNS);
        expect(
          cellWidthPx(min.w),
          `${deviceClass} at ${min.w} columns on the ${panel} panel`,
        ).toBeGreaterThanOrEqual(WALL_CARD_CONTROL_ROW_MIN_WIDTH_PX);
      }
    });
  }

  it("holds it at every row unit, because a column is never narrower than a row is tall", () => {
    // The panel-independent form of the same proof: a wall column is never
    // narrower than a row unit (the wall draws a tile at `span · unit + gutter`),
    // so the cell at the widget's minimum span holds the widest control row at
    // both bounds of the row unit.
    const cellWidthPx = (columns: number, unit: number): number =>
      columns * unit + (columns - 1) * WALL_GUTTER_MIN_PX;

    for (const unit of [ROW_UNIT_MIN, ROW_UNIT_MAX]) {
      const cell = cellWidthPx(WALL_MIN_DEVICE_COLUMNS, unit);
      expect(cell, `${unit}px rows`).toBeGreaterThanOrEqual(WALL_CARD_CONTROL_ROW_MIN_WIDTH_PX);
      // The derivation is tight: one column fewer does not hold the row.
      expect(cellWidthPx(WALL_MIN_DEVICE_COLUMNS - 1, unit)).toBeLessThan(
        WALL_CARD_CONTROL_ROW_MIN_WIDTH_PX,
      );
    }
  });
});

describe("the same box rule holds for a paged tile", () => {
  for (const panel of PANELS) {
    it(`hands a device-grid tile a box its card's compact form fits (${panel})`, () => {
      const widgets = shownWidgets(DEFAULT_DRAFT, panel);
      const rowUnit = panelRowUnit(widgets, HARNESS_PANEL_SIZES[panel].height);
      const grid = widgets.find((widget) => widget.type === "devices");
      if (!grid) throw new Error(`the ${panel} draft carries no device grid`);

      // The tile hosts hand each tile `wallTileCardBox` — the same
      // `placedDeviceCardBox` at the tile cell span — so a tile's box is the same
      // rule as a placed widget's, resolved from the page plan's row height.
      const page = resolvePagedTiles({
        items: deviceGridIds(grid.config),
        span: grid,
        rowUnit,
        page: 0,
      });
      const box = wallTileCardBox(rowUnit, page.rowHeightPx);

      expect(box.widthPx).toBe(WALL_TILE_CELL_COLUMNS * rowUnit);
      expect(WALL_CARD_COMPACT_HEIGHT_PX).toBeLessThanOrEqual(box.heightPx);
      expect(resolveDeviceCardComposition({ box, hasControls: true, active: true }).form).toBe(
        "compact",
      );
    });
  }
});

describe("both wall schemes share one composition", () => {
  it("declares the card metrics and the card composition as scheme-free numbers", async () => {
    // The scheme only changes colour tokens, so nothing that resolves a box, a
    // form, or a card's own rows may read a theme mechanism or a colour token.
    for (const file of ["metrics.ts", "card-composition.ts"]) {
      const source = stripComments(await readFile(join(CARDS_DIR, file), "utf8"));
      for (const token of ["data-theme", "dataset", "--hearth-"]) {
        expect(source, `${file} must not read ${token}`).not.toContain(token);
      }
      expect(/\btheme\b/.test(source), `${file} must not read a theme`).toBe(false);
    }
  });

  it("offers both schemes and applies one as the stage document's data-theme", async () => {
    expect([...HARNESS_THEMES].sort()).toEqual(["dark", "light"]);
    const stage = stripComments(await readFile(join(HARNESS_DIR, "stage.tsx"), "utf8"));
    // The scheme reaches the wall as Hearth's scope attribute on the stage
    // document's root — never as an input to a composition function.
    expect(stage).toContain("document.documentElement.dataset.theme = update.theme");
  });
});
