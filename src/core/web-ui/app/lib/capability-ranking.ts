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

import type {
  Capability,
  CapabilityAccess,
  CapabilityValueType,
} from "../../../../types/capabilities.js";

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
