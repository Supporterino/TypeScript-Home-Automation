/**
 * Bridge `AggregateDeviceSource` changes onto the shared `EventBus`'s device
 * categories. A first notification emits `device_appeared`; a tracked device emits
 * `device_state`/`device_reachability`, and every topology change reconciles removals.
 * Store reconciliation is gated on a source having completed an authoritative
 * enumeration, so a source still waiting for its retained list cannot prune the
 * records a restart would seed from.
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

  /** Source ids already reconciled; used to detect a source newly becoming ready. */
  const reconciled: Set<string> = new Set();

  /** Source ids that are available and have completed an authoritative enumeration. */
  function readySourceIds(): Set<string> {
    return new Set(
      devices
        .sources()
        .filter((source) => source.available && source.hasEnumerated === true)
        .map((source) => source.id),
    );
  }

  /**
   * Reconcile the store. On a descriptor notification this runs only when a source has
   * newly become ready; an applied authoritative list (`force`) always re-checks, because a
   * payload can remove a device or group without emitting any descriptor notification.
   */
  function reconcileReadySources(force: boolean): void {
    if (!deviceStateStore) return;

    const ready = readySourceIds();

    let newlyReady = false;
    for (const id of ready) {
      if (reconciled.has(id)) continue;
      reconciled.add(id);
      newlyReady = true;
    }

    // Hand the store only the sources ready *now*: the accumulated set merely decides
    // whether a reconcile is due, so a source that has since become unavailable keeps its
    // records instead of being pruned by another source's notification.
    if (newlyReady || force) {
      reconcileStore(deviceStateStore, devices, ready);
    }
  }

  /**
   * Sweep devices that dropped out of enumeration and reconcile the store. Run after every
   * descriptor notification and whenever a source reports a device-set change that produced
   * no descriptor (a removal-only `bridge/devices` or any `bridge/groups` payload).
   */
  function reconcileTopology(force: boolean): void {
    // Only a source that is available and has enumerated can authoritatively report a
    // removal; a down or not-yet-enumerated source may be transiently empty, so its
    // tracked devices are kept rather than marked disappeared.
    const reportableSources = readySourceIds();
    const live = new Set(devices.list().map((d) => d.qualifiedId));
    for (const qualifiedId of Array.from(tracked.keys())) {
      if (live.has(qualifiedId)) continue;
      const source = sourceIdOf(qualifiedId);
      if (source === undefined || !reportableSources.has(source)) continue;
      tracked.delete(qualifiedId);
      // A device no longer enumerated has its record removed, so it cannot
      // reappear after a restart.
      deviceStateStore?.prune(qualifiedId);
      eventBus.emit({ category: "device_disappeared", qualifiedId });
    }

    reconcileReadySources(force);
  }

  // Reconcile once at wiring time; this prunes a record whose device was removed while
  // the engine was stopped, as soon as its source has an authoritative enumeration.
  reconcileTopology(false);

  const unsubscribeDescriptors = devices.subscribe((descriptor) => {
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

    // A retained bridge payload both changes the device set and flips readiness, so
    // reconcile newly enumerated sources after every notification.
    reconcileTopology(false);
  });

  // A topology change with no descriptor notification (removal-only device list, any
  // group list) still has to prune and reconcile immediately.
  const unsubscribeSetChanges = devices.onDeviceSetChanged(() => reconcileTopology(true));

  return () => {
    unsubscribeDescriptors();
    unsubscribeSetChanges();
  };
}

/**
 * Prune every store record whose device is absent from the live enumeration and whose
 * owning source is in `readySourceIds`; a record for an unavailable or not-yet-enumerated
 * source, or an unparsable id, is kept.
 */
function reconcileStore(
  store: DeviceStateStore,
  devices: AggregateDeviceSource,
  readySourceIds: Set<string>,
): void {
  const live = new Set(devices.list().map((descriptor) => descriptor.qualifiedId));

  for (const qualifiedId of store.keys()) {
    if (live.has(qualifiedId)) continue;
    const source = sourceIdOf(qualifiedId);
    if (source !== undefined && readySourceIds.has(source)) {
      store.prune(qualifiedId);
    }
  }
}

/** The source id of a qualified device id, or `undefined` when it cannot be parsed. */
function sourceIdOf(qualifiedId: string): string | undefined {
  try {
    return parseQualifiedId(qualifiedId).source;
  } catch {
    return undefined;
  }
}
