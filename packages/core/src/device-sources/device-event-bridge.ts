/**
 * Bridge `AggregateDeviceSource` changes onto the shared `EventBus`'s device
 * categories. A first notification emits `device_appeared`; a tracked device emits
 * `device_state`/`device_reachability`, and every notification reconciles removals.
 */
import type { EventBus } from "../events/event-bus.js";
import type { AggregateDeviceSource } from "./aggregate.js";
import type { DeviceDescriptor } from "./device-source.js";
import type { DeviceStateStore } from "./device-state-store.js";
import { parseQualifiedId } from "./qualified-id.js";

/** Structural (non-reference) equality good enough for state property values, which are primitives or small plain objects. */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

/** The subset of a device's state that changed between two observations, including keys that were removed. */
function diffState(
  previous: Record<string, unknown>,
  current: Record<string, unknown>,
): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const key of Object.keys(current)) {
    if (!valuesEqual(previous[key], current[key])) changed[key] = current[key];
  }
  for (const key of Object.keys(previous)) {
    if (!(key in current)) changed[key] = undefined;
  }
  return changed;
}

/**
 * Wire every device change from `devices` onto `eventBus`'s device categories and
 * return an unsubscribe function; seeds its snapshot from `devices.list()`.
 */
export function wireDeviceEvents(
  devices: AggregateDeviceSource,
  eventBus: EventBus,
  deviceStateStore?: DeviceStateStore,
): () => void {
  const tracked: Map<string, DeviceDescriptor> = new Map();
  for (const descriptor of devices.list()) {
    tracked.set(descriptor.qualifiedId, descriptor);
  }

  // Reconcile the store once at wiring time; this prunes a record whose device was
  // removed while the engine was stopped, which the per-notification path cannot see.
  if (deviceStateStore) {
    reconcileStore(deviceStateStore, devices);
  }

  return devices.subscribe((descriptor) => {
    const previous = tracked.get(descriptor.qualifiedId);
    tracked.set(descriptor.qualifiedId, descriptor);

    if (!previous) {
      eventBus.emit({ category: "device_appeared", device: descriptor });
    } else {
      if (previous.reachable !== descriptor.reachable) {
        eventBus.emit({
          category: "device_reachability",
          qualifiedId: descriptor.qualifiedId,
          reachable: descriptor.reachable,
        });
      }
      const changed = diffState(previous.state, descriptor.state);
      if (Object.keys(changed).length > 0) {
        eventBus.emit({
          category: "device_state",
          qualifiedId: descriptor.qualifiedId,
          properties: changed,
          observation: descriptor.observation,
        });
      }
    }

    const live = new Set(devices.list().map((d) => d.qualifiedId));
    for (const qualifiedId of Array.from(tracked.keys())) {
      if (!live.has(qualifiedId)) {
        tracked.delete(qualifiedId);
        // A device no longer enumerated has its record removed, so it cannot
        // reappear after a restart.
        deviceStateStore?.prune(qualifiedId);
        eventBus.emit({ category: "device_disappeared", qualifiedId });
      }
    }
  });
}

/**
 * Prune every store record whose device is absent from the live enumeration and whose
 * owning source is available; a record for a down source, or an unparsable id, is kept.
 */
function reconcileStore(store: DeviceStateStore, devices: AggregateDeviceSource): void {
  const availability = new Map(devices.sources().map((source) => [source.id, source.available]));
  const live = new Set(devices.list().map((descriptor) => descriptor.qualifiedId));

  for (const qualifiedId of store.keys()) {
    if (live.has(qualifiedId)) continue;
    let source: string;
    try {
      source = parseQualifiedId(qualifiedId).source;
    } catch {
      continue;
    }
    if (availability.get(source) === true) {
      store.prune(qualifiedId);
    }
  }
}
