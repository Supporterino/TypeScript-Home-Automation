/**
 * Pure presentation model for the wall temperature widget (design.md D11, D13,
 * W5; specs/wall-display "Widget Catalog"). Extracted so the reading resolution
 * and the unknown-device containment are reachable by `bun test` without a DOM —
 * the same shape as the weather/energy models beside it.
 *
 * The widget presents what its bound sensor declares: its temperature, and — on
 * the same device — its humidity where the sensor carries one, so a sensor this
 * home runs presents both readings and a temperature-only sensor presents one,
 * with no second device and no per-profile setting (design.md W5). Each reading
 * is resolved from the device's own state through the shared
 * flattened-capability plumbing `capability-ranking.ts` already uses to rank a
 * tile readout — no new backend, service, or endpoint.
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
 * explanation. The temperature is the widget's own reading; the humidity sits
 * beside it as the optional second one, absent — never a placeholder or an empty
 * line — when the device declares none (specs/wall-display "A sensor without
 * humidity shows only its temperature").
 */
export type TemperatureWidgetState =
  | { status: "reading"; value: number; unit?: string; humidity?: TemperatureReading }
  | { status: "unavailable"; message: string };

/**
 * The device's readable capability for `property`, resolved through the shared
 * {@link flattenCapabilities} helper so a reading reads the same leaf the tile
 * readout ranking consults — never a re-walk of the capability tree.
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
 * The sensor's readable `humidity` capability, if it declares one (design.md W5;
 * specs/wall-display "A temperature widget shows its sensor's humidity"). Read
 * through the same plumbing and the same property name the tile readout ranking
 * ranks, so the widget and the tile agree on which leaf is the device's humidity.
 */
export function humidityCapability(capabilities: Capability[]): FlatCapability | undefined {
  return readableCapability(capabilities, "humidity");
}

/**
 * One of the device's readings: the value it reports for `capability`, with the
 * capability's own unit. A capability the device declares but reports no number
 * for — or that it does not declare at all — yields `undefined`, so the reading
 * is absent rather than an empty line or a placeholder.
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
 * Resolves the widget's state from the configured device. A device that is not,
 * or is no longer, available — or that reports no numeric temperature — yields a
 * contained explanation within the widget's own area, never a throw, so the rest
 * of the profile still renders (specs/wall-display "An unknown temperature device
 * is contained"). A device that reports one is presented with its humidity
 * beside it where it declares one.
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
