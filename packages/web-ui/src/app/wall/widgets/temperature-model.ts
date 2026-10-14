/**
 * Pure presentation model for the wall temperature widget (design.md D11, D13;
 * specs/wall-display "Widget Catalog"). Extracted so the reading resolution and
 * the unknown-device containment are reachable by `bun test` without a DOM —
 * the same shape as the weather/energy models beside it.
 *
 * The reading is resolved from the device's own state through the shared
 * flattened-capability plumbing `capability-ranking.ts` already uses to rank a
 * tile readout — no new backend, service, or endpoint.
 */
import type { Capability } from "@ts-ha/shared";
import { type FlatCapability, flattenCapabilities } from "../../lib/capability-ranking.js";
import type { DeviceDescriptor } from "../../types.js";

/** The widget's presentation state: a sensor reading, or a contained explanation. */
export type TemperatureWidgetState =
  | { status: "reading"; value: number; unit?: string }
  | { status: "unavailable"; message: string };

/**
 * The sensor's readable `temperature` capability, if it declares one. Resolved
 * through the shared {@link flattenCapabilities} helper so it reads the same
 * property the tile readout ranking consults.
 */
export function temperatureCapability(capabilities: Capability[]): FlatCapability | undefined {
  return flattenCapabilities(capabilities).find(
    (capability) => capability.property === "temperature" && capability.access.readable,
  );
}

/**
 * Resolves the widget's state from the configured device. A device that is not,
 * or is no longer, available — or that reports no numeric temperature — yields a
 * contained explanation within the widget's own area, never a throw, so the rest
 * of the profile still renders (specs/wall-display "An unknown temperature device
 * is contained").
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

  const capability = temperatureCapability(device.capabilities);
  const value = capability ? device.state[capability.property] : undefined;
  if (capability === undefined || typeof value !== "number") {
    return { status: "unavailable", message: "No temperature reading." };
  }

  return { status: "reading", value, unit: capability.unit };
}
