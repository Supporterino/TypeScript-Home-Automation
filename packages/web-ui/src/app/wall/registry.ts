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
import { ClockWidget } from "./widgets/ClockWidget.js";
import { DeviceWidget } from "./widgets/DeviceWidget.js";
import { EnergyWidget } from "./widgets/EnergyWidget.js";
import { FavoritesWidget } from "./widgets/FavoritesWidget.js";
import { RoomWidget } from "./widgets/RoomWidget.js";
import { SceneWidget } from "./widgets/SceneWidget.js";
import { StatusWidget } from "./widgets/StatusWidget.js";
import { WeatherWidget } from "./widgets/WeatherWidget.js";

/** Props every wall widget renderer receives: its own configuration and placement. */
export interface WallWidgetProps {
  widget: WallWidget;
}

/** A `{w, h}` span in grid cells. */
export interface WallWidgetSpan {
  w: number;
  h: number;
}

/** One widget type's declarative description, resolved by the grid and editor (design.md D6). */
export interface WallWidgetDescriptor {
  type: WallWidgetType;
  label: string;
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
 * The minimum interactive-control size, in CSS pixels, a wall widget must meet
 * (specs/wall-display "Touch Operation"). Larger than the desktop standard
 * because a wall is operated by touch from a distance.
 */
export const WALL_MIN_TOUCH_TARGET = 48;

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
      defaults: { w: 4, h: 2 },
      min: { w: 3, h: 2 },
      max: { w: 8, h: 4 },
      configSchema: WALL_WIDGET_CONFIG_SCHEMAS.clock,
      renderer: ClockWidget,
    },
    weather: {
      type: "weather",
      label: "Weather",
      defaults: { w: 4, h: 4 },
      min: { w: 3, h: 3 },
      max: { w: 8, h: 8 },
      configSchema: WALL_WIDGET_CONFIG_SCHEMAS.weather,
      renderer: WeatherWidget,
    },
    energy: {
      type: "energy",
      label: "Energy",
      defaults: { w: 4, h: 4 },
      min: { w: 3, h: 3 },
      max: { w: 8, h: 8 },
      configSchema: WALL_WIDGET_CONFIG_SCHEMAS.energy,
      renderer: EnergyWidget,
    },
    room: {
      type: "room",
      label: "Room",
      defaults: { w: 6, h: 5 },
      min: { w: 4, h: 4 },
      max: { w: 12, h: 10 },
      configSchema: WALL_WIDGET_CONFIG_SCHEMAS.room,
      renderer: RoomWidget,
    },
    favorites: {
      type: "favorites",
      label: "Favorites",
      defaults: { w: 6, h: 4 },
      min: { w: 3, h: 3 },
      max: { w: 12, h: 8 },
      configSchema: WALL_WIDGET_CONFIG_SCHEMAS.favorites,
      renderer: FavoritesWidget,
    },
    device: {
      type: "device",
      label: "Device",
      defaults: { w: 3, h: 3 },
      min: { w: 2, h: 2 },
      max: { w: 6, h: 6 },
      configSchema: WALL_WIDGET_CONFIG_SCHEMAS.device,
      renderer: DeviceWidget,
    },
    status: {
      type: "status",
      label: "Status",
      defaults: { w: 4, h: 3 },
      min: { w: 3, h: 2 },
      max: { w: 8, h: 6 },
      configSchema: WALL_WIDGET_CONFIG_SCHEMAS.status,
      renderer: StatusWidget,
    },
    scene: {
      type: "scene",
      label: "Scene",
      defaults: { w: 3, h: 2 },
      min: { w: 2, h: 2 },
      max: { w: 6, h: 4 },
      configSchema: WALL_WIDGET_CONFIG_SCHEMAS.scene,
      renderer: SceneWidget,
    },
  });

/** Resolves a widget type to its descriptor (design.md D6). */
export function getWidgetDescriptor(type: WallWidgetType): WallWidgetDescriptor {
  return WALL_WIDGET_REGISTRY[type];
}
