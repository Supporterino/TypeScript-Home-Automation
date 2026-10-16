/**
 * Primary-capability ranking for device tiles: curates one primary action and
 * one primary readout from an unranked capability schema.
 */

import type { Capability, CapabilityAccess, CapabilityValueType } from "@ts-ha/shared";

/**
 * The source-neutral output-device kinds. The single set behind both the
 * ranking guard below and the collection filter.
 */
export const OUTPUT_KINDS: ReadonlySet<string> = new Set([
  "light",
  "switch",
  "outlet",
  "cover",
  "fan",
  "lock",
  "climate",
]);

/** A leaf (non-container) capability, flattened out of any nested `features`. */
export interface FlatCapability {
  property: string;
  valueType: CapabilityValueType;
  access: CapabilityAccess;
  unit?: string;
  permittedValues?: (string | number)[];
  range?: { min?: number; max?: number };
  step?: number;
  /** The declared on/off encoding for a boolean property. */
  valueOn?: string | number | boolean;
  valueOff?: string | number | boolean;
  /**
   * The `kind` of the top-level entry this leaf was flattened from. Consulted
   * only by the enum/numeric fall-through via {@link OUTPUT_KINDS}.
   */
  kind: string;
}

/** Recursively flattens a capability tree into its leaf (property-bearing) entries. */
export function flattenCapabilities(capabilities: Capability[]): FlatCapability[] {
  const out: FlatCapability[] = [];

  function visit(capability: Capability, rootKind: string): void {
    if (capability.features && capability.features.length > 0) {
      for (const feature of capability.features) visit(feature, rootKind);
      // A container's own property (rare) is still worth keeping — some
      // sources set it directly on a leaf-shaped container.
      if (!capability.property) return;
    }
    if (!capability.property) return;
    out.push({
      property: capability.property,
      valueType: capability.valueType,
      access: capability.access,
      unit: capability.unit,
      permittedValues: capability.permittedValues,
      range: capability.range,
      step: capability.step,
      valueOn: capability.valueOn,
      valueOff: capability.valueOff,
      kind: rootKind,
    });
  }

  for (const capability of capabilities) visit(capability, capability.kind);
  return out;
}

function find(
  flat: FlatCapability[],
  predicate: (c: FlatCapability) => boolean,
): FlatCapability | undefined {
  return flat.find(predicate);
}

/**
 * The source-neutral boolean on/off property families (`on` and `state`),
 * shared with the room command.
 */
const ON_OFF_PROPERTIES: ReadonlySet<string> = new Set(["on", "state"]);

/** The access direction a boolean on/off capability must declare to be selected. */
export type OnOffAccess = "readable" | "writable";

/**
 * Picks the preferred boolean on/off capability: `on` wins over `state`
 * regardless of declaration order.
 */
export function pickOnOffCapability(
  flat: FlatCapability[],
  access: OnOffAccess,
): FlatCapability | undefined {
  const matches = (c: FlatCapability) =>
    ON_OFF_PROPERTIES.has(c.property) && c.valueType === "boolean" && c.access[access] === true;
  return flat.find((c) => c.property === "on" && matches(c)) ?? flat.find(matches);
}

const SETPOINT_PROPERTIES = new Set([
  "occupied_heating_setpoint",
  "current_heating_setpoint",
  "target_temperature",
  "setpoint",
]);

/** Which ranked action a device's primary action matched, if any. */
export type PrimaryActionKind =
  | "on_off"
  | "position"
  | "brightness"
  | "setpoint"
  | "enum"
  | "numeric";

export interface PrimaryAction {
  kind: PrimaryActionKind;
  capability: FlatCapability;
}

/**
 * Selects a device's single primary actuatable property, first match wins.
 * Returns `null` when nothing writable matches any rank.
 */
export function selectPrimaryAction(capabilities: Capability[]): PrimaryAction | null {
  const flat = flattenCapabilities(capabilities);

  const onOff = pickOnOffCapability(flat, "writable");
  if (onOff) return { kind: "on_off", capability: onOff };

  const position = find(
    flat,
    (c) => c.property === "position" && c.valueType === "numeric" && c.access.writable,
  );
  if (position) return { kind: "position", capability: position };

  const brightness = find(
    flat,
    (c) => c.property === "brightness" && c.valueType === "numeric" && c.access.writable,
  );
  if (brightness) return { kind: "brightness", capability: brightness };

  const setpoint = find(
    flat,
    (c) => SETPOINT_PROPERTIES.has(c.property) && c.valueType === "numeric" && c.access.writable,
  );
  if (setpoint) return { kind: "setpoint", capability: setpoint };

  // Gated on OUTPUT_KINDS, so a writable enum/numeric elsewhere (a motion
  // sensor's `sensitivity`) is not promoted to a primary action.
  const otherEnum = find(
    flat,
    (c) => c.valueType === "enum" && c.access.writable && OUTPUT_KINDS.has(c.kind),
  );
  if (otherEnum) return { kind: "enum", capability: otherEnum };

  const otherNumeric = find(
    flat,
    (c) => c.valueType === "numeric" && c.access.writable && OUTPUT_KINDS.has(c.kind),
  );
  if (otherNumeric) return { kind: "numeric", capability: otherNumeric };

  return null;
}

/**
 * Whether a device would offer a tile primary action at all — defined as
 * exactly the devices {@link selectPrimaryAction} finds one for.
 */
export function isOperableDevice(capabilities: Capability[]): boolean {
  return selectPrimaryAction(capabilities) !== null;
}

/** Which ranked readout a device's primary readout matched, if any. */
export type PrimaryReadoutKind =
  | "brightness"
  | "position"
  | "power"
  | "setpoint"
  | "temperature"
  | "humidity"
  | "occupancy"
  | "contact"
  | "illuminance"
  | "water_leak"
  | "battery"
  | "numeric";

export interface PrimaryReadout {
  kind: PrimaryReadoutKind;
  capability: FlatCapability;
}

/** Readout candidates consulted when the device HAS a primary action. */
const ACTION_QUALIFYING_READOUTS: { kind: PrimaryReadoutKind; property: string }[] = [
  { kind: "brightness", property: "brightness" },
  { kind: "position", property: "position" },
  { kind: "power", property: "power" },
  { kind: "setpoint", property: "current_heating_setpoint" },
];

/** Readout ranking consulted when the device has NO primary action. */
const NO_ACTION_READOUT_PROPERTIES: { kind: PrimaryReadoutKind; property: string }[] = [
  { kind: "temperature", property: "temperature" },
  { kind: "humidity", property: "humidity" },
  { kind: "occupancy", property: "occupancy" },
  { kind: "contact", property: "contact" },
  { kind: "illuminance", property: "illuminance" },
  { kind: "water_leak", property: "water_leak" },
  { kind: "battery", property: "battery" },
];

/**
 * Selects a device's single primary readout property. The ranking differs
 * depending on whether `primaryAction` was found for the same device.
 */
export function selectPrimaryReadout(
  capabilities: Capability[],
  primaryAction: PrimaryAction | null,
): PrimaryReadout | null {
  const flat = flattenCapabilities(capabilities);
  const readable = (c: FlatCapability) => c.access.readable;

  if (primaryAction) {
    for (const candidate of ACTION_QUALIFYING_READOUTS) {
      const match = find(flat, (c) => c.property === candidate.property && readable(c));
      if (match) return { kind: candidate.kind, capability: match };
    }
    // Setpoint-property variants beyond the canonical one above.
    const setpoint = find(flat, (c) => SETPOINT_PROPERTIES.has(c.property) && readable(c));
    if (setpoint) return { kind: "setpoint", capability: setpoint };
    return null;
  }

  for (const candidate of NO_ACTION_READOUT_PROPERTIES) {
    const match = find(flat, (c) => c.property === candidate.property && readable(c));
    if (match) return { kind: candidate.kind, capability: match };
  }

  const otherNumeric = find(flat, (c) => c.valueType === "numeric" && readable(c));
  if (otherNumeric) return { kind: "numeric", capability: otherNumeric };

  return null;
}

/** The decided tile ranking for one device. */
export interface TileRanking {
  action: PrimaryAction | null;
  readout: PrimaryReadout | null;
}

/** Computes both the primary action and the primary readout for a device. */
export function rankDeviceTile(capabilities: Capability[]): TileRanking {
  const action = selectPrimaryAction(capabilities);
  const readout = selectPrimaryReadout(capabilities, action);
  return { action, readout };
}

/** The stop-like permitted values a cover can be commanded to. */
const COVER_STOP_TOKENS: ReadonlySet<string> = new Set(["stop"]);

/** The open-like permitted values a cover's declared transport action can name. */
const COVER_OPEN_TOKENS: ReadonlySet<string> = new Set(["open", "up", "raise"]);

/** The close-like permitted values a cover's declared transport action can name. */
const COVER_CLOSE_TOKENS: ReadonlySet<string> = new Set(["close", "down", "lower"]);

/** The stop-like permitted value a capability declares, preserving its authored case. */
function findStopToken(values: (string | number)[] | undefined): string | undefined {
  return (values ?? []).find(
    (value): value is string =>
      typeof value === "string" && COVER_STOP_TOKENS.has(value.trim().toLowerCase()),
  );
}

/** The transport-like permitted value a capability declares, preserving its authored case. */
function findTransportToken(
  values: (string | number)[] | undefined,
  tokens: ReadonlySet<string>,
): string | undefined {
  return (values ?? []).find(
    (value): value is string => typeof value === "string" && tokens.has(value.trim().toLowerCase()),
  );
}

/** The property and value of the stop command a cover's transport capability accepts. */
export interface CoverStopCommand {
  property: string;
  value: string;
}

/**
 * The exact stop command a device declares, or `null` when no writable transport
 * property can express stop. A stop-like permitted value is returned verbatim.
 */
export function coverStopCommand(capabilities: Capability[]): CoverStopCommand | null {
  for (const c of flattenCapabilities(capabilities)) {
    if (!c.access.writable || c.valueType !== "enum") continue;
    const token = findStopToken(c.permittedValues);
    if (token !== undefined) return { property: c.property, value: token };
    if (c.property === "state" && c.permittedValues === undefined) {
      return { property: c.property, value: "stop" };
    }
  }
  return null;
}

/** The declared transport action a cover accepts. */
export interface CoverTransportAction {
  /** The writable property the transport values are set on. */
  property: string;
  /** The declared open value. */
  open: string;
  /** The declared close value. */
  close: string;
  /** The declared stop value, present only when the device can stop. */
  stop?: string;
}

/**
 * The writable transport action a cover declares, or `null` when none. The
 * property must be a writable enum naming both open-like and close-like values.
 */
export function coverTransportAction(capabilities: Capability[]): CoverTransportAction | null {
  for (const c of flattenCapabilities(capabilities)) {
    if (!c.access.writable || c.valueType !== "enum") continue;
    const open = findTransportToken(c.permittedValues, COVER_OPEN_TOKENS);
    const close = findTransportToken(c.permittedValues, COVER_CLOSE_TOKENS);
    if (open === undefined || close === undefined) continue;
    const stop = findStopToken(c.permittedValues);
    return stop === undefined
      ? { property: c.property, open, close }
      : { property: c.property, open, close, stop };
  }
  return null;
}

/** The values a cover's Open and Close controls command. */
export interface CoverTransportTargets {
  /** Open's value: the declared open value, else the position maximum. */
  open: unknown;
  /** Close's value: the declared close value, else the position minimum. */
  close: unknown;
}

/**
 * Resolves the values a cover's Open and Close controls command: the declared
 * transport values, falling back to the position extremes.
 */
export function coverTransportTargets(
  transport: CoverTransportAction | null,
  position: FlatCapability | undefined,
): CoverTransportTargets {
  return {
    open: transport?.open ?? position?.range?.max ?? 100,
    close: transport?.close ?? position?.range?.min ?? 0,
  };
}

/**
 * The writable colour-temperature control a wall light card offers, or
 * `undefined` when none: only a writable numeric `color_temp` qualifies.
 */
export function writableColorTemperatureCapability(
  capabilities: Capability[],
): FlatCapability | undefined {
  return find(
    flattenCapabilities(capabilities),
    (c) => c.property === "color_temp" && c.valueType === "numeric" && c.access.writable,
  );
}

/**
 * The writable colour control a wall light card offers, or `undefined` when
 * none: a writable numeric `hue`, else a writable numeric `color`.
 */
export function writableColorCapability(capabilities: Capability[]): FlatCapability | undefined {
  const flat = flattenCapabilities(capabilities);
  return (
    find(flat, (c) => c.property === "hue" && c.valueType === "numeric" && c.access.writable) ??
    find(flat, (c) => c.property === "color" && c.valueType === "numeric" && c.access.writable)
  );
}

/**
 * The writable brightness control a wall light card drives, or `undefined` when
 * none. Only a writable numeric `brightness` qualifies.
 */
export function writableBrightnessCapability(
  capabilities: Capability[],
): FlatCapability | undefined {
  return find(
    flattenCapabilities(capabilities),
    (c) => c.property === "brightness" && c.valueType === "numeric" && c.access.writable,
  );
}

/**
 * Formats a brightness value as a percentage of its declared range. A missing
 * or non-numeric value renders an em dash.
 */
export function formatBrightnessPercent(
  value: unknown,
  range?: { min?: number; max?: number },
): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  const min = range?.min ?? 0;
  const max = range?.max ?? 100;
  if (max <= min) return `${Math.round(value)}%`;
  const percent = Math.round(((value - min) / (max - min)) * 100);
  return `${Math.min(100, Math.max(0, percent))}%`;
}
