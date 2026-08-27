import { describe, expect, it, mock } from "bun:test";
import pino from "pino";
import { AggregateDeviceSource } from "../src/core/device-sources/aggregate.js";
import { wireDeviceEvents } from "../src/core/device-sources/device-event-bridge.js";
import type {
  DeviceChangeListener,
  DeviceCommandOutcome,
  DeviceDescriptor,
} from "../src/core/device-sources/device-source.js";
import { formatQualifiedId } from "../src/core/device-sources/qualified-id.js";
import { EventBus, type StreamEvent } from "../src/core/events/event-bus.js";

const logger = pino({ level: "silent" });

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
    ...overrides,
  };
}

describe("wireDeviceEvents", () => {
  it("emits device_appeared for a device notified for the first time", async () => {
    const fake = makeFakeSource("zigbee");
    const aggregate = new AggregateDeviceSource([fake], logger);
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
    const aggregate = new AggregateDeviceSource([fake], logger);
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
    const aggregate = new AggregateDeviceSource([fake], logger);
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
    const aggregate = new AggregateDeviceSource([fake], logger);
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
    const aggregate = new AggregateDeviceSource([fake], logger);
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
    const aggregate = new AggregateDeviceSource([fakeA, fakeB], logger);
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

  it("flows events from a push-backed change and a polled change alike (task 7.5)", async () => {
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
    const aggregate = new AggregateDeviceSource([pushSource, polledSource], logger);
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
    const aggregate = new AggregateDeviceSource([fake], logger);
    const bus = new EventBus();
    const events: StreamEvent[] = [];
    bus.subscribe((e) => events.push(e));

    const unsubscribe = wireDeviceEvents(aggregate, bus);
    unsubscribe();
    fake.emit(makeDescriptor("zigbee", "0xaaa"));

    expect(events).toHaveLength(0);
  });
});
