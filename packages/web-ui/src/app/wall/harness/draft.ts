/**
 * The harness's default draft composition (design.md D2; task 4.1).
 *
 * A hand-authored profile, not a layout algorithm: the harness re-implements no
 * wall layout (D2), so this is data a panel control (group 5) may edit, and the
 * grid, the row unit, the gutter, the centering rule, the fit verdict, and the
 * zone bands are all the wall's own once it reaches `WallGrid`.
 *
 * It is a legal profile — `tests/wall-harness.test.ts` validates it with the
 * shared `wallProfileConfigSchema` and checks every widget against the widget
 * registry's `min`/`max` — that spans the widget catalogue the fixture roster
 * covers, groups widgets into two zone bands so the bands are visible at all,
 * and reflows through a hand-authored portrait override, so the answer
 * `useOrientation()` gives inside the stage is observable (D4; task 4.2).
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
 * A typed device widget for one device class the fixture roster backs, at the
 * type's minimum span ({@link WALL_MIN_DEVICE_COLUMNS}×{@link WALL_MIN_DEVICE_ROWS})
 * — the cell every typed card's composition is derived for, so the draft places
 * the class rather than only reaching it through a tile or a paged device grid. A
 * harness walk therefore reaches every typed card directly;
 * `tests/wall-harness-walk.test.ts` asserts the coverage and that each card fits
 * its minimum-span box on both panels.
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
 * The landscape composition: a home band across the top (the clock hero, the
 * weather and energy readings), a living-room band below it, and the device
 * cards and grids that fill the rest. Every widget is placed at or above its
 * registry minimum, so each renders its real composition rather than the frame's
 * too-small explanation.
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
  // The widget's other reading case beside the hall sensor's: the attic sensor
  // declares no humidity, so this placement presents its temperature alone
  // (design.md W5; task 5.3).
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
 * The portrait composition: the same widgets in a taller, two-column
 * arrangement. A hand-authored override rather than a transformation of the
 * landscape layout — recomposing would be harness-local layout code, which D2
 * forbids — and a visibly different composition, so switching the panel to
 * portrait shows that `useOrientation()` reported portrait and the profile's
 * override applied.
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
  // The same second reading case the landscape list carries, placed in this
  // layout's own free cells (design.md W5; task 5.3).
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
 * Which widget list the panel is editing (task 5.1). A panel whose orientation
 * carries an override renders that list, so editing the base list would be
 * invisible there — the panel edits whichever list the panel in front of it
 * actually renders, and says which.
 */
export type HarnessListTarget = "base" | "override";

/** The widget list a panel renders — the wall's own `resolveLayout` rule (design.md D4). */
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
 *
 * The editor's mutations operate on a config's base `widgets`, so the edit is
 * applied to a config whose base list *is* the panel's override and the result is
 * written back to `orientations`. That is how the override list gets the editor's
 * own clamping, footer floor, free-position search, and id rule — the very same
 * functions the base layout gets — without a second copy of any of them.
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
 * Drops the panel's orientation override, so the base layout renders in every
 * panel again (task 5.1). The other orientation's list, if any, is untouched.
 */
export function clearOrientationOverride(
  config: WallProfileConfig,
  panel: HarnessPanel,
): WallProfileConfig {
  const orientations = { ...config.orientations };
  delete orientations[panel];
  return { ...config, orientations };
}
