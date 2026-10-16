import { describe, expect, it, mock } from "bun:test";
import { unlink } from "node:fs/promises";
import pino from "pino";
import { AggregateDeviceSource } from "../src/device-sources/aggregate.js";
import { wireDeviceEvents } from "../src/device-sources/device-event-bridge.js";
import type {
  DeviceChangeListener,
  DeviceCommandOutcome,
  DeviceDescriptor,
} from "../src/device-sources/device-source.js";
import { DeviceStateStore } from "../src/device-sources/device-state-store.js";
import { formatQualifiedId } from "../src/device-sources/qualified-id.js";
import type { DeviceVisibility } from "../src/device-visibility.js";
import { EventBus, type StreamEvent } from "../src/events/event-bus.js";

const logger = pino({ level: "silent" });

/** A minimal fake `DeviceVisibility` — every device is visible. */
function makeVisibility(): DeviceVisibility {
  return { isHidden: () => false } as unknown as DeviceVisibility;
}

/** A minimal in-memory fake DeviceSource, mutable via `setDevices`/`emit` for test control. */
function makeFakeSource(id: string, initialDevices: DeviceDescriptor[] = []) {
  let devices = initialDevices;
  const listeners = new Set<DeviceChangeListener>();
  return {
    id,
    available: true,
    start: mock(() => {}),
    stop: mock(() => {}),
    list: mock(() => devices),
    get: mock((deviceId: string) => devices.find((d) => d.id === deviceId)),
    command: mock(async (): Promise<DeviceCommandOutcome> => ({ status: "ok" })),
    subscribe: mock((listener: DeviceChangeListener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    setDevices(next: DeviceDescriptor[]): void {
      devices = next;
    },
    emit(descriptor: DeviceDescriptor): void {
      devices = [...devices.filter((d) => d.id !== descriptor.id), descriptor];
      for (const listener of listeners) listener(descriptor);
    },
  };
}

function makeDescriptor(
  source: string,
  id: string,
  overrides: Partial<DeviceDescriptor> = {},
): DeviceDescriptor {
  return {
    source,
    id,
    qualifiedId: formatQualifiedId(source, id),
    displayName: id,
    state: { on: false },
    capabilities: [],
    reachable: true,
    observation: { mode: "push", observedAt: Date.now() },
    hidden: false,
    ...overrides,
  };
}

describe("wireDeviceEvents", () => {
  it("emits device_appeared for a device notified for the first time", async () => {
    const fake = makeFakeSource("zigbee");
    const aggregate = new AggregateDeviceSource([fake], makeVisibility(), logger);
    const bus = new EventBus();
    const events: StreamEvent[] = [];
    bus.subscribe((e) => events.push(e));

    await aggregate.start();
    wireDeviceEvents(aggregate, bus);
    fake.emit(makeDescriptor("zigbee", "0xaaa"));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      category: "device_appeared",
      device: { qualifiedId: "zigbee:0xaaa" },
    });
  });

  it("does not emit device_appeared for a device already known when wired", async () => {
    const fake = makeFakeSource("zigbee", [makeDescriptor("zigbee", "0xaaa")]);
    const aggregate = new AggregateDeviceSource([fake], makeVisibility(), logger);
    const bus = new EventBus();
    const events: StreamEvent[] = [];
    bus.subscribe((e) => events.push(e));

    await aggregate.start();
    wireDeviceEvents(aggregate, bus);

    expect(events).toHaveLength(0);
  });

  it("emits device_state carrying only the changed properties, not the full inventory", async () => {
    const fake = makeFakeSource("zigbee", [
      makeDescriptor("zigbee", "0xaaa", { state: { on: false, brightness: 10 } }),
    ]);
    const aggregate = new AggregateDeviceSource([fake], makeVisibility(), logger);
    const bus = new EventBus();
    const events: StreamEvent[] = [];
    bus.subscribe((e) => events.push(e));

    await aggregate.start();
    wireDeviceEvents(aggregate, bus);
    fake.emit(makeDescriptor("zigbee", "0xaaa", { state: { on: true, brightness: 10 } }));

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      category: "device_state",
      qualifiedId: "zigbee:0xaaa",
      properties: { on: true },
      observation: expect.objectContaining({ mode: "push" }),
    });
  });

  it("emits device_reachability when reachability changes without a state change", async () => {
    const fake = makeFakeSource("shelly", [
      makeDescriptor("shelly", "plug", { state: { on: true } }),
    ]);
    const aggregate = new AggregateDeviceSource([fake], makeVisibility(), logger);
    const bus = new EventBus();
    const events: StreamEvent[] = [];
    bus.subscribe((e) => events.push(e));

    await aggregate.start();
    wireDeviceEvents(aggregate, bus);
    fake.emit(makeDescriptor("shelly", "plug", { state: { on: true }, reachable: false }));

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      category: "device_reachability",
      qualifiedId: "shelly:plug",
      reachable: false,
    });
  });

  it("emits both device_reachability and device_state when both change together", async () => {
    const fake = makeFakeSource("shelly", [
      makeDescriptor("shelly", "plug", { state: { on: true } }),
    ]);
    const aggregate = new AggregateDeviceSource([fake], makeVisibility(), logger);
    const bus = new EventBus();
    const events: StreamEvent[] = [];
    bus.subscribe((e) => events.push(e));

    await aggregate.start();
    wireDeviceEvents(aggregate, bus);
    fake.emit(makeDescriptor("shelly", "plug", { state: { on: false }, reachable: false }));

    expect(events.map((e) => e.category).sort()).toEqual(["device_reachability", "device_state"]);
  });

  it("emits device_disappeared when a device drops out of enumeration", async () => {
    const fakeA = makeFakeSource("zigbee", [makeDescriptor("zigbee", "0xaaa")]);
    const fakeB = makeFakeSource("shelly", [makeDescriptor("shelly", "plug")]);
    const aggregate = new AggregateDeviceSource([fakeA, fakeB], makeVisibility(), logger);
    const bus = new EventBus();
    const events: StreamEvent[] = [];
    bus.subscribe((e) => events.push(e));

    await aggregate.start();
    wireDeviceEvents(aggregate, bus);

    // "0xaaa" disappears from zigbee's own enumeration; the notification
    // carrying its removal is a change on a still-present device (shelly),
    // matching how a real source's own listener fires on any change.
    fakeA.setDevices([]);
    fakeB.emit(makeDescriptor("shelly", "plug", { state: { on: true } }));

    const disappeared = events.filter((e) => e.category === "device_disappeared");
    expect(disappeared).toEqual([{ category: "device_disappeared", qualifiedId: "zigbee:0xaaa" }]);
  });

  it("flows events from a push-backed change and a polled change alike", async () => {
    const pushSource = makeFakeSource("zigbee", [
      makeDescriptor("zigbee", "0xaaa", {
        state: { on: false },
        observation: { mode: "push", observedAt: 1 },
      }),
    ]);
    const polledSource = makeFakeSource("nanoleaf", [
      makeDescriptor("nanoleaf", "panel", {
        state: { on: false },
        observation: { mode: "polled", observedAt: 1, refreshIntervalMs: 10000 },
      }),
    ]);
    const aggregate = new AggregateDeviceSource(
      [pushSource, polledSource],
      makeVisibility(),
      logger,
    );
    const bus = new EventBus();
    const events: StreamEvent[] = [];
    bus.subscribe((e) => events.push(e));

    await aggregate.start();
    wireDeviceEvents(aggregate, bus);

    pushSource.emit(
      makeDescriptor("zigbee", "0xaaa", {
        state: { on: true },
        observation: { mode: "push", observedAt: 2 },
      }),
    );
    polledSource.emit(
      makeDescriptor("nanoleaf", "panel", {
        state: { on: true },
        observation: { mode: "polled", observedAt: 2, refreshIntervalMs: 10000 },
      }),
    );

    const stateEvents = events.filter((e) => e.category === "device_state");
    expect(stateEvents).toHaveLength(2);
    expect(stateEvents.map((e) => (e as { qualifiedId: string }).qualifiedId).sort()).toEqual([
      "nanoleaf:panel",
      "zigbee:0xaaa",
    ]);
  });

  it("returns an unsubscribe function that stops further events", async () => {
    const fake = makeFakeSource("zigbee");
    const aggregate = new AggregateDeviceSource([fake], makeVisibility(), logger);
    const bus = new EventBus();
    const events: StreamEvent[] = [];
    bus.subscribe((e) => events.push(e));

    const unsubscribe = wireDeviceEvents(aggregate, bus);
    unsubscribe();
    fake.emit(makeDescriptor("zigbee", "0xaaa"));

    expect(events).toHaveLength(0);
  });

  it("hiding a device emits no device_disappeared", async () => {
    const fake = makeFakeSource("zigbee", [makeDescriptor("zigbee", "0xaaa")]);
    // Total enumeration is unaffected by visibility — hiding stamps the
    // descriptor but does not remove it from list(), so the bridge's
    // reconciliation never sees a hidden device drop out.
    const aggregate = new AggregateDeviceSource(
      [fake],
      { isHidden: () => true } as unknown as DeviceVisibility,
      logger,
    );
    await aggregate.start();
    const bus = new EventBus();
    const events: StreamEvent[] = [];
    bus.subscribe((e) => events.push(e));

    wireDeviceEvents(aggregate, bus);
    fake.emit(makeDescriptor("zigbee", "0xaaa", { state: { on: true } }));

    expect(events.some((e) => e.category === "device_disappeared")).toBe(false);
  });

  it("prunes a disappeared device's store record so it is not restored on the next start", async () => {
    const filePath = "./test-device-event-bridge-prune.json";
    await removeFiles(filePath);

    const store = new DeviceStateStore(logger, { persist: true, filePath, flushIntervalMs: 0 });
    const fakeA = makeFakeSource("zigbee", [makeDescriptor("zigbee", "0xaaa")]);
    const fakeB = makeFakeSource("shelly", [makeDescriptor("shelly", "plug")]);
    const aggregate = new AggregateDeviceSource([fakeA, fakeB], makeVisibility(), logger);
    const bus = new EventBus();

    store.record("zigbee:0xaaa", { on: true }, { mode: "push", observedAt: 1 });
    store.record("shelly:plug", { on: false }, { mode: "push", observedAt: 1 });

    await aggregate.start();
    wireDeviceEvents(aggregate, bus, store);

    // "0xaaa" disappears from zigbee's enumeration; a change on the still-present
    // shelly device drives the reconciliation that observes the disappearance.
    fakeA.setDevices([]);
    fakeB.emit(makeDescriptor("shelly", "plug", { state: { on: true } }));

    expect(store.get("zigbee:0xaaa")).toBeUndefined();
    expect(store.get("shelly:plug")).toBeDefined();

    await store.flush();
    const restored = new DeviceStateStore(logger, { persist: true, filePath });
    await restored.load();
    expect(restored.get("zigbee:0xaaa")).toBeUndefined();
    expect(restored.get("shelly:plug")).toBeDefined();

    await removeFiles(filePath);
  });

  it("prunes a store record for an available source whose device is absent at wiring", async () => {
    const filePath = "./test-device-event-bridge-reconcile.json";
    await removeFiles(filePath);

    const store = new DeviceStateStore(logger, { persist: true, filePath, flushIntervalMs: 0 });
    // "0xaaa" is stored but its source no longer enumerates it — it was
    // removed while the engine was stopped, so it never enters the wiring-time
    // seed and the per-notification path can never observe its disappearance.
    store.record("zigbee:0xaaa", { on: true }, { mode: "push", observedAt: 1 });

    const fake = makeFakeSource("zigbee", [makeDescriptor("zigbee", "0xbbb")]);
    const aggregate = new AggregateDeviceSource([fake], makeVisibility(), logger);
    const bus = new EventBus();

    await aggregate.start();
    wireDeviceEvents(aggregate, bus, store);

    expect(store.get("zigbee:0xaaa")).toBeUndefined();

    // The prune is persisted, so it is not restored on the next start.
    await store.flush();
    const restored = new DeviceStateStore(logger, { persist: true, filePath });
    await restored.load();
    expect(restored.get("zigbee:0xaaa")).toBeUndefined();

    await removeFiles(filePath);
  });

  it("retains a store record for a currently unavailable source", async () => {
    const store = new DeviceStateStore(logger, { persist: false });
    store.record("shelly:plug", { on: true }, { mode: "polled", observedAt: 1 });

    // The source is down — its device is absent from list() only because the
    // source is unavailable, not because the device was removed.
    const fake = makeFakeSource("shelly");
    fake.available = false;
    const aggregate = new AggregateDeviceSource([fake], makeVisibility(), logger);
    const bus = new EventBus();

    await aggregate.start();
    wireDeviceEvents(aggregate, bus, store);

    expect(store.get("shelly:plug")).toBeDefined();
  });
});

/** Remove a persistence file and its siblings, ignoring any that are absent. */
async function removeFiles(filePath: string): Promise<void> {
  for (const path of [filePath, `${filePath}.bak`, `${filePath}.tmp`]) {
    try {
      await unlink(path);
    } catch {
      // ignore a file that does not exist
    }
  }
}
