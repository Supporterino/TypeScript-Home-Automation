/**
 * The harness's default draft composition: a hand-authored profile, not a layout
 * algorithm.
 */
import type { WallProfileConfig, WallWidget } from "@ts-ha/shared";
import type { WallDeviceClass } from "../cards/device-class.js";
import { resolveLayout, WALL_MIN_DEVICE_COLUMNS, WALL_MIN_DEVICE_ROWS } from "../grid.js";
import {
  DEVICE_CLASS_DEVICE_IDS,
  DEVICE_GRID_SELECTION,
  HARNESS_ROOM_ID,
  HARNESS_SCENE_NAME,
  HARNESS_TEMPERATURE_ONLY_SENSOR_ID,
} from "./fixtures.js";
import type { HarnessPanel } from "./messages.js";

/**
 * A typed device widget for one device class the fixture roster backs, at the type's
 * minimum span.
 */
function deviceClassWidget(
  deviceClass: WallDeviceClass,
  placement: { readonly x: number; readonly y: number },
): WallWidget {
  return {
    id: `device-${deviceClass}`,
    type: deviceClass,
    config: { qualifiedId: DEVICE_CLASS_DEVICE_IDS[deviceClass] },
    x: placement.x,
    y: placement.y,
    w: WALL_MIN_DEVICE_COLUMNS,
    h: WALL_MIN_DEVICE_ROWS,
  };
}

/**
 * The landscape composition: a home band across the top, a living-room band below it,
 * and the device cards and grids that fill the rest.
 */
const LANDSCAPE: readonly WallWidget[] = [
  { id: "clock-hero", type: "clock", config: {}, x: 0, y: 0, w: 6, h: 3, zone: "Home" },
  { id: "weather", type: "weather", config: {}, x: 6, y: 0, w: 3, h: 3, zone: "Home" },
  { id: "energy", type: "energy", config: {}, x: 9, y: 0, w: 3, h: 3, zone: "Home" },
  {
    id: "room-living",
    type: "room",
    config: { roomId: HARNESS_ROOM_ID },
    x: 0,
    y: 3,
    w: 4,
    h: 6,
    zone: "Living Room",
  },
  {
    id: "device-light",
    type: "light",
    config: { qualifiedId: DEVICE_CLASS_DEVICE_IDS.light },
    x: 4,
    y: 3,
    w: WALL_MIN_DEVICE_COLUMNS,
    h: WALL_MIN_DEVICE_ROWS,
  },
  {
    id: "device-cover",
    type: "cover",
    config: { qualifiedId: DEVICE_CLASS_DEVICE_IDS.cover },
    x: 7,
    y: 3,
    w: WALL_MIN_DEVICE_COLUMNS,
    h: WALL_MIN_DEVICE_ROWS,
  },
  {
    id: "scene-evening",
    type: "scene",
    config: { automation: HARNESS_SCENE_NAME },
    x: 10,
    y: 3,
    w: 2,
    h: 2,
  },
  deviceClassWidget("fan", { x: 4, y: 5 }),
  deviceClassWidget("climate", { x: 7, y: 5 }),
  {
    id: "temperature-hall",
    type: "temperature",
    config: { qualifiedId: DEVICE_CLASS_DEVICE_IDS.entity },
    x: 10,
    y: 5,
    w: 2,
    h: 2,
    zone: "Living Room",
  },
  // The attic sensor declares no humidity, so it presents its temperature alone.
  {
    id: "temperature-attic",
    type: "temperature",
    config: { qualifiedId: HARNESS_TEMPERATURE_ONLY_SENSOR_ID },
    x: 10,
    y: 7,
    w: 2,
    h: 2,
    zone: "Living Room",
  },
  deviceClassWidget("lock", { x: 4, y: 7 }),
  deviceClassWidget("number", { x: 7, y: 7 }),
  {
    id: "device-grid",
    type: "devices",
    config: { qualifiedIds: [...DEVICE_GRID_SELECTION] },
    x: 0,
    y: 9,
    w: 6,
    h: 4,
  },
  { id: "favorites", type: "favorites", config: {}, x: 6, y: 9, w: 3, h: 5 },
  deviceClassWidget("select", { x: 9, y: 9 }),
  deviceClassWidget("entity", { x: 9, y: 11 }),
];

/**
 * The portrait composition: the same widgets in a taller, two-column arrangement, a
 * hand-authored override rather than a transformation.
 */
const PORTRAIT: readonly WallWidget[] = [
  { id: "clock-hero", type: "clock", config: {}, x: 0, y: 0, w: 8, h: 4, zone: "Home" },
  { id: "weather", type: "weather", config: {}, x: 8, y: 0, w: 4, h: 4, zone: "Home" },
  { id: "energy", type: "energy", config: {}, x: 0, y: 4, w: 6, h: 4, zone: "Home" },
  {
    id: "room-living",
    type: "room",
    config: { roomId: HARNESS_ROOM_ID },
    x: 6,
    y: 4,
    w: 6,
    h: 6,
    zone: "Living Room",
  },
  {
    id: "temperature-hall",
    type: "temperature",
    config: { qualifiedId: DEVICE_CLASS_DEVICE_IDS.entity },
    x: 0,
    y: 8,
    w: 3,
    h: 2,
    zone: "Living Room",
  },
  // The same second reading case the landscape list carries.
  {
    id: "temperature-attic",
    type: "temperature",
    config: { qualifiedId: HARNESS_TEMPERATURE_ONLY_SENSOR_ID },
    x: 0,
    y: 19,
    w: 2,
    h: 2,
    zone: "Living Room",
  },
  {
    id: "device-light",
    type: "light",
    config: { qualifiedId: DEVICE_CLASS_DEVICE_IDS.light },
    x: 3,
    y: 8,
    w: WALL_MIN_DEVICE_COLUMNS,
    h: WALL_MIN_DEVICE_ROWS,
  },
  deviceClassWidget("cover", { x: 0, y: 10 }),
  deviceClassWidget("fan", { x: 3, y: 10 }),
  deviceClassWidget("climate", { x: 6, y: 10 }),
  deviceClassWidget("lock", { x: 9, y: 10 }),
  deviceClassWidget("number", { x: 0, y: 12 }),
  deviceClassWidget("select", { x: 3, y: 12 }),
  deviceClassWidget("entity", { x: 6, y: 12 }),
  {
    id: "scene-evening",
    type: "scene",
    config: { automation: HARNESS_SCENE_NAME },
    x: 10,
    y: 12,
    w: 2,
    h: 2,
  },
  {
    id: "device-grid",
    type: "devices",
    config: { qualifiedIds: [...DEVICE_GRID_SELECTION] },
    x: 0,
    y: 14,
    w: 8,
    h: 5,
  },
  { id: "favorites", type: "favorites", config: {}, x: 8, y: 14, w: 4, h: 5 },
];

/** The draft the stage opens with; the panel edits a copy of it (group 5). */
export const DEFAULT_DRAFT: WallProfileConfig = {
  widgets: LANDSCAPE,
  orientations: { portrait: PORTRAIT },
};

/**
 * Which widget list the panel is editing. A panel whose orientation carries an override
 * renders that list.
 */
export type HarnessListTarget = "base" | "override";

/** The widget list a panel renders — the wall's own `resolveLayout` rule. */
export function shownWidgets(
  config: WallProfileConfig,
  panel: HarnessPanel,
): readonly WallWidget[] {
  return resolveLayout(config, panel);
}

/** Which list the panel edits: the panel's own override when it has one, else the base layout. */
export function activeTarget(config: WallProfileConfig, panel: HarnessPanel): HarnessListTarget {
  return config.orientations?.[panel] === undefined ? "base" : "override";
}

/**
 * Runs one of the editor's own mutations over the list the panel is editing.
 */
export function editActiveList(
  config: WallProfileConfig,
  panel: HarnessPanel,
  mutate: (draft: WallProfileConfig) => WallProfileConfig,
): WallProfileConfig {
  if (activeTarget(config, panel) === "base") return mutate(config);
  const edited = mutate({ widgets: shownWidgets(config, panel) }).widgets;
  return { ...config, orientations: { ...config.orientations, [panel]: edited } };
}

/**
 * Drops the panel's orientation override, so the base layout renders in every panel
 * again.
 */
export function clearOrientationOverride(
  config: WallProfileConfig,
  panel: HarnessPanel,
): WallProfileConfig {
  const orientations = { ...config.orientations };
  delete orientations[panel];
  return { ...config, orientations };
}
