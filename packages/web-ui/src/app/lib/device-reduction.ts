/**
 * Pure device-map reduction for the realtime stream (design.md D1, D11;
 * specs/web-ui "Data Sources").
 *
 * The five device categories all mutate the same `qualifiedId → descriptor`
 * map, so the data layer delegates every one of them here. Extracted from
 * `data-store.tsx` as a pure module (design.md D23) so each case — including
 * the no-op cases that must not grow the map — is reachable by `bun test`
 * without a DOM. Behaviour-preserving: what `applyEvent` did inline before,
 * it now does through this function.
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
 * unchanged when the event cannot change it — a delta for a device the client
 * has not seen, or a departure already applied — so React's referential-
 * equality bailout still applies and a no-op event triggers no re-render.
 *
 * A `device_appeared` always yields a new map: it is the one category that can
 * genuinely introduce a device.
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
