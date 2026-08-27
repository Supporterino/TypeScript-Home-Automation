/**
 * Bridges `AggregateDeviceSource` changes onto the shared `EventBus`'s device
 * categories (design.md D1; specs/realtime-events "Event Categories"; tasks
 * 7.4, 7.5).
 *
 * `AggregateDeviceSource.subscribe()` only signals a device that changed —
 * never an explicit removal — so every notification also reconciles the
 * tracked snapshot against a fresh `list()`, emitting `device_disappeared`
 * for anything that dropped out. This is the same generic strategy
 * `DeviceCatalogSource` (`src/core/services/homekit-sources/`) uses for
 * HomeKit accessory removal, applied here for the SSE stream instead.
 *
 * A device notified for the first time since wiring emits `device_appeared`
 * with its full descriptor; a device already tracked emits `device_state`
 * (only the properties that changed) and/or `device_reachability`, so a
 * single device change never resends the inventory.
 */
import type { EventBus } from "../events/event-bus.js";
import type { AggregateDeviceSource } from "./aggregate.js";
import type { DeviceDescriptor } from "./device-source.js";

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
 * Wires every device change from `devices` onto `eventBus`'s `device_state`,
 * `device_reachability`, `device_appeared`, and `device_disappeared`
 * categories. Returns an unsubscribe function.
 *
 * Seeds its tracked snapshot from `devices.list()` at call time, so devices
 * already known when this is wired do not themselves emit a spurious
 * `device_appeared` — only a device that becomes known, or changes, after
 * this call does.
 */
export function wireDeviceEvents(devices: AggregateDeviceSource, eventBus: EventBus): () => void {
  const tracked: Map<string, DeviceDescriptor> = new Map();
  for (const descriptor of devices.list()) {
    tracked.set(descriptor.qualifiedId, descriptor);
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
        eventBus.emit({ category: "device_disappeared", qualifiedId });
      }
    }
  });
}
