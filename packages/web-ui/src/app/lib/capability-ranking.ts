/**
 * Primary-capability ranking for device tiles (design.md D12, D16; task 10.5).
 *
 * A tile has room for one primary action and one primary readout, while the
 * capability schema supplies an unranked set. This module is the single,
 * purely presentational place that curates one of each — nothing here has a
 * server-side representation, so it can be re-tuned against real hardware
 * without touching specs (design.md D16, D23).
 *
 * Ranking reads well-known property names authored across every source
 * (`on`, `state`, `position`, `brightness`, `power`, `temperature`, …). The
 * named branches consult only those property names; the enum/numeric
 * fall-through additionally consults {@link OUTPUT_KINDS}, the one
 * cross-source `kind` contract every source already authors deliberately
 * (design.md D4) — so a configuration setting on a purely-reporting device
 * (a motion sensor's sensitivity) is not mistaken for a primary action.
 */

import type { Capability, CapabilityAccess, CapabilityValueType } from "@ts-ha/shared";

/**
 * The source-neutral output-device kinds — a cross-source `kind` contract
 * `shelly-capabilities.ts`, `nanoleaf-source.ts`, and `state-source.ts`
 * already author deliberately, and the mapped Zigbee2MQTT `exposes` use for
 * the same families. The single set behind both the ranking guard below and
 * the collection filter, so a device hidden by the filter is exactly one
 * that would not have offered a primary action (design.md D4).
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
  /** The declared on/off encoding for a boolean property (design.md D1). */
  valueOn?: string | number | boolean;
  valueOff?: string | number | boolean;
  /**
   * The `kind` of the top-level capability entry this leaf was flattened
   * from — its own `kind` when it is not nested in a container, or its
   * container's `kind` when it is (design.md D4). Consulted only by the
   * enum/numeric fall-through via {@link OUTPUT_KINDS}.
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
 * The source-neutral boolean on/off property families: the canonical `on`
 * authored by Shelly, Nanoleaf, and state toggles, plus Zigbee2MQTT's `state`.
 * Shared with the room command so a device is treated as actuatable on exactly
 * the same properties this ranking reads.
 */
const ON_OFF_PROPERTIES: ReadonlySet<string> = new Set(["on", "state"]);

/** The access direction a boolean on/off capability must declare to be selected. */
export type OnOffAccess = "readable" | "writable";

/**
 * Picks the preferred boolean on/off capability from an already-flattened
 * schema: the canonical `on` family wins over Zigbee2MQTT's `state` regardless
 * of declaration order, so a device declaring both resolves to the same
 * property for tile ranking and room commands alike.
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
 * Selects a device's single primary actuatable property, first match wins
 * (design.md D16). Returns `null` when nothing writable matches any rank —
 * the tile then degrades to read-only rather than failing to render.
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

  // Gated on OUTPUT_KINDS (design.md D4): a writable enum/numeric elsewhere
  // in the schema is not promoted to a primary action unless it belongs to
  // a capability whose declared category operates the physical world.
  // Ungated, this branch is what promotes a motion sensor's writable
  // `sensitivity` setting to its tile's primary control.
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
 * Whether a device would offer a tile primary action at all (design.md D4;
 * specs/web-ui "Device Tiles" — the output filter). Defined as exactly the
 * devices {@link selectPrimaryAction} finds one for, so a device hidden by
 * the filter is exactly one that would not have offered a primary action —
 * two independently maintained rules would drift and produce a device that
 * is filtered out yet has a working control, or vice versa.
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

/** Readout candidates consulted when the device HAS a primary action — the property that best qualifies it. */
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
 * Selects a device's single primary readout property (design.md D16).
 * `primaryAction` is the result of {@link selectPrimaryAction} for the same
 * device — the readout ranking differs depending on whether one was found.
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

/** The decided tile ranking for one device — what {@link selectPrimaryAction}/{@link selectPrimaryReadout} together produce. */
export interface TileRanking {
  action: PrimaryAction | null;
  readout: PrimaryReadout | null;
}

/** Convenience: computes both the primary action and the primary readout for a device's capability schema. */
export function rankDeviceTile(capabilities: Capability[]): TileRanking {
  const action = selectPrimaryAction(capabilities);
  const readout = selectPrimaryReadout(capabilities, action);
  return { action, readout };
}

/** The stop-like permitted values a cover can be commanded to (design.md D6). */
const COVER_STOP_TOKENS: ReadonlySet<string> = new Set(["stop"]);

/** The open-like permitted values a cover's declared transport action can name (design.md D15). */
const COVER_OPEN_TOKENS: ReadonlySet<string> = new Set(["open", "up", "raise"]);

/** The close-like permitted values a cover's declared transport action can name (design.md D15). */
const COVER_CLOSE_TOKENS: ReadonlySet<string> = new Set(["close", "down", "lower"]);

/** The stop-like permitted value a capability declares, preserving its authored case (design.md D6). */
function findStopToken(values: (string | number)[] | undefined): string | undefined {
  return (values ?? []).find(
    (value): value is string =>
      typeof value === "string" && COVER_STOP_TOKENS.has(value.trim().toLowerCase()),
  );
}

/** The transport-like permitted value a capability declares, preserving its authored case (design.md D15). */
function findTransportToken(
  values: (string | number)[] | undefined,
  tokens: ReadonlySet<string>,
): string | undefined {
  return (values ?? []).find(
    (value): value is string => typeof value === "string" && tokens.has(value.trim().toLowerCase()),
  );
}

/** The property and value of the stop command a cover's transport capability accepts (design.md D6). */
export interface CoverStopCommand {
  property: string;
  value: string;
}

/**
 * The exact stop command a device declares, or `null` when no writable transport
 * property can express stop (design.md D6; specs/wall-display "Cover Transport
 * Controls"). Detection stays conservative so it never endorses a command
 * validation would reject:
 *
 * - a writable enum whose permitted values include a stop-like token yields that
 *   exact authored value (so a device expecting `"STOP"` is not sent `"stop"`), and
 * - a writable `state` enum with no enumerated values (Zigbee covers) yields the
 *   canonical `"stop"`, since the schema leaves the value unconstrained.
 *
 * A writable `state` enum that enumerates values *without* stop, and a read-only
 * movement state (Shelly covers), cannot express stop and return `null`.
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

/** The declared transport action a cover accepts (design.md D15). */
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
 * The writable transport action a cover declares, or `null` when it declares
 * none (design.md D15; specs/device-sources "Cover Transport Action").
 *
 * Detection stays conservative so a generic enum is never mistaken for
 * transport: the property must be a writable enum that names both an open-like
 * and a close-like permitted value — a fan's speed or a light's effect names
 * neither — and the exact authored values are returned so Open/Close command
 * what the device accepts (a device expecting `"OPEN"` is not sent `"open"`).
 * A device that can stop names a stop-like value too; one that cannot omits it,
 * so the wall omits Stop rather than rendering it inert (specs/wall-display "A
 * cover that cannot stop omits stop").
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

/** The values a cover's Open and Close controls command (design.md D15). */
export interface CoverTransportTargets {
  /** Open's value: the declared open value, else the position maximum. */
  open: unknown;
  /** Close's value: the declared close value, else the position minimum. */
  close: unknown;
}

/**
 * Resolves the values a cover's Open and Close controls command (design.md D15;
 * specs/wall-display "Open and close use the declared transport"): the declared
 * transport action's own values when the device declares one, falling back to
 * the position extremes otherwise — so a cover that only positions (a Shelly
 * cover's read-only movement state) still commands its fully-open/closed ends.
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
 * `undefined` when the device declares none (design.md D12; specs/wall-display
 * "Wall Device Presentation" — "Colour controls appear only when supported").
 * Only a writable numeric `color_temp` can be driven by a control; a
 * colour-temperature the device only reports, or a non-numeric one, is not
 * offered rather than rendered inert. Consulted only inside the wall `light`
 * archetype, so no other card pays for the lookup.
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
 * The writable colour control a wall light card offers, or `undefined` when the
 * device declares none (design.md D12). The canonical colour channel across
 * sources is `hue` — Nanoleaf authors it directly and a Zigbee colour light
 * exposes it beneath its `color` composite — so a writable numeric `hue`
 * qualifies; a writable numeric `color` does too. A composite (an xy/hs pair),
 * an enum, or a read-only colour cannot be driven by a single control and is
 * not offered, so the card never renders an inert control.
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
 * the device declares none. A brightness the device only reports would let the
 * wall qualify an on/off primary with a brightness readout, but no slider could
 * be driven — so its absence keeps such a device a plain on/off entity rather
 * than a broken light. Declared here, with the other writable-control lookups,
 * so the capability vocabulary owns every "can this device be driven" question
 * (`@ts-ha/shared`'s `Capability.kind` is open and source-derived, so the answer
 * is always read from the flattened schema).
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
 * Formats a brightness value as a percentage of its declared range for a light
 * card's persistent readout. A raw `0–254` Zigbee brightness and a `0–100`
 * Nanoleaf one both read as a percentage, so the value is normalised against its
 * own range rather than assumed to already be one. A missing or non-numeric
 * value renders an em dash rather than a stale number.
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
