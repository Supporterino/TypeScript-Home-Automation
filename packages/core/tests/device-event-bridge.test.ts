import { describe, expect, it, mock } from "bun:test";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DeviceObservation } from "@ts-ha/shared";
import type { ZigbeeDevice, ZigbeeGroup } from "@ts-ha/shared/types";
import pino from "pino";
import type { Config } from "../src/config.js";
import { AggregateDeviceSource } from "../src/device-sources/aggregate.js";
import { wireDeviceEvents } from "../src/device-sources/device-event-bridge.js";
import type {
  DeviceChangeListener,
  DeviceCommandOutcome,
  DeviceDescriptor,
  DeviceSource,
} from "../src/device-sources/device-source.js";
import { DeviceStateStore } from "../src/device-sources/device-state-store.js";
import { formatQualifiedId } from "../src/device-sources/qualified-id.js";
import { ZigbeeGroupDeviceSource } from "../src/device-sources/zigbee-group-source.js";
import { ZigbeeDeviceSource } from "../src/device-sources/zigbee-source.js";
import type { DeviceVisibility } from "../src/device-visibility.js";
import { EventBus, type StreamEvent } from "../src/events/event-bus.js";
import type { MqttMessageHandler, MqttService } from "../src/mqtt/mqtt-service.js";
import {
  DeviceRegistry,
  type DeviceRegistryPersistenceOptions,
} from "../src/zigbee/device-registry.js";

const logger = pino({ level: "silent" });

const zigbeeConfig: Config = {
  mqtt: { host: "localhost", port: 1883, username: "", password: "", shellyRpcSrc: "test" },
  zigbee2mqttPrefix: "zigbee2mqtt",
  logLevel: "info",
  state: { persist: false, filePath: "./state.json", flushIntervalMs: 1000 },
  automations: { recursive: false },
  deviceRegistry: { enabled: true, persist: false, filePath: "./device-registry.json" },
  devices: { shellyPollMs: 10000, nanoleafPollMs: 10000 },
  httpServer: { port: 0, token: "" },
  services: {},
};

/** A minimal fake `DeviceVisibility` — every device is visible. */
function makeVisibility(): DeviceVisibility {
  return { isHidden: () => false } as unknown as DeviceVisibility;
}

/** A mutable fake source: `available` and `hasEnumerated` can be flipped by a test. */
type MutableFakeSource = Omit<DeviceSource, "available" | "hasEnumerated"> & {
  available: boolean;
  hasEnumerated?: boolean;
  setDevices(next: DeviceDescriptor[]): void;
  emit(descriptor: DeviceDescriptor): void;
};

/** A minimal in-memory fake DeviceSource, mutable via `setDevices`/`emit` for test control. */
function makeFakeSource(id: string, initialDevices: DeviceDescriptor[] = []): MutableFakeSource {
  let devices = initialDevices;
  const listeners = new Set<DeviceChangeListener>();
  return {
    id,
    available: true,
    hasEnumerated: true,
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

/** A minimal `ZigbeeDevice` fixture for registry-driven readiness tests. */
function makeZigbeeDevice(friendlyName: string, ieee: string): ZigbeeDevice {
  return {
    ieee_address: ieee,
    friendly_name: friendlyName,
    type: "Router",
    supported: true,
    disabled: false,
    interview_state: "SUCCESSFUL",
    definition: null,
  };
}

/** A minimal `ZigbeeGroup` fixture for group-list topology tests. */
function makeGroup(
  id: number,
  friendlyName: string,
  members: { ieee_address: string; endpoint: number }[] = [],
): ZigbeeGroup {
  return { id, friendly_name: friendlyName, members };
}

/** A mock MqttService that captures subscriptions so a test can emit bridge payloads. */
function createMockMqtt() {
  const subscriptions: { topic: string; handler: MqttMessageHandler }[] = [];
  const mqtt = {
    subscribe: mock((topic: string, handler: MqttMessageHandler) => {
      subscriptions.push({ topic, handler });
    }),
    unsubscribe: mock(() => {}),
    publish: mock(() => {}),
    publishToDevice: mock(() => {}),
  } as unknown as MqttService;

  function emit(topic: string, payload: Record<string, unknown>): void {
    for (const { topic: t, handler } of subscriptions) {
      if (t === topic) handler(topic, payload);
    }
  }

  return { mqtt, emit };
}

/**
 * An engine-shaped harness: a real `DeviceRegistry` and `ZigbeeDeviceSource` behind an
 * `AggregateDeviceSource`, sharing one persisted `DeviceStateStore`.
 */
function createZigbeeHarness(
  storeFilePath: string,
  registryOptions: DeviceRegistryPersistenceOptions = {},
) {
  const mqttMock = createMockMqtt();
  const registry = new DeviceRegistry(mqttMock.mqtt, zigbeeConfig, logger, {}, registryOptions);
  const store = new DeviceStateStore(logger, {
    persist: true,
    filePath: storeFilePath,
    flushIntervalMs: 0,
  });
  const source = new ZigbeeDeviceSource(registry, mqttMock.mqtt, logger, store);
  const groupSource = new ZigbeeGroupDeviceSource(registry, mqttMock.mqtt, logger, store);
  const aggregate = new AggregateDeviceSource([source, groupSource], makeVisibility(), logger);
  return { mqttMock, registry, store, source, groupSource, aggregate };
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

  it("retains a store record whose qualified id cannot be parsed", async () => {
    const store = new DeviceStateStore(logger, { persist: false });
    store.record("not-a-qualified-id", { x: 1 }, { mode: "push", observedAt: 1 });

    const fake = makeFakeSource("zigbee", [makeDescriptor("zigbee", "0xbbb")]);
    const aggregate = new AggregateDeviceSource([fake], makeVisibility(), logger);

    await aggregate.start();
    wireDeviceEvents(aggregate, new EventBus(), store);

    expect(store.get("not-a-qualified-id")).toBeDefined();
  });

  it("retains records for a source that becomes unavailable after reconciling", async () => {
    const store = new DeviceStateStore(logger, { persist: false });
    store.record("zigbee:0xaaa", { on: true }, { mode: "push", observedAt: 1 });

    const zigbee = makeFakeSource("zigbee", [makeDescriptor("zigbee", "0xaaa")]);
    const shelly = makeFakeSource("shelly");
    shelly.hasEnumerated = false;
    const aggregate = new AggregateDeviceSource([zigbee, shelly], makeVisibility(), logger);
    await aggregate.start();

    const unsubscribe = wireDeviceEvents(aggregate, new EventBus(), store);
    // zigbee reconciled at wiring while its device kept the record live.
    expect(store.get("zigbee:0xaaa")).toBeDefined();

    // zigbee then goes down; a readiness flip on another source must not prune its records.
    zigbee.available = false;
    shelly.hasEnumerated = true;
    shelly.emit(makeDescriptor("shelly", "plug"));

    expect(store.get("zigbee:0xaaa")).toBeDefined();

    unsubscribe();
    await aggregate.stop();
  });

  it("treats a source that omits hasEnumerated as not enumerated", async () => {
    const store = new DeviceStateStore(logger, { persist: false });
    store.record("zigbee:0xaaa", { on: true }, { mode: "push", observedAt: 1 });

    const fake = makeFakeSource("zigbee", [makeDescriptor("zigbee", "0xbbb")]);
    delete fake.hasEnumerated;
    const aggregate = new AggregateDeviceSource([fake], makeVisibility(), logger);

    await aggregate.start();
    wireDeviceEvents(aggregate, new EventBus(), store);

    expect(store.get("zigbee:0xaaa")).toBeDefined();
  });

  it("retains a Zigbee record until bridge/devices arrives, then seeds from it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ts-ha-bridge-readiness-seed-"));
    const harness = createZigbeeHarness(join(dir, "device-state.json"));
    const qualifiedId = formatQualifiedId("zigbee", "0xaaa");
    const storedState = { state: "ON", brightness: 42 };
    const storedObservation: DeviceObservation = {
      mode: "push",
      observedAt: Date.now() - 60_000,
    };
    harness.store.record(qualifiedId, storedState, storedObservation);

    harness.registry.start();
    await harness.aggregate.start();
    const unsubscribe = wireDeviceEvents(harness.aggregate, new EventBus(), harness.store);

    // The registry has enumerated nothing yet: the record is a cold-start seed, not stale.
    expect(harness.source.hasEnumerated).toBe(false);
    expect(harness.store.get(qualifiedId)?.state).toEqual(storedState);

    harness.mqttMock.emit("zigbee2mqtt/bridge/devices", [
      makeZigbeeDevice("lamp", "0xaaa"),
    ] as unknown as Record<string, unknown>);

    expect(harness.source.hasEnumerated).toBe(true);
    expect(harness.store.get(qualifiedId)?.state).toEqual(storedState);
    const descriptor = harness.source.get("0xaaa");
    expect(descriptor?.state).toEqual(storedState);
    expect(descriptor?.observation).toEqual(storedObservation);

    unsubscribe();
    await harness.aggregate.stop();
    await harness.store.flush();
    await rm(dir, { recursive: true, force: true });
  });

  it("prunes a Zigbee record once the authoritative bridge/devices list omits it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ts-ha-bridge-readiness-prune-"));
    const harness = createZigbeeHarness(join(dir, "device-state.json"));
    const staleId = formatQualifiedId("zigbee", "0xaaa");
    harness.store.record(staleId, { state: "ON" }, { mode: "push", observedAt: 1 });

    harness.registry.start();
    await harness.aggregate.start();
    const unsubscribe = wireDeviceEvents(harness.aggregate, new EventBus(), harness.store);

    expect(harness.store.get(staleId)).toBeDefined();

    harness.mqttMock.emit("zigbee2mqtt/bridge/devices", [
      makeZigbeeDevice("other", "0xbbb"),
    ] as unknown as Record<string, unknown>);

    expect(harness.source.hasEnumerated).toBe(true);
    expect(harness.store.get(staleId)).toBeUndefined();
    expect(harness.store.get(formatQualifiedId("zigbee", "0xbbb"))).toBeDefined();

    unsubscribe();
    await harness.aggregate.stop();
    await harness.store.flush();
    await rm(dir, { recursive: true, force: true });
  });

  it("retains a record missing from a stale snapshot until the retained list includes it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ts-ha-bridge-readiness-stale-"));
    const registryPath = join(dir, "device-registry.json");
    await writeFile(
      registryPath,
      JSON.stringify({
        devices: { lamp_a: makeZigbeeDevice("lamp_a", "0xaaa") },
        states: {},
        groups: [],
      }),
      "utf-8",
    );

    const harness = createZigbeeHarness(join(dir, "device-state.json"), {
      persist: true,
      filePath: registryPath,
    });
    const idA = formatQualifiedId("zigbee", "0xaaa");
    const idB = formatQualifiedId("zigbee", "0xbbb");
    const storedStateB = { state: "OFF", brightness: 10 };
    const storedObservationB: DeviceObservation = {
      mode: "push",
      observedAt: Date.now() - 60_000,
    };
    harness.store.record(idA, { state: "ON" }, { mode: "push", observedAt: Date.now() - 120_000 });
    harness.store.record(idB, storedStateB, storedObservationB);

    await harness.registry.load();
    harness.registry.start();
    await harness.aggregate.start();
    const unsubscribe = wireDeviceEvents(harness.aggregate, new EventBus(), harness.store);

    // The snapshot predates B, so B is absent from the seed enumeration but not removed.
    expect(harness.source.hasEnumerated).toBe(false);
    expect(harness.store.get(idB)?.state).toEqual(storedStateB);

    harness.mqttMock.emit("zigbee2mqtt/bridge/devices", [
      makeZigbeeDevice("lamp_a", "0xaaa"),
      makeZigbeeDevice("lamp_b", "0xbbb"),
    ] as unknown as Record<string, unknown>);

    // The readiness flip must not prune B, which the retained list now enumerates.
    expect(harness.source.hasEnumerated).toBe(true);
    expect(harness.store.get(idB)?.state).toEqual(storedStateB);
    const descriptorB = harness.source.get("0xbbb");
    expect(descriptorB?.state).toEqual(storedStateB);
    expect(descriptorB?.observation).toEqual(storedObservationB);

    unsubscribe();
    await harness.aggregate.stop();
    await harness.store.flush();
    await rm(dir, { recursive: true, force: true });
  });

  it("registers every device in a bridge/devices payload before readiness flips", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ts-ha-bridge-readiness-multi-"));
    const harness = createZigbeeHarness(join(dir, "device-state.json"));
    const observedAt = Date.now() - 60_000;
    const storedRecords: Record<
      string,
      { state: Record<string, unknown>; observation: DeviceObservation }
    > = {
      "zigbee:0xaaa": {
        state: { state: "ON", brightness: 120 },
        observation: { mode: "push", observedAt },
      },
      "zigbee:0xbbb": {
        state: { state: "OFF", battery: 87 },
        observation: { mode: "push", observedAt },
      },
      "zigbee:0xccc": {
        state: { contact: true, battery: 64 },
        observation: { mode: "push", observedAt },
      },
    };
    for (const [qualifiedId, record] of Object.entries(storedRecords)) {
      harness.store.record(qualifiedId, record.state, record.observation);
    }

    harness.registry.start();
    await harness.aggregate.start();
    const unsubscribe = wireDeviceEvents(harness.aggregate, new EventBus(), harness.store);

    expect(harness.store.size).toBe(3);
    expect(harness.source.hasEnumerated).toBe(false);

    // Under the old ordering, the first device's notification reconciled against a
    // partial list and pruned the records of every device later in this payload.
    harness.mqttMock.emit("zigbee2mqtt/bridge/devices", [
      makeZigbeeDevice("lamp", "0xaaa"),
      makeZigbeeDevice("plug", "0xbbb"),
      makeZigbeeDevice("door", "0xccc"),
    ] as unknown as Record<string, unknown>);

    expect(harness.source.hasEnumerated).toBe(true);
    expect(harness.store.size).toBe(3);
    for (const [qualifiedId, record] of Object.entries(storedRecords)) {
      const descriptor = harness.aggregate.get(qualifiedId);
      expect(descriptor?.state).toEqual(record.state);
      expect(descriptor?.observation).toEqual(record.observation);
    }

    unsubscribe();
    await harness.aggregate.stop();
    await harness.store.flush();
    await rm(dir, { recursive: true, force: true });
  });

  it("prunes a removed device's record from a removal-only bridge/devices payload", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ts-ha-bridge-readiness-removal-"));
    const harness = createZigbeeHarness(join(dir, "device-state.json"));
    const keptId = formatQualifiedId("zigbee", "0xaaa");
    const removedId = formatQualifiedId("zigbee", "0xbbb");
    const observedAt = Date.now() - 60_000;
    harness.store.record(keptId, { state: "ON" }, { mode: "push", observedAt });
    harness.store.record(removedId, { state: "OFF" }, { mode: "push", observedAt });

    const bus = new EventBus();
    const events: StreamEvent[] = [];
    bus.subscribe((event) => events.push(event));

    harness.registry.start();
    await harness.aggregate.start();
    const unsubscribe = wireDeviceEvents(harness.aggregate, bus, harness.store);

    harness.mqttMock.emit("zigbee2mqtt/bridge/devices", [
      makeZigbeeDevice("lamp", "0xaaa"),
      makeZigbeeDevice("plug", "0xbbb"),
    ] as unknown as Record<string, unknown>);
    expect(harness.store.get(removedId)).toBeDefined();

    // The second payload drops a device without adding one, so no descriptor
    // notification drives the reconcile — only the applied-list signal does.
    harness.mqttMock.emit("zigbee2mqtt/bridge/devices", [
      makeZigbeeDevice("lamp", "0xaaa"),
    ] as unknown as Record<string, unknown>);

    expect(harness.registry.hasDevice("plug")).toBe(false);
    expect(harness.store.get(removedId)).toBeUndefined();
    // The still-present device must not be collateral damage of the removal sweep.
    expect(harness.store.get(keptId)).toBeDefined();
    expect(
      events
        .filter((event) => event.category === "device_disappeared")
        .map((event) => (event as { qualifiedId: string }).qualifiedId),
    ).toEqual([removedId]);

    unsubscribe();
    await harness.aggregate.stop();
    await harness.store.flush();
    await rm(dir, { recursive: true, force: true });
  });

  it("prunes a dropped group's record from an applied bridge/groups payload", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ts-ha-bridge-readiness-group-"));
    const harness = createZigbeeHarness(join(dir, "device-state.json"));
    const groupId = formatQualifiedId("zigbee-group", "5");
    harness.store.record(
      groupId,
      { state: "ON" },
      { mode: "push", observedAt: Date.now() - 60_000 },
    );

    harness.registry.start();
    await harness.aggregate.start();
    const unsubscribe = wireDeviceEvents(harness.aggregate, new EventBus(), harness.store);

    harness.mqttMock.emit("zigbee2mqtt/bridge/groups", [makeGroup(5, "lamp")] as unknown as Record<
      string,
      unknown
    >);
    expect(harness.groupSource.hasEnumerated).toBe(true);
    expect(harness.store.get(groupId)).toBeDefined();

    // Dropping a group emits no member state change: only the applied-list signal can
    // reconcile it.
    harness.mqttMock.emit("zigbee2mqtt/bridge/groups", [] as unknown as Record<string, unknown>);

    expect(harness.registry.getGroup(5)).toBeUndefined();
    expect(harness.store.get(groupId)).toBeUndefined();

    unsubscribe();
    await harness.aggregate.stop();
    await harness.store.flush();
    await rm(dir, { recursive: true, force: true });
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
