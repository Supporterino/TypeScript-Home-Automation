/**
 * Bridges `AggregateDeviceSource` changes onto the shared `EventBus`'s device
 * categories (design.md D1; specs/realtime-events "Event Categories"; tasks
 * 7.4, 7.5).
 *
 * `AggregateDeviceSource.subscribe()` only signals a device that changed —
 * never an explicit removal — so every notification also reconciles the
 * tracked snapshot against a fresh `list()`, emitting `device_disappeared`
 * for anything that dropped out. This is the same generic strategy
 * `DeviceCatalogSource` (`packages/core/src/services/homekit-sources/`) uses for
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
 * Wires every device change from `devices` onto `eventBus`'s `device_state`,
 * `device_reachability`, `device_appeared`, and `device_disappeared`
 * categories. Returns an unsubscribe function.
 *
 * Seeds its tracked snapshot from `devices.list()` at call time, so devices
 * already known when this is wired do not themselves emit a spurious
 * `device_appeared` — only a device that becomes known, or changes, after
 * this call does.
 *
 * When a `deviceStateStore` is supplied, it is reconciled once at wiring time
 * against the live enumeration — pruning records for devices removed while the
 * engine was stopped, which the per-notification path cannot observe (they are
 * absent from the `tracked` seed, so no later notification drops them) — and a
 * device that later drops out of enumeration has its stored record pruned
 * here, so a removed device's state does not reappear after a restart
 * (design.md D5). Reconciliation only prunes a record whose source is
 * currently available; an unavailable source's records are preserved.
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

  // Reconcile the store once at wiring time, after every available source has
  // enumerated. This prunes a store record whose device was removed while the
  // engine was stopped — it is never in the `tracked` seed above, so the
  // per-notification reconciliation below could never see it (design.md D5).
  // Assumes each available source has enumerated already; see `reconcileStore`
  // for the one configuration (Zigbee with persistence disabled) where that is
  // not yet true at this point.
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
        // A device no longer enumerated by any source has its last-known
        // record removed, so it cannot reappear after a restart (design.md D5).
        deviceStateStore?.prune(qualifiedId);
        eventBus.emit({ category: "device_disappeared", qualifiedId });
      }
    }
  });
}

/**
 * Prune every store record whose device is absent from the live enumeration —
 * but only when the record's owning source is currently available (design.md
 * D5; specs/device-state-store "Store Records Follow Device Lifecycle").
 *
 * `AggregateDeviceSource.list()` only yields available sources, so a device
 * missing from `list()` is ambiguous: it may have been removed, or its source
 * may simply be down. `sources()` disambiguates — a record for an unavailable
 * (or unregistered) source is preserved, since its absence reflects the source
 * being down rather than the device being gone. A qualified id that cannot be
 * parsed is likewise left untouched.
 *
 * This reconciliation assumes every available source has already enumerated by
 * the time it runs: Shelly awaits discovery in `start()`, Nanoleaf lists its
 * service registrations, state toggles read synchronously, and Zigbee is
 * populated from `deviceRegistry.load()` when `DEVICE_REGISTRY_PERSIST=true`
 * (the default). The one configuration that violates the assumption is
 * `DEVICE_REGISTRY_ENABLED=true` with `DEVICE_REGISTRY_PERSIST=false`: `load()`
 * is then a no-op and the registry is populated asynchronously from
 * `bridge/devices`, which happens *after* this runs, so `zigbee:*` records can
 * be pruned on such a startup. This is known and intentional — a
 * `ZigbeeDeviceSource` reports itself `available` from construction, and Zigbee
 * descriptors seed from the registry rather than the store, so no observable
 * last-known state is lost.
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
