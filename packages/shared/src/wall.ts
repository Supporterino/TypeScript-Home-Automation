/**
 * Wall-display profile contracts (design.md D4, D6, D10; specs/wall-display
 * "Widget Grid Layout", "Widget Catalog", "Wall Configuration Editor").
 *
 * Shared because a profile is delivered over the wire, validated by the
 * server at the write boundary, and reused by the browser editor for
 * client-side validation (design.md D10) — the same schema on both sides so a
 * config that the editor accepts is exactly one the server accepts.
 *
 * This module carries only types and pure constants, so it has no runtime
 * import and stays safe to reach from first paint (design.md D24). The Zod
 * schema that validates these types lives in `wall-schema.ts` and is exposed
 * under the `@ts-ha/shared/wall-schema` subpath, keeping `zod` out of the root
 * barrel — and therefore out of the first-paint bundle.
 */

/** Fixed column count of the wall grid (design.md D4). */
export const WALL_GRID_COLUMNS = 12;

/**
 * Maximum number of grid rows a widget may occupy. The grid lays widgets out
 * with implicit rows, so an unbounded `y` would make an always-on panel create
 * thousands of tracked rows; every widget's `y + h` must stay within this bound
 * (specs/wall-display "Widget Grid Layout").
 */
export const WALL_GRID_MAX_ROWS = 24;

/** The profile shape version, carried so the config can evolve (design.md D10). */
export const WALL_PROFILE_VERSION = 1;

/** The widget types a profile may place (specs/wall-display "Widget Catalog"). */
export const WALL_WIDGET_TYPES = [
  "clock",
  "weather",
  "energy",
  "room",
  "favorites",
  "device",
  "status",
  "scene",
] as const;

/** A supported widget type. */
export type WallWidgetType = (typeof WALL_WIDGET_TYPES)[number];

/** The orientations a profile may override its base layout for (design.md D4). */
export const WALL_ORIENTATIONS = ["portrait", "landscape"] as const;

/** A grid orientation a profile may carry a distinct layout for. */
export type WallOrientation = (typeof WALL_ORIENTATIONS)[number];

/** The kind of change a `wall` stream event reports (design.md D9). */
export const WALL_CHANGE_KINDS = ["created", "updated", "deleted"] as const;

/** Whether a profile was created, updated, or deleted. */
export type WallChangeKind = (typeof WALL_CHANGE_KINDS)[number];

/** Config for the widgets that expose only an optional title (clock, weather, energy, status). */
export interface WallTitledWidgetConfig {
  readonly title?: string;
}

/** Config for the room widget: the room to present, with an optional title. */
export interface WallRoomWidgetConfig {
  readonly roomId: string;
  readonly title?: string;
}

/** Config for the single-device widget: the device to control, with an optional title. */
export interface WallDeviceWidgetConfig {
  readonly qualifiedId: string;
  readonly title?: string;
}

/** Config for a scene button: the automation to trigger, with an optional label. */
export interface WallSceneWidgetConfig {
  readonly automation: string;
  readonly label?: string;
}

/** Config for the favorites widget: no options (any extra keys are ignored). */
export type WallFavoritesWidgetConfig = Record<string, unknown>;

/**
 * One configured widget in a profile.
 *
 * `id` is unique within its layout and stable across an edit so a live wall
 * and the editor can correlate a widget. `type` selects the renderer from the
 * widget registry (design.md D6). `config` is the widget's type-specific
 * settings — validated by that type's own schema in `wall-schema.ts`.
 * `x`/`y`/`w`/`h` place the widget on the {@link WALL_GRID_COLUMNS}-column
 * grid: `x`/`y` are the top-left cell (≥ 0), `w`/`h` the span in cells (≥ 1),
 * `x + w` must not exceed the column count, and `y + h` must not exceed
 * {@link WALL_GRID_MAX_ROWS} (design.md D4).
 */
export interface WallWidget {
  readonly id: string;
  readonly type: WallWidgetType;
  readonly config: Record<string, unknown>;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * A profile's widget composition: a base layout plus, optionally, a full
 * layout per orientation (design.md D4).
 *
 * An orientation without an override falls back to `widgets`, so a profile
 * reflows between portrait and landscape without a second profile. When an
 * override is present it replaces the base layout for that orientation
 * entirely.
 */
export interface WallProfileConfig {
  readonly widgets: readonly WallWidget[];
  readonly orientations?: Partial<Record<WallOrientation, readonly WallWidget[]>>;
}

/**
 * A named, versioned wall profile (specs/wall-display "Named Wall Profiles",
 * "Wall Configuration Editor").
 *
 * `name` is both the profile's stable identifier and its address — the value
 * a wall is opened by and the segment it is stored under; `version` pins the
 * config shape (design.md D10); `config` holds the widget composition.
 */
export interface WallProfile {
  readonly name: string;
  readonly version: number;
  readonly config: WallProfileConfig;
}
