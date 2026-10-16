/**
 * Pure presentation model for the wall temperature widget: the sensor's readings,
 * or a contained explanation.
 */
import type { Capability } from "@ts-ha/shared";
import { type FlatCapability, flattenCapabilities } from "../../lib/capability-ranking.js";
import type { DeviceDescriptor } from "../../types.js";

/** One resolved reading: the device's numeric value with its declared unit, drawn as one run. */
interface TemperatureReading {
  value: number;
  unit?: string;
}

/**
 * The widget's presentation state: the sensor's readings, or a contained
 * explanation. The humidity is absent when the device declares none.
 */
export type TemperatureWidgetState =
  | { status: "reading"; value: number; unit?: string; humidity?: TemperatureReading }
  | { status: "unavailable"; message: string };

/**
 * The device's readable capability for `property`, resolved through the shared
 * {@link flattenCapabilities} helper.
 */
function readableCapability(
  capabilities: Capability[],
  property: string,
): FlatCapability | undefined {
  return flattenCapabilities(capabilities).find(
    (capability) => capability.property === property && capability.access.readable,
  );
}

/** The sensor's readable `temperature` capability, if it declares one. */
export function temperatureCapability(capabilities: Capability[]): FlatCapability | undefined {
  return readableCapability(capabilities, "temperature");
}

/**
 * The sensor's readable `humidity` capability, if it declares one, read through the
 * same plumbing the tile readout ranking uses.
 */
export function humidityCapability(capabilities: Capability[]): FlatCapability | undefined {
  return readableCapability(capabilities, "humidity");
}

/**
 * One of the device's readings: the value it reports for `capability` with the
 * capability's own unit, or `undefined`.
 */
function resolveReading(
  device: DeviceDescriptor,
  capability: FlatCapability | undefined,
): TemperatureReading | undefined {
  const value = capability === undefined ? undefined : device.state[capability.property];
  if (capability === undefined || typeof value !== "number") return undefined;
  return { value, unit: capability.unit };
}

/**
 * Resolves the widget's state from the configured device, containing an unknown or
 * unreadable device as an explanation rather than a throw.
 */
export function temperatureWidgetState(
  device: DeviceDescriptor | null,
  qualifiedId: string,
): TemperatureWidgetState {
  if (device === null) {
    return {
      status: "unavailable",
      message: qualifiedId
        ? `Temperature sensor "${qualifiedId}" is not available.`
        : "No sensor configured.",
    };
  }

  const reading = resolveReading(device, temperatureCapability(device.capabilities));
  if (reading === undefined) {
    return { status: "unavailable", message: "No temperature reading." };
  }

  const humidity = resolveReading(device, humidityCapability(device.capabilities));
  return {
    status: "reading",
    value: reading.value,
    unit: reading.unit,
    ...(humidity === undefined ? {} : { humidity }),
  };
}
