/**
 * The pure device-class resolver (design.md D1, D3; specs/wall-display "Widget
 * Catalog" — "A card is selected by the device's class", "Wall Device
 * Presentation"). A wall device widget is typed, one per device class, so the
 * wall must answer one question for every device: which class is this?
 *
 * The answer is keyed by the device's *capability profile*, never by a Home
 * Assistant domain — the capability vocabulary is open and source-derived
 * (`packages/shared/src/capabilities.ts`: `Capability.kind` is the source's own
 * label, and Zigbee2MQTT, Shelly and Nanoleaf each supply their own), so a
 * domain would not exist to key on. This module reads the same cross-source
 * contract the wall already ranks on (`lib/capability-ranking.ts`'s
 * `flattenCapabilities`, `coverTransportAction`, and the writable-control
 * helpers) and returns exactly one class, with `entity` — the typed fallback
 * card — for a device of no class (design.md D3).
 *
 * The classes and the order they are resolved in are the catalogue's own
 * (design.md D3): a lock, a climate, a fan, a cover, and a light each announce
 * themselves by their capability kind or by the writable control that drives
 * them; a bare bounded numeric is a `number`, a bare enumerated control is a
 * `select`, and everything else — a plain switch, a read-only sensor, a device
 * whose schema is unrecognised — falls through to `entity`. The order matters
 * because one profile can offer more than one of these (a cover positions *and*
 * transports), and the more specific class wins.
 *
 * Deliberately dependency-free beyond the pure capability helpers — no React,
 * no DOM — so every selection is reachable by `bun test`.
 */
import type { Capability } from "@ts-ha/shared";
import {
  coverTransportAction,
  type FlatCapability,
  flattenCapabilities,
} from "../../lib/capability-ranking.js";

/**
 * The device classes the wall can drive today, one wall widget type each
 * (design.md D3; specs/wall-display "Widget Catalog"). `entity` is the typed
 * fallback for a device of no class. Every member is also a shared
 * `WALL_WIDGET_TYPES` entry — `tests/wall-device-class.test.ts` asserts that, so
 * the resolver and the widget catalogue cannot drift.
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
 * The human label of each device class — the widget catalogue's own name for it
 * (design.md D3; specs/wall-display "Widget Catalog"). Declared once here so the
 * registry's labels and the explanation a mis-bound widget draws
 * ({@link deviceCanDriveClass}) name a class the same way.
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
 * The setpoint property names a climate declares, mirroring the ranking's own
 * (`capability-ranking.ts`). A climate announces itself by its `kind` too; this
 * catches a source that exposes a setpoint without a climate container.
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
 * The writable numeric properties that make a device a light, mirroring the
 * wall's previous archetype selection (brightness, colour temperature, colour).
 * The canonical colour channel is `hue` (`capability-ranking.ts`); `color` is
 * accepted as its numeric twin.
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
 * Resolves a device's capability profile to exactly one device class
 * (design.md D3). The first class whose profile matches wins; a device matching
 * none is the `entity` fallback.
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
 * Whether a device's capability profile can drive a widget of `deviceClass`
 * (design.md D3; specs/wall-display "Widget Catalog" — "A class the device
 * cannot drive is explained", "A device its class cannot drive is not offered").
 * `entity` is the wall's typed fallback, so *every* device can drive it — a
 * switch and a read-only sensor both present their name and state through it.
 * Every other class is driven only by a device whose profile resolves to exactly
 * that class, so a `light` widget bound to a sensor reports the gap inside its
 * own area rather than presenting an inert card.
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
