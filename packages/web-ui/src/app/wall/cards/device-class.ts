/**
 * The pure device-class resolver: keys the wall's typed device widget off a device's
 * capability profile rather than a domain.
 */
import type { Capability } from "@ts-ha/shared";
import {
  coverTransportAction,
  type FlatCapability,
  flattenCapabilities,
} from "../../lib/capability-ranking.js";

/**
 * The device classes the wall can drive today, one wall widget type each. `entity`
 * is the typed fallback for a device of no class.
 */
export const WALL_DEVICE_CLASSES = [
  "light",
  "cover",
  "fan",
  "climate",
  "lock",
  "number",
  "select",
  "entity",
] as const;

/** A device class the wall offers a typed card for. */
export type WallDeviceClass = (typeof WALL_DEVICE_CLASSES)[number];

/**
 * The human label of each device class, declared once so the registry and the
 * mis-bound explanation name a class the same way.
 */
export const WALL_DEVICE_CLASS_LABELS: Readonly<Record<WallDeviceClass, string>> = Object.freeze({
  light: "Light",
  cover: "Cover",
  fan: "Fan",
  climate: "Climate",
  lock: "Lock",
  number: "Number",
  select: "Select",
  entity: "Entity",
});

/**
 * The setpoint property names a climate declares, mirroring the ranking's own.
 */
const SETPOINT_PROPERTIES: ReadonlySet<string> = new Set([
  "occupied_heating_setpoint",
  "current_heating_setpoint",
  "target_temperature",
  "setpoint",
]);

/** The writable numeric property a cover positions on. */
const POSITION_PROPERTIES: ReadonlySet<string> = new Set(["position"]);

/**
 * The writable numeric properties that make a device a light: brightness, colour
 * temperature, and colour.
 */
const LIGHT_PROPERTIES: ReadonlySet<string> = new Set(["brightness", "color_temp", "hue", "color"]);

/** Whether any flattened capability carries the given root `kind`. */
function hasKind(flat: FlatCapability[], kind: string): boolean {
  return flat.some((c) => c.kind === kind);
}

/** Whether any flattened capability is a writable numeric whose property is in `properties`. */
function hasWritableNumericProperty(
  flat: FlatCapability[],
  properties: ReadonlySet<string>,
): boolean {
  return flat.some(
    (c) => c.valueType === "numeric" && c.access.writable && properties.has(c.property),
  );
}

/** Whether any flattened capability is a writable numeric position — a cover that positions. */
function hasWritablePosition(flat: FlatCapability[]): boolean {
  return hasWritableNumericProperty(flat, POSITION_PROPERTIES);
}

/** Whether any flattened capability is a writable numeric a light is driven by. */
function hasWritableLightControl(flat: FlatCapability[]): boolean {
  return hasWritableNumericProperty(flat, LIGHT_PROPERTIES);
}

/** Whether any flattened capability is a writable numeric with declared bounds — a bounded numeric control. */
function hasBoundedWritableNumeric(flat: FlatCapability[]): boolean {
  return flat.some((c) => c.valueType === "numeric" && c.access.writable && c.range !== undefined);
}

/** Whether any flattened capability is a writable enum with permitted values — an enumerated control. */
function hasWritableEnumWithValues(flat: FlatCapability[]): boolean {
  return flat.some(
    (c) => c.valueType === "enum" && c.access.writable && (c.permittedValues?.length ?? 0) > 0,
  );
}

/**
 * Resolves a device's capability profile to exactly one device class, matching
 * classes in order. A device matching none is the `entity` fallback.
 */
export function resolveDeviceClass(capabilities: Capability[]): WallDeviceClass {
  const flat = flattenCapabilities(capabilities);

  if (hasKind(flat, "lock")) return "lock";
  if (hasKind(flat, "climate") || hasWritableNumericProperty(flat, SETPOINT_PROPERTIES)) {
    return "climate";
  }
  if (hasKind(flat, "fan")) return "fan";
  if (
    hasKind(flat, "cover") ||
    hasWritablePosition(flat) ||
    coverTransportAction(capabilities) !== null
  ) {
    return "cover";
  }
  if (hasKind(flat, "light") || hasWritableLightControl(flat)) return "light";
  if (hasBoundedWritableNumeric(flat)) return "number";
  if (hasWritableEnumWithValues(flat)) return "select";
  return "entity";
}

/**
 * Whether a device's capability profile can drive a widget of `deviceClass`.
 * `entity` accepts every device.
 */
export function deviceCanDriveClass(
  capabilities: Capability[],
  deviceClass: WallDeviceClass,
): boolean {
  if (deviceClass === "entity") return true;
  return resolveDeviceClass(capabilities) === deviceClass;
}

/** Whether a wall widget type names a device class the typed device widgets cover. */
export function isWallDeviceClass(type: string): type is WallDeviceClass {
  return (WALL_DEVICE_CLASSES as readonly string[]).includes(type);
}
