/** Wall-display profile contracts, shared by the server's validator and the browser editor. */

/** Fixed column count of the wall grid. */
export const WALL_GRID_COLUMNS = 12;

/** Maximum number of grid rows a widget may occupy; every widget's `y + h` stays within it. */
export const WALL_GRID_MAX_ROWS = 24;

/** The profile shape version, carried so the config can evolve. */
export const WALL_PROFILE_VERSION = 2;

/** The version-1 profile shape's version, retained for the migration. */
export const WALL_V1_PROFILE_VERSION = 1;

/** Maximum length of a widget's optional zone label. */
export const WALL_ZONE_MAX_LENGTH = 40;

/** The widget types a profile may place; `entity` is the fallback for a device of no class. */
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

/** The orientations a profile may override its base layout for. */
export const WALL_ORIENTATIONS = ["portrait", "landscape"] as const;

/** A grid orientation a profile may carry a distinct layout for. */
export type WallOrientation = (typeof WALL_ORIENTATIONS)[number];

/** The kind of change a `wall` stream event reports. */
export const WALL_CHANGE_KINDS = ["created", "updated", "deleted"] as const;

/** Whether a profile was created, updated, or deleted. */
export type WallChangeKind = (typeof WALL_CHANGE_KINDS)[number];

/** Config for the widgets that expose only an optional title. */
export interface WallTitledWidgetConfig {
  readonly title?: string;
}

/** Config for the room widget: the room to present, with an optional title. */
export interface WallRoomWidgetConfig {
  readonly roomId: string;
  readonly title?: string;
}

/**
 * Config for the version-1 single-device widget, superseded by
 * {@link WallTypedDeviceWidgetConfig}.
 */
export interface WallDeviceWidgetConfig {
  readonly qualifiedId: string;
  readonly title?: string;
}

/** The layouts a typed device card may compose. */
export const WALL_DEVICE_LAYOUTS = ["default", "vertical", "horizontal"] as const;

/** A typed device card's layout. */
export type WallDeviceLayout = (typeof WALL_DEVICE_LAYOUTS)[number];

/** Config every typed device widget type shares. */
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

/** Config for a link widget: the profile to open, with an optional label. */
export interface WallLinkWidgetConfig {
  readonly target: string;
  readonly label?: string;
}

/** Config for the device-grid widget: an explicit device selection, with an optional title. */
export interface WallDeviceGridWidgetConfig {
  readonly qualifiedIds: readonly string[];
  readonly title?: string;
}

/** One configured widget in a profile. */
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

/** A profile's widget composition: a base layout plus optional per-orientation overrides. */
export interface WallProfileConfig {
  readonly widgets: readonly WallWidget[];
  readonly orientations?: Partial<Record<WallOrientation, readonly WallWidget[]>>;
}

/** A named, versioned wall profile. */
export interface WallProfile {
  readonly name: string;
  readonly version: number;
  readonly config: WallProfileConfig;
}

/** The widget types a version-1 profile could place, retained for the migration. */
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

/** A stored version-1 wall profile, read by the migration. */
export interface WallV1Profile {
  readonly name: string;
  readonly version: number;
  readonly config: WallV1ProfileConfig;
}
