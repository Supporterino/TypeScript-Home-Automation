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
 *
 * Version 2 replaces the single generic `device` widget with one widget type per
 * device class the capability model can drive, each sharing one typed device
 * config (design.md D3, D6, D8; specs/wall-display "Widget Catalog"). The
 * version-1 widget and profile shapes are exported alongside it so a stored
 * profile can be migrated rather than rejected.
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

/**
 * The profile shape version, carried so the config can evolve (design.md D8).
 * Version 2 replaced the single generic `device` widget with one widget type per
 * device class; a stored version-1 profile is migrated on load rather than
 * rejected (specs/wall-display "Wall Profile Version and Migration").
 */
export const WALL_PROFILE_VERSION = 2;

/**
 * The version-1 profile shape's version, retained so the migration can read a
 * stored version-1 profile (design.md D8; specs/wall-display "Wall Profile
 * Version and Migration").
 */
export const WALL_V1_PROFILE_VERSION = 1;

/**
 * Maximum length of a widget's optional zone label (wall-zones-and-fit D1;
 * specs/wall-display "Wall Zones"). The label is drawn as a band caption, so a
 * profile cannot make an arbitrarily long one; the bound is declared once here
 * so the schema and the editor validate against the same value.
 */
export const WALL_ZONE_MAX_LENGTH = 40;

/**
 * The widget types a profile may place (design.md D3; specs/wall-display
 * "Widget Catalog"). The single generic `device` widget retires in favour of one
 * type per device class the capability model can drive; `entity` is the typed
 * fallback for a device of no class.
 */
export const WALL_WIDGET_TYPES = [
  "clock",
  "weather",
  "energy",
  "room",
  "favorites",
  "temperature",
  "status",
  "scene",
  "link",
  "devices",
  "light",
  "cover",
  "fan",
  "climate",
  "lock",
  "number",
  "select",
  "entity",
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

/**
 * Config for the version-1 single-device widget: the device to control, with an
 * optional title (design.md D8). Retained so a stored version-1 profile can be
 * read and migrated; version 2 replaces it with
 * {@link WallTypedDeviceWidgetConfig}.
 */
export interface WallDeviceWidgetConfig {
  readonly qualifiedId: string;
  readonly title?: string;
}

/** The layouts a typed device card may compose (design.md D6). */
export const WALL_DEVICE_LAYOUTS = ["default", "vertical", "horizontal"] as const;

/** A typed device card's layout. */
export type WallDeviceLayout = (typeof WALL_DEVICE_LAYOUTS)[number];

/**
 * Config for a typed device widget — the config every device widget type shares
 * (design.md D6, D8; specs/wall-display "Widget Catalog", "Wall Device
 * Presentation"): the single device it binds, the card's layout, and whether the
 * card hides its controls while the device is inactive. Declared once so each of
 * the `light`, `cover`, `fan`, `climate`, `lock`, `number`, `select`, and
 * `entity` types carries the same shape.
 */
export interface WallTypedDeviceWidgetConfig {
  readonly qualifiedId: string;
  readonly layout?: WallDeviceLayout;
  readonly collapsible_controls?: boolean;
}

/** Config for the temperature widget: the sensor device to read, with an optional title. */
export interface WallTemperatureWidgetConfig {
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
 * Config for a link widget: the wall profile to open, with an optional label
 * (wall-zones-and-fit D11; specs/wall-display "Wall Navigation", "Widget
 * Catalog"). `target` names another saved profile; a target that does not
 * resolve renders the wall's unknown-profile explanation.
 */
export interface WallLinkWidgetConfig {
  readonly target: string;
  readonly label?: string;
}

/**
 * Config for the device-grid widget: the devices the author explicitly
 * selected, with an optional title (wall-zones-and-fit D12; specs/wall-display
 * "Device Grid Widget", "Widget Catalog"). The selection is authored rather
 * than enumerated from the inventory; the grid pages a selection larger than
 * its span rather than scrolling.
 */
export interface WallDeviceGridWidgetConfig {
  readonly qualifiedIds: readonly string[];
  readonly title?: string;
}

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
 * {@link WALL_GRID_MAX_ROWS} (design.md D4). `zone` is an optional label that
 * groups the widgets sharing it into one band without changing any placement
 * (wall-zones-and-fit D1; specs/wall-display "Wall Zones").
 */
export interface WallWidget {
  readonly id: string;
  readonly type: WallWidgetType;
  readonly config: Record<string, unknown>;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly zone?: string;
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

/**
 * The widget types a version-1 profile could place (design.md D8;
 * specs/wall-display "Wall Profile Version and Migration"). Version 1 carried a
 * single generic `device` widget that version 2 replaced with one widget type
 * per device class; the union is exported so the migration can read a stored
 * version-1 profile.
 */
export const WALL_V1_WIDGET_TYPES = [
  "clock",
  "weather",
  "energy",
  "room",
  "favorites",
  "device",
  "temperature",
  "status",
  "scene",
  "link",
  "devices",
] as const;

/** A widget type a version-1 profile could place. */
export type WallV1WidgetType = (typeof WALL_V1_WIDGET_TYPES)[number];

/** One configured widget in a version-1 profile. */
export interface WallV1Widget extends Omit<WallWidget, "type"> {
  readonly type: WallV1WidgetType;
}

/** A version-1 profile's widget composition. */
export interface WallV1ProfileConfig {
  readonly widgets: readonly WallV1Widget[];
  readonly orientations?: Partial<Record<WallOrientation, readonly WallV1Widget[]>>;
}

/**
 * A stored version-1 wall profile, read by the migration (design.md D8;
 * specs/wall-display "Wall Profile Version and Migration"). It mirrors
 * {@link WallProfile} with the version-1 widget shape, so a profile saved before
 * version 2 parses and can be migrated rather than rejected.
 */
export interface WallV1Profile {
  readonly name: string;
  readonly version: number;
  readonly config: WallV1ProfileConfig;
}
