/**
 * Source-neutral device capability vocabulary.
 *
 * Every device source describes what it can do in these terms: Zigbee2MQTT's
 * `exposes` array is mapped into it by the device registry, Shelly and
 * Nanoleaf author it directly (they publish no schema of their own), and a
 * state toggle expresses itself as a single writable boolean capability. No
 * consumer — HomeKit, the generic web UI renderer, or anything else — reaches
 * into a source-specific shape; they all read this vocabulary instead.
 *
 * This module intentionally has no dependency on a source-specific type, and
 * no runtime dependency beyond the pure helpers below.
 */

/** The primitive value type a capability's property holds. */
export type CapabilityValueType =
  | "boolean"
  | "numeric"
  | "enum"
  | "text"
  | "composite"
  | "list"
  | "unknown";

/** Whether a capability can be read, written, or both. */
export interface CapabilityAccess {
  readable: boolean;
  writable: boolean;
}

/** Numeric bounds for a `numeric` capability, when the source declares them. */
export interface CapabilityRange {
  min?: number;
  max?: number;
}

/**
 * A single entry in the capability vocabulary.
 *
 * `kind` is a source-neutral (but source-derived) category label, e.g.
 * `"light"`, `"switch"`, `"binary"`, `"numeric"`, `"enum"`. Container kinds
 * (such as `"light"`) carry their leaf capabilities in `features`; leaf
 * capabilities carry `property`/`access`/`valueType` and whatever
 * constraints apply.
 *
 * An entry of a kind the mapper does not specifically recognise is still
 * produced — with `kind` set to the source's own label and `raw` carrying
 * the untouched source data — rather than discarded, so a consumer can still
 * present something for it.
 */
export interface Capability {
  /** Source-neutral (but source-derived) category, e.g. "light", "numeric". */
  kind: string;
  /** Display name, when supplied by the source. */
  name?: string;
  /** The property key this capability reads or writes on the device's state. */
  property?: string;
  /** Whether this capability's property can be read and/or written. */
  access: CapabilityAccess;
  /** The primitive value type held by this capability's property. */
  valueType: CapabilityValueType;
  /** Numeric bounds, present when meaningful and declared by the source. */
  range?: CapabilityRange;
  /** Numeric step size, present when meaningful and declared by the source. */
  step?: number;
  /** Permitted discrete values, present for enumerated capabilities. */
  permittedValues?: (string | number)[];
  /** Unit of measure, when supplied by the source (e.g. "°C", "%", "lux"). */
  unit?: string;
  /** Nested features, present on composite/container capabilities. */
  features?: Capability[];
  /**
   * The value this capability's source reports and accepts to mean "on",
   * present only on `valueType: "boolean"` capabilities. Absence means a
   * real JSON boolean `true` — that is what most sources already produce,
   * and what a reader falls back to when a source declares nothing
   * (design.md D1). Declaring `valueType: "boolean"` without this pair
   * states a property's type but not its encoding, which is not enough for
   * a consumer to interpret or command it: Zigbee2MQTT reports a binary
   * on/off property as the strings `"ON"`/`"OFF"`, not a real boolean.
   */
  valueOn?: string | number | boolean;
  /** The value representing "off", mirroring {@link valueOn}; absence means `false`. */
  valueOff?: string | number | boolean;
  /**
   * The untouched source entry, present only when the mapper did not
   * specifically recognise this entry's kind. Lets a consumer fall back to
   * presenting raw data rather than nothing.
   */
  raw?: unknown;
}

/**
 * Interprets a reported value against a boolean capability's declared on/off
 * encoding, defaulting to treating a real boolean `true` as the "on" value
 * when the capability declares nothing (design.md D1). Used by both the web
 * UI's read path and anything else that needs to turn a device's reported
 * value into a boolean without source-specific knowledge.
 */
export function readBooleanCapabilityValue(
  capability: Pick<Capability, "valueOn">,
  reportedValue: unknown,
): boolean {
  const onValue = capability.valueOn ?? true;
  return reportedValue === onValue;
}

/**
 * Composes the wire value to command a boolean capability to `desired`,
 * using its declared on/off encoding and defaulting to a real boolean when
 * the capability declares nothing (design.md D1). The single place that
 * implements this rule, so a consumer never has to know which sources
 * bothered to declare an encoding.
 */
export function composeBooleanCapabilityValue(
  capability: Pick<Capability, "valueOn" | "valueOff">,
  desired: boolean,
): string | number | boolean {
  return desired ? (capability.valueOn ?? true) : (capability.valueOff ?? false);
}
