/**
 * Zigbee2MQTT `exposes` → capability vocabulary mapping.
 *
 * Source-specific transformation logic: it lives in core's zigbee layer and
 * is re-exported from the core barrel for surface stability, not in
 * `@ts-ha/shared` (design.md D5).
 */

import type { Capability, CapabilityAccess, CapabilityValueType } from "@ts-ha/shared";

/** Zigbee2MQTT access bitmask bits (published/settable/gettable). */
const Z2M_ACCESS_PUBLISHED = 1;
const Z2M_ACCESS_SET = 2;

/** Leaf expose kinds Zigbee2MQTT publishes with a `property` to read/write. */
const Z2M_LEAF_KINDS: Record<string, CapabilityValueType> = {
  binary: "boolean",
  numeric: "numeric",
  enum: "enum",
  text: "text",
};

/** Container expose kinds that carry nested `features`. */
const Z2M_CONTAINER_KINDS = new Set([
  "composite",
  "light",
  "switch",
  "outlet",
  "cover",
  "fan",
  "lock",
  "climate",
  "list",
]);

interface Z2MExposeLike {
  type?: unknown;
  name?: unknown;
  property?: unknown;
  access?: unknown;
  unit?: unknown;
  value_min?: unknown;
  value_max?: unknown;
  value_step?: unknown;
  values?: unknown;
  value_on?: unknown;
  value_off?: unknown;
  features?: unknown;
  [key: string]: unknown;
}

/** Whether a raw z2m field is a value this vocabulary can carry as a boolean encoding. */
function isCapabilityBooleanValue(v: unknown): v is string | number | boolean {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

function accessFromBitmask(bits: unknown): CapabilityAccess {
  const n = typeof bits === "number" ? bits : 0;
  return {
    readable: (n & Z2M_ACCESS_PUBLISHED) !== 0,
    writable: (n & Z2M_ACCESS_SET) !== 0,
  };
}

/**
 * Maps a single Zigbee2MQTT `exposes` entry into the capability vocabulary.
 * An entry whose `type` is not one of the kinds this mapper specifically
 * understands is still returned, with the raw entry preserved on `raw`.
 */
export function mapZ2MExpose(expose: unknown): Capability {
  if (!expose || typeof expose !== "object") {
    return {
      kind: "unknown",
      access: { readable: false, writable: false },
      valueType: "unknown",
      raw: expose,
    };
  }

  const e = expose as Z2MExposeLike;
  const type = typeof e.type === "string" ? e.type : "unknown";
  const isLeaf = type in Z2M_LEAF_KINDS;
  const isContainer = Z2M_CONTAINER_KINDS.has(type);

  const capability: Capability = {
    kind: type,
    access: accessFromBitmask(e.access),
    valueType: isLeaf ? Z2M_LEAF_KINDS[type] : isContainer ? "composite" : "unknown",
  };

  if (typeof e.name === "string") capability.name = e.name;
  if (typeof e.property === "string") capability.property = e.property;
  if (typeof e.unit === "string") capability.unit = e.unit;

  if (typeof e.value_min === "number" || typeof e.value_max === "number") {
    capability.range = {
      min: typeof e.value_min === "number" ? e.value_min : undefined,
      max: typeof e.value_max === "number" ? e.value_max : undefined,
    };
  }
  if (typeof e.value_step === "number") capability.step = e.value_step;
  // Only a binary expose has anything to say about on/off encoding — carry
  // it through when the published schema declares it, and leave it absent
  // otherwise, so the D1 default (a real boolean) applies (design.md D2, R1).
  if (type === "binary") {
    if (isCapabilityBooleanValue(e.value_on)) capability.valueOn = e.value_on;
    if (isCapabilityBooleanValue(e.value_off)) capability.valueOff = e.value_off;
  }
  if (Array.isArray(e.values)) {
    capability.permittedValues = e.values.filter(
      (v): v is string | number => typeof v === "string" || typeof v === "number",
    );
  }
  if (Array.isArray(e.features)) {
    capability.features = e.features.map(mapZ2MExpose);
  }

  // Preserve entries of a kind we don't specifically recognise, so a
  // consumer can still present something for them rather than nothing.
  if (!isLeaf && !isContainer) {
    capability.raw = expose;
  }

  return capability;
}

/**
 * Maps a Zigbee2MQTT `exposes` array into the capability vocabulary.
 * Returns an empty array for anything that isn't an array (including
 * `undefined`/`null`), so a device with no published schema is described as
 * having an empty schema rather than an absent one.
 */
export function mapZ2MExposes(exposes: unknown): Capability[] {
  if (!Array.isArray(exposes)) return [];
  return exposes.map(mapZ2MExpose);
}
