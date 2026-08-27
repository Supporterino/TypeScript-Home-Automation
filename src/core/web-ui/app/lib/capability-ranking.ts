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
 * (`on`, `state`, `position`, `brightness`, `power`, `temperature`, …) —
 * source-neutral in the sense that no source-specific `kind` string is
 * consulted, only the property names every source already agrees on
 * (state-source.ts, nanoleaf-source.ts, shelly-capabilities.ts, and the
 * mapped Zigbee2MQTT `exposes`).
 */

import type {
  Capability,
  CapabilityAccess,
  CapabilityValueType,
} from "../../../../types/capabilities.js";

/** A leaf (non-container) capability, flattened out of any nested `features`. */
export interface FlatCapability {
  property: string;
  valueType: CapabilityValueType;
  access: CapabilityAccess;
  unit?: string;
  permittedValues?: (string | number)[];
  range?: { min?: number; max?: number };
  step?: number;
}

/** Recursively flattens a capability tree into its leaf (property-bearing) entries. */
export function flattenCapabilities(capabilities: Capability[]): FlatCapability[] {
  const out: FlatCapability[] = [];

  function visit(capability: Capability): void {
    if (capability.features && capability.features.length > 0) {
      for (const feature of capability.features) visit(feature);
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
    });
  }

  for (const capability of capabilities) visit(capability);
  return out;
}

function find(
  flat: FlatCapability[],
  predicate: (c: FlatCapability) => boolean,
): FlatCapability | undefined {
  return flat.find(predicate);
}

const ON_OFF_PROPERTIES = new Set(["on", "state"]);
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

  const onOff = find(
    flat,
    (c) => ON_OFF_PROPERTIES.has(c.property) && c.valueType === "boolean" && c.access.writable,
  );
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

  const otherEnum = find(flat, (c) => c.valueType === "enum" && c.access.writable);
  if (otherEnum) return { kind: "enum", capability: otherEnum };

  const otherNumeric = find(flat, (c) => c.valueType === "numeric" && c.access.writable);
  if (otherNumeric) return { kind: "numeric", capability: otherNumeric };

  return null;
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
