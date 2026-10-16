/**
 * The declarative widget registry: every widget type's label, grid dimensions,
 * config schema, and renderer, resolved by the grid and editor.
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
   * draws none of its own.
   */
  contained?: boolean;
  /**
   * The widget's presentation tier for the span it was placed at, for a renderer's
   * scale detail only — never to select a composition.
   */
  tier: WallWidgetTier;
  /**
   * The form the card must compose at this placement, resolved from the box the
   * renderer gets.
   */
  cardForm: WallCardForm;
  /**
   * The height, in CSS pixels, the renderer's own box gets at this placement — the
   * cell minus the frame's inset and its opt-in title.
   */
  rendererHeightPx: number;
  /**
   * The panel's resolved row unit, in CSS pixels — the same value the grid places
   * the widget with.
   */
  rowUnit: number;
}

/** A `{w, h}` span in grid cells. */
export interface WallWidgetSpan {
  w: number;
  h: number;
}

/**
 * A widget's card grammar: `ambient` readouts render chrome-less, `control`
 * widgets as a surface tile whose whole card is the touch target.
 */
export type WallWidgetGrammar = "ambient" | "control";

/** One widget type's declarative description, resolved by the grid and editor. */
export interface WallWidgetDescriptor {
  type: WallWidgetType;
  label: string;
  /** Whether the type renders as an ambient readout or a control surface. */
  grammar: WallWidgetGrammar;
  /** The default `{w, h}` a newly added widget of this type gets. */
  defaults: WallWidgetSpan;
  /** The smallest `{w, h}` the editor may place this type at. */
  min: WallWidgetSpan;
  /** The largest `{w, h}` the editor may place this type at. */
  max: WallWidgetSpan;
  /**
   * The type's one-row ("slim") placement rule, when it has one: the `{w, h}` the
   * type may occupy at one row, and whether that applies `always` or only when the
   * bound device presents no controls (`read-only`). The frame's surface decision
   * and the effective-minimum resolver both read it.
   */
  slim?: { min: WallWidgetSpan; when: "always" | "read-only" };
  /**
   * The type's config schema — the same shared per-type schema the server
   * validates against.
   */
  configSchema: ZodTypeAny;
  renderer: ComponentType<WallWidgetProps>;
}

/**
 * One typed device widget's descriptor: the class's label, minimum span, and the
 * shared typed-device renderer.
 */
function typedDeviceDescriptor(type: WallDeviceClass): WallWidgetDescriptor {
  return {
    type,
    label: WALL_DEVICE_CLASS_LABELS[type],
    grammar: "control",
    defaults: { w: WALL_MIN_DEVICE_COLUMNS, h: WALL_MIN_DEVICE_ROWS },
    min: { w: WALL_MIN_DEVICE_COLUMNS, h: WALL_MIN_DEVICE_ROWS },
    max: { w: 6, h: 6 },
    /**
     * One row: a typed device may be authored slim exactly when its bound device
     * presents no controls — an `entity`, or a device reporting no writable
     * property. The minimum stays two rows for a device that does present controls.
     */
    slim: { min: { w: 3, h: 1 }, when: "read-only" },
    configSchema: WALL_WIDGET_CONFIG_SCHEMAS[type],
    renderer: DeviceWidget,
  };
}

/**
 * The minimum interactive-control size, in CSS pixels, a wall widget must meet —
 * the ported card system's own control height.
 */
export const WALL_MIN_TOUCH_TARGET = 42;

/**
 * The minimum space, in CSS pixels, the wall keeps between two adjacent
 * interactive controls.
 */
export const WALL_MIN_CONTROL_GAP = 8;

/** A unique marker carried by the lazy `wall` chunk and not by first paint. */
export const WALL_CHUNK_MARKER = "ts-ha-wall-chunk";

/**
 * Every widget type's descriptor, typed as a total record and frozen.
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
       * Six rows: the smallest span that holds the card's chrome plus one tile row
       * and the page-control row.
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
       * Five rows: the smallest span that holds the card's chrome plus one tile row
       * and the page-control row.
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
      /**
       * One row: a scene may be authored slim. At one row the wall renders it
       * chrome-less, so the whole cell is the scene's touch target.
       */
      min: { w: 2, h: 1 },
      max: { w: 6, h: 4 },
      slim: { min: { w: 2, h: 1 }, when: "always" },
      configSchema: WALL_WIDGET_CONFIG_SCHEMAS.scene,
      renderer: SceneWidget,
    },
    link: {
      type: "link",
      label: "Link",
      grammar: "control",
      defaults: { w: 3, h: 2 },
      /**
       * One row: a link may be authored slim. At one row the wall renders it
       * chrome-less and the route draws flush, so the whole cell is the target.
       */
      min: { w: 2, h: 1 },
      max: { w: 6, h: 4 },
      slim: { min: { w: 2, h: 1 }, when: "always" },
      configSchema: WALL_WIDGET_CONFIG_SCHEMAS.link,
      renderer: LinkWidget,
    },
    devices: {
      type: "devices",
      label: "Devices",
      grammar: "control",
      defaults: { w: 6, h: 4 },
      /**
       * Two tile columns by two tile rows — the smallest span that holds a page's
       * first row of device tiles.
       */
      min: { w: 2 * WALL_MIN_DEVICE_COLUMNS, h: 4 },
      max: { w: 12, h: 12 },
      configSchema: WALL_WIDGET_CONFIG_SCHEMAS.devices,
      renderer: DeviceGridWidget,
    },
  });

/** Resolves a widget type to its descriptor. */
export function getWidgetDescriptor(type: WallWidgetType): WallWidgetDescriptor {
  return WALL_WIDGET_REGISTRY[type];
}
