/** Source-neutral device capability vocabulary shared by every device source. */

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

/** A single entry in the capability vocabulary. */
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
  /** The value reported and accepted to mean "on" (absent means a real boolean `true`). */
  valueOn?: string | number | boolean;
  /** The value representing "off", mirroring {@link valueOn}; absence means `false`. */
  valueOff?: string | number | boolean;
  /** The untouched source entry, present when the mapper did not recognise its kind. */
  raw?: unknown;
}

/** Interprets a reported value against a boolean capability's declared on/off encoding. */
export function readBooleanCapabilityValue(
  capability: Pick<Capability, "valueOn">,
  reportedValue: unknown,
): boolean {
  const onValue = capability.valueOn ?? true;
  return reportedValue === onValue;
}

/** Composes the wire value that commands a boolean capability to `desired`. */
export function composeBooleanCapabilityValue(
  capability: Pick<Capability, "valueOn" | "valueOff">,
  desired: boolean,
): string | number | boolean {
  return desired ? (capability.valueOn ?? true) : (capability.valueOff ?? false);
}
