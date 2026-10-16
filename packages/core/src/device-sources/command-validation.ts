/**
 * Command validation against a device's declared capability schema. Every
 * `DeviceSource.command()` validates through {@link validateCommand} before
 * touching its transport, so an invalid property never reaches a device.
 */
import {
  type Capability,
  type CapabilityValueType,
  composeBooleanCapabilityValue,
} from "@ts-ha/shared";

export type CommandValidationResult = { ok: true } | { ok: false; error: string };

/**
 * Flatten a capability tree into a `property -> Capability` map, walking into `features`
 * for container capabilities; a later duplicate property overwrites an earlier one.
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
      // A boolean property is valid as a real boolean (keeping existing callers
      // working) or as one of the capability's declared on/off values.
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

    // Composite/list/unknown capabilities carry a source-defined shape, so a known,
    // writable property of these kinds is accepted without further enforcement.
    default:
      return { ok: true };
  }
}

/**
 * Validate a command's properties against a device's declared capability schema, rejecting
 * an undeclared, read-only, or out-of-range property with a descriptive error.
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

/**
 * Translate a validated command's properties into the target capability's declared
 * encoding immediately before dispatch: a real boolean is composed into the
 * capability's on/off value, and any other value is left untouched.
 */
export function translateCommandProperties(
  capabilities: Capability[],
  properties: Record<string, unknown>,
): Record<string, unknown> {
  const byProperty = flattenByProperty(capabilities);
  const translated: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(properties)) {
    const capability = byProperty.get(key);
    if (capability?.valueType === "boolean" && typeof value === "boolean") {
      translated[key] = composeBooleanCapabilityValue(capability, value);
      continue;
    }
    translated[key] = value;
  }

  return translated;
}
