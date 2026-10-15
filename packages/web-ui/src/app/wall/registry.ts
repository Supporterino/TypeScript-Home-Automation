/**
 * The declarative widget registry (design.md D6; specs/wall-display "Widget
 * Catalog"). Every widget type is described once — its label, default and
 * min/max grid dimensions, its config schema, and its renderer — and the grid
 * and editor both resolve a type through {@link getWidgetDescriptor}.
 *
 * Loaded only inside the lazy `wall` chunk (the wall grid and the editor are
 * its sole consumers), so nothing here reaches first paint.
 */
import type { WallWidget, WallWidgetType } from "@ts-ha/shared";
import { WALL_WIDGET_CONFIG_SCHEMAS } from "@ts-ha/shared/wall-schema";
import type { ComponentType } from "react";
import type { ZodTypeAny } from "zod";
import { WALL_DEVICE_CLASS_LABELS, type WallDeviceClass } from "./cards/device-class.js";
import { WALL_MIN_DEVICE_COLUMNS, WALL_MIN_DEVICE_ROWS } from "./grid.js";
import type { WallCardForm, WallWidgetTier } from "./span.js";
import { ClockWidget } from "./widgets/ClockWidget.js";
import { DeviceGridWidget } from "./widgets/DeviceGridWidget.js";
import { DeviceWidget } from "./widgets/DeviceWidget.js";
import { EnergyWidget } from "./widgets/EnergyWidget.js";
import { FavoritesWidget } from "./widgets/FavoritesWidget.js";
import { LinkWidget } from "./widgets/LinkWidget.js";
import { RoomWidget } from "./widgets/RoomWidget.js";
import { SceneWidget } from "./widgets/SceneWidget.js";
import { StatusWidget } from "./widgets/StatusWidget.js";
import { TemperatureWidget } from "./widgets/TemperatureWidget.js";
import { WeatherWidget } from "./widgets/WeatherWidget.js";

/**
 * Props every wall widget renderer receives: its own configuration, its
 * placement, and the resolved geometry of the panel it renders on.
 */
export interface WallWidgetProps {
  widget: WallWidget;
  /**
   * Whether the frame draws the widget's own surface, so a nested device card
   * draws none of its own and a card stays a single surface (design.md D2;
   * specs/wall-display "A card is a single surface"). Every typed device widget's
   * frame is chrome-less, so it passes `false` and its card owns the surface.
   */
  contained?: boolean;
  /**
   * The widget's presentation tier for the span it was placed at, resolved from
   * its type's registry spans by `resolveSpanTier` (wall-zones-and-fit D3;
   * specs/wall-display "Span-Aware Card Presentation"). A renderer uses it for
   * its *scale* detail — a readout's font tier, a link's label size — never to
   * select a composition: the area tier answers how much room the placement has,
   * not what fits the box, and a type whose `min` and `defaults` coincide is
   * `regular` at every placement above its minimum however short the cell is. A
   * composition follows the resolved form below, or the renderer's own budget.
   */
  tier: WallWidgetTier;
  /**
   * The form the card must compose at this placement, resolved from the box the
   * renderer actually gets — the cell minus the frame's inset and title — by
   * `resolveCardFormForHeight` over `frame.ts`'s `rendererBoxHeightPx`
   * (wall-zones-and-fit D3, D4). A card whose full form does not fit composes its
   * compact form instead, so a card can never overflow or clip at any legal
   * placement — the area tier above cannot answer this, because a type whose `min`
   * and `defaults` coincide is `regular` at every placement above its minimum
   * however short the cell is.
   */
  cardForm: WallCardForm;
  /**
   * The height, in CSS pixels, the renderer's own box gets at this placement —
   * the cell minus the frame's inset and its opt-in title, by `frame.ts`'s
   * `rendererBoxHeightPx` (wall-zones-and-fit D3, D4). The form above is this
   * number resolved against the wall light card's own budget; a renderer whose
   * multi-form composition has its *own* budget (the scene tile's row and stacked
   * forms) resolves against this number instead, so each composition is measured
   * against what it actually needs rather than one global card budget.
   */
  rendererHeightPx: number;
  /**
   * The panel's resolved row unit, in CSS pixels — the same value the grid
   * places the widget with (wall-zones-and-fit D5, D12). A widget whose own
   * content is span-derived geometry rather than content (the device grid's
   * pages) resolves it against this, so the renderer and the panel agree without
   * the widget measuring itself.
   */
  rowUnit: number;
}

/** A `{w, h}` span in grid cells. */
export interface WallWidgetSpan {
  w: number;
  h: number;
}

/**
 * A widget's card grammar (design.md D2). `ambient` readouts render chrome-less
 * directly on the background; `control` widgets render as a surface tile whose
 * whole card is the touch target.
 */
export type WallWidgetGrammar = "ambient" | "control";

/** One widget type's declarative description, resolved by the grid and editor (design.md D6). */
export interface WallWidgetDescriptor {
  type: WallWidgetType;
  label: string;
  /** Whether the type renders as an ambient readout or a control surface (design.md D2). */
  grammar: WallWidgetGrammar;
  /** The default `{w, h}` a newly added widget of this type gets. */
  defaults: WallWidgetSpan;
  /** The smallest `{w, h}` the editor may place this type at (specs/wall-display "A widget cannot be under-sized"). */
  min: WallWidgetSpan;
  /** The largest `{w, h}` the editor may place this type at. */
  max: WallWidgetSpan;
  /**
   * The type's config schema — the same shared per-type schema the server
   * validates against (design.md D10), so the editor and the write boundary
   * can never drift.
   */
  configSchema: ZodTypeAny;
  renderer: ComponentType<WallWidgetProps>;
}

/**
 * One typed device widget's descriptor (design.md D1, D3; specs/wall-display
 * "Widget Catalog"). Each device class the capability model can drive gets its
 * own type, sharing the one typed device config (`WallTypedDeviceWidgetConfig`) and
 * the one renderer, so the difference between them is *which card* the type names
 * — the renderer resolves its class from the widget's own type.
 *
 * The spans start from the ported card's own size. The minimum width is *derived*
 * from the widest control row a card draws (`wall/grid.ts`'s
 * `WALL_MIN_DEVICE_COLUMNS`), so a card at the type's minimum span never clips a
 * control horizontally on either panel; the minimum height is the cell the wall's
 * row unit is derived to hold a compact device card in with nothing to spare
 * (`WALL_MIN_DEVICE_ROWS`). They are both the default — the smallest legal
 * placement — and `6×6` is the maximum, so a device card can be enlarged to the
 * roomiest composition the wall draws. A minimum that *is* the default makes the
 * smallest legal placement `compact` (`resolveSpanTier`), which is the
 * composition the ported card's budget fits.
 */
function typedDeviceDescriptor(type: WallDeviceClass): WallWidgetDescriptor {
  return {
    type,
    label: WALL_DEVICE_CLASS_LABELS[type],
    grammar: "control",
    defaults: { w: WALL_MIN_DEVICE_COLUMNS, h: WALL_MIN_DEVICE_ROWS },
    min: { w: WALL_MIN_DEVICE_COLUMNS, h: WALL_MIN_DEVICE_ROWS },
    max: { w: 6, h: 6 },
    configSchema: WALL_WIDGET_CONFIG_SCHEMAS[type],
    renderer: DeviceWidget,
  };
}

/**
 * The minimum interactive-control size, in CSS pixels, a wall widget must meet
 * (design.md D2, D4; specs/wall-display "Touch Operation"). It is the ported card
 * system's own control height — the value the ported device cards draw their
 * controls at — so the wall's floor and the cards it ports cannot disagree.
 */
export const WALL_MIN_TOUCH_TARGET = 42;

/**
 * The minimum space, in CSS pixels, the wall keeps between two adjacent
 * interactive controls, so a touch intended for one cannot plausibly activate
 * its neighbour (design.md D4; specs/wall-display "Adjacent controls are
 * separated"). It is the wall's own floor, matching the Hearth spacing rhythm's
 * `--hearth-space-2` (8 px) the wall's control rows and the wall gutter draw
 * with, and is a minimum — a control row may space its controls further.
 */
export const WALL_MIN_CONTROL_GAP = 8;

/**
 * A unique marker carried by the lazy `wall` chunk and not by first paint
 * (task 5.12). The wall grid renders it onto its root element and the asset
 * test asserts the string appears in no first-paint asset, so a regression
 * that pulls the wall (and its editor dependency) into the entry bundle fails
 * the build gate rather than silently blowing the first-paint budget.
 */
export const WALL_CHUNK_MARKER = "ts-ha-wall-chunk";

/**
 * Every widget type's descriptor. Typed as a total record so adding a
 * `WALL_WIDGET_TYPES` entry without a descriptor is a compile error, and
 * frozen so it cannot be mutated at runtime.
 */
export const WALL_WIDGET_REGISTRY: Readonly<Record<WallWidgetType, WallWidgetDescriptor>> =
  Object.freeze({
    clock: {
      type: "clock",
      label: "Clock",
      grammar: "ambient",
      defaults: { w: 4, h: 2 },
      min: { w: 2, h: 2 },
      max: { w: 8, h: 4 },
      configSchema: WALL_WIDGET_CONFIG_SCHEMAS.clock,
      renderer: ClockWidget,
    },
    weather: {
      type: "weather",
      label: "Weather",
      grammar: "ambient",
      defaults: { w: 3, h: 3 },
      min: { w: 3, h: 3 },
      max: { w: 8, h: 8 },
      configSchema: WALL_WIDGET_CONFIG_SCHEMAS.weather,
      renderer: WeatherWidget,
    },
    energy: {
      type: "energy",
      label: "Energy",
      grammar: "ambient",
      defaults: { w: 4, h: 4 },
      min: { w: 3, h: 3 },
      max: { w: 8, h: 8 },
      configSchema: WALL_WIDGET_CONFIG_SCHEMAS.energy,
      renderer: EnergyWidget,
    },
    room: {
      type: "room",
      label: "Room",
      grammar: "control",
      defaults: { w: 6, h: 6 },
      /**
       * Six rows: the smallest span that holds the card's own chrome — its frame
       * inset, the room glyph with its name, the member count, and the room-wide
       * command row — plus one tile row and the page-control row at the wall's
       * floors, so a paged room card never clips a tile below the touch target
       * (wall-zones-and-fit D5). `wall-registry.test.ts` asserts the derivation.
       */
      min: { w: 4, h: 6 },
      max: { w: 12, h: 10 },
      configSchema: WALL_WIDGET_CONFIG_SCHEMAS.room,
      renderer: RoomWidget,
    },
    favorites: {
      type: "favorites",
      label: "Favorites",
      grammar: "control",
      defaults: { w: 6, h: 6 },
      /**
       * Five rows: the smallest span that holds the card's own chrome — its frame
       * inset, the favorites glyph with its title, and the favorite count — plus
       * one tile row and the page-control row at the wall's floors, so a paged
       * favorites card never clips a tile below the touch target
       * (wall-zones-and-fit D5). `wall-registry.test.ts` asserts the derivation.
       */
      min: { w: 3, h: 5 },
      max: { w: 12, h: 8 },
      configSchema: WALL_WIDGET_CONFIG_SCHEMAS.favorites,
      renderer: FavoritesWidget,
    },
    light: typedDeviceDescriptor("light"),
    cover: typedDeviceDescriptor("cover"),
    fan: typedDeviceDescriptor("fan"),
    climate: typedDeviceDescriptor("climate"),
    lock: typedDeviceDescriptor("lock"),
    number: typedDeviceDescriptor("number"),
    select: typedDeviceDescriptor("select"),
    entity: typedDeviceDescriptor("entity"),
    temperature: {
      type: "temperature",
      label: "Temperature",
      grammar: "ambient",
      defaults: { w: 3, h: 2 },
      min: { w: 2, h: 2 },
      max: { w: 6, h: 4 },
      configSchema: WALL_WIDGET_CONFIG_SCHEMAS.temperature,
      renderer: TemperatureWidget,
    },
    status: {
      type: "status",
      label: "Status",
      grammar: "ambient",
      defaults: { w: 4, h: 3 },
      min: { w: 3, h: 2 },
      max: { w: 8, h: 6 },
      configSchema: WALL_WIDGET_CONFIG_SCHEMAS.status,
      renderer: StatusWidget,
    },
    scene: {
      type: "scene",
      label: "Scene",
      grammar: "control",
      defaults: { w: 2, h: 2 },
      min: { w: 2, h: 2 },
      max: { w: 6, h: 4 },
      configSchema: WALL_WIDGET_CONFIG_SCHEMAS.scene,
      renderer: SceneWidget,
    },
    link: {
      type: "link",
      label: "Link",
      grammar: "control",
      defaults: { w: 3, h: 2 },
      min: { w: 2, h: 2 },
      max: { w: 6, h: 4 },
      configSchema: WALL_WIDGET_CONFIG_SCHEMAS.link,
      renderer: LinkWidget,
    },
    devices: {
      type: "devices",
      label: "Devices",
      grammar: "control",
      defaults: { w: 6, h: 4 },
      /**
       * Two tile columns by two tile rows — the smallest span that holds a
       * page's first row of device tiles at the wall's floors, so a device grid
       * can never be placed too small to page (wall-zones-and-fit D12;
       * specs/wall-display "Device Grid Widget"). A tile is a typed device
       * widget's minimum span (`WALL_MIN_DEVICE_COLUMNS` columns wide), so two
       * tile columns are `2 · WALL_MIN_DEVICE_COLUMNS`; the row count is
       * `WALL_MIN_DEVICE_ROWS` tiles plus the page chrome.
       * `wall-device-grid.test.ts` asserts it against the tile cell.
       */
      min: { w: 2 * WALL_MIN_DEVICE_COLUMNS, h: 4 },
      max: { w: 12, h: 12 },
      configSchema: WALL_WIDGET_CONFIG_SCHEMAS.devices,
      renderer: DeviceGridWidget,
    },
  });

/** Resolves a widget type to its descriptor (design.md D6). */
export function getWidgetDescriptor(type: WallWidgetType): WallWidgetDescriptor {
  return WALL_WIDGET_REGISTRY[type];
}
