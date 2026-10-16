/**
 * Pure device-map reduction for the realtime stream, applied by the data layer.
 */

import type { DeviceDescriptor } from "@ts-ha/shared";
import type { NormalizedStreamEvent } from "../types.js";

/** The stream categories that mutate the live device map. */
export type DeviceMapEventCategory =
  | "device_state"
  | "device_reachability"
  | "device_appeared"
  | "device_disappeared"
  | "device_visibility";

/** The subset of stream events that mutate the live device map. */
export type DeviceMapEvent = Extract<NormalizedStreamEvent, { category: DeviceMapEventCategory }>;

/**
 * Applies one device-map event, returning the next map. Returns `devices`
 * unchanged when the event cannot change it, so a no-op triggers no re-render.
 */
export function reduceDeviceEvent(
  devices: Map<string, DeviceDescriptor>,
  event: DeviceMapEvent,
): Map<string, DeviceDescriptor> {
  switch (event.category) {
    case "device_state": {
      const existing = devices.get(event.qualifiedId);
      if (!existing) return devices;
      const next = new Map(devices);
      next.set(event.qualifiedId, {
        ...existing,
        state: { ...existing.state, ...event.properties },
        observation: event.observation,
      });
      return next;
    }
    case "device_reachability": {
      const existing = devices.get(event.qualifiedId);
      if (!existing) return devices;
      const next = new Map(devices);
      next.set(event.qualifiedId, { ...existing, reachable: event.reachable });
      return next;
    }
    case "device_appeared": {
      const next = new Map(devices);
      next.set(event.device.qualifiedId, event.device);
      return next;
    }
    case "device_disappeared": {
      if (!devices.has(event.qualifiedId)) return devices;
      const next = new Map(devices);
      next.delete(event.qualifiedId);
      return next;
    }
    case "device_visibility": {
      const existing = devices.get(event.qualifiedId);
      if (!existing) return devices;
      const next = new Map(devices);
      next.set(event.qualifiedId, { ...existing, hidden: event.hidden });
      return next;
    }
  }
}

/**
 * Returns the qualified id of a delta event the client cannot apply because it
 * does not hold the device, or `null` when no recovery is needed.
 */
export function unknownDeviceDeltaId(
  devices: Map<string, DeviceDescriptor>,
  event: DeviceMapEvent,
): string | null {
  switch (event.category) {
    case "device_state":
    case "device_reachability":
    case "device_visibility":
      return devices.has(event.qualifiedId) ? null : event.qualifiedId;
    case "device_appeared":
    case "device_disappeared":
      return null;
  }
}
