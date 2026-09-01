/**
 * Command validation against a device's declared capability schema
 * (design.md's device-sources spec, "Command Dispatch"; task 7.1).
 *
 * Every `DeviceSource.command()` implementation validates through
 * {@link validateCommand} before touching its transport, so an unknown
 * property or an out-of-range/non-permitted value is rejected with a
 * descriptive error and never reaches a device (task 7.3).
 */
import type { Capability, CapabilityValueType } from "../../types/capabilities.js";

export type CommandValidationResult = { ok: true } | { ok: false; error: string };

/**
 * Flattens a capability tree into a `property -> Capability` map, walking
 * into `features` for container/composite capabilities. A later entry with
 * the same property name overwrites an earlier one, which only matters for
 * malformed/duplicate schemas.
 */
export function flattenByProperty(
  capabilities: Capability[],
  into: Map<string, Capability> = new Map(),
): Map<string, Capability> {
  for (const capability of capabilities) {
    if (capability.property) {
      into.set(capability.property, capability);
    }
    if (capability.features) {
      flattenByProperty(capability.features, into);
    }
  }
  return into;
}

function describeValueType(valueType: CapabilityValueType): string {
  switch (valueType) {
    case "boolean":
      return "a boolean";
    case "numeric":
      return "a number";
    case "text":
      return "a string";
    default:
      return valueType;
  }
}

function validateValue(capability: Capability, value: unknown): CommandValidationResult {
  const property = capability.property ?? "<unknown>";

  switch (capability.valueType) {
    case "boolean": {
      // A command's `boolean` property is valid as a real boolean regardless
      // of the capability's declared encoding — that keeps existing callers
      // (HomeKit, automations, the API) working — or as one of the two
      // values this specific capability declares for on/off, defaulting to
      // `true`/`false` when it declares nothing (design.md D1, D3). This
      // replaces a hardcoded `"ON"`/`"OFF"` special case that accepted (and
      // silently mishandled) Zigbee2MQTT's convention for every source.
      if (typeof value === "boolean") return { ok: true };
      const onValue = capability.valueOn ?? true;
      const offValue = capability.valueOff ?? false;
      if (value === onValue || value === offValue) return { ok: true };
      return {
        ok: false,
        error: `Property "${property}" must be ${describeValueType(capability.valueType)} (or its declared on/off value: ${JSON.stringify(onValue)}/${JSON.stringify(offValue)}), got ${JSON.stringify(value)}`,
      };
    }

    case "numeric": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return {
          ok: false,
          error: `Property "${property}" must be ${describeValueType(capability.valueType)}, got ${typeof value}`,
        };
      }
      if (capability.range?.min !== undefined && value < capability.range.min) {
        return {
          ok: false,
          error: `Property "${property}" value ${value} is below its minimum of ${capability.range.min}`,
        };
      }
      if (capability.range?.max !== undefined && value > capability.range.max) {
        return {
          ok: false,
          error: `Property "${property}" value ${value} is above its maximum of ${capability.range.max}`,
        };
      }
      return { ok: true };
    }

    case "enum": {
      if (
        capability.permittedValues &&
        !capability.permittedValues.includes(value as string | number)
      ) {
        return {
          ok: false,
          error: `Property "${property}" value ${JSON.stringify(value)} is not one of the permitted values: ${capability.permittedValues.join(", ")}`,
        };
      }
      return { ok: true };
    }

    case "text":
      if (typeof value !== "string") {
        return {
          ok: false,
          error: `Property "${property}" must be ${describeValueType(capability.valueType)}, got ${typeof value}`,
        };
      }
      return { ok: true };

    // Composite/list/unknown capabilities carry a source-defined shape the
    // vocabulary does not otherwise constrain (design.md D22) — a known,
    // writable property of one of these kinds is accepted without further
    // shape enforcement.
    default:
      return { ok: true };
  }
}

/**
 * Validates a command's properties against a device's declared capability
 * schema. Rejects a property the schema does not declare, a property the
 * schema declares read-only, or a value outside a declared range or
 * permitted set — with a descriptive, per-property error and short-circuits
 * on the first violation encountered.
 */
export function validateCommand(
  capabilities: Capability[],
  properties: Record<string, unknown>,
): CommandValidationResult {
  const byProperty = flattenByProperty(capabilities);

  for (const [key, value] of Object.entries(properties)) {
    const capability = byProperty.get(key);
    if (!capability) {
      return { ok: false, error: `Unknown property "${key}"` };
    }
    if (!capability.access.writable) {
      return { ok: false, error: `Property "${key}" is not writable` };
    }
    const result = validateValue(capability, value);
    if (!result.ok) return result;
  }

  return { ok: true };
}
