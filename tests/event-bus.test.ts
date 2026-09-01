import { describe, expect, it } from "bun:test";
import { EventBus, type StreamEvent } from "../src/core/events/event-bus.js";

describe("EventBus", () => {
  it("delivers a state category event with key, value, and previous", () => {
    const bus = new EventBus();
    const received: StreamEvent[] = [];
    bus.subscribe((e) => received.push(e));

    bus.emit({ category: "state", key: "night_mode", value: true, previous: false });

    expect(received).toEqual([
      { category: "state", key: "night_mode", value: true, previous: false },
    ]);
  });

  it("delivers a log category event carrying the entry", () => {
    const bus = new EventBus();
    const received: StreamEvent[] = [];
    bus.subscribe((e) => received.push(e));

    const entry = { level: 30, time: Date.now(), msg: "hello" };
    bus.emit({ category: "log", entry });

    expect(received).toEqual([{ category: "log", entry }]);
  });

  it("delivers an automation category event with name and enabled", () => {
    const bus = new EventBus();
    const received: StreamEvent[] = [];
    bus.subscribe((e) => received.push(e));

    bus.emit({ category: "automation", name: "motion-light", enabled: false });

    expect(received).toEqual([{ category: "automation", name: "motion-light", enabled: false }]);
  });

  it("delivers a readiness category event", () => {
    const bus = new EventBus();
    const received: StreamEvent[] = [];
    bus.subscribe((e) => received.push(e));

    bus.emit({ category: "readiness", ready: true });

    expect(received).toEqual([{ category: "readiness", ready: true }]);
  });

  it("delivers a fell_behind category event", () => {
    const bus = new EventBus();
    const received: StreamEvent[] = [];
    bus.subscribe((e) => received.push(e));

    bus.emit({ category: "fell_behind" });

    expect(received).toEqual([{ category: "fell_behind" }]);
  });

  it("delivers a device_state category event with qualified id, changed properties, and observation", () => {
    const bus = new EventBus();
    const received: StreamEvent[] = [];
    bus.subscribe((e) => received.push(e));

    bus.emit({
      category: "device_state",
      qualifiedId: "zigbee:0xaaa",
      properties: { on: true },
      observation: { mode: "push", observedAt: 1000 },
    });

    expect(received).toEqual([
      {
        category: "device_state",
        qualifiedId: "zigbee:0xaaa",
        properties: { on: true },
        observation: { mode: "push", observedAt: 1000 },
      },
    ]);
  });

  it("delivers a device_reachability category event", () => {
    const bus = new EventBus();
    const received: StreamEvent[] = [];
    bus.subscribe((e) => received.push(e));

    bus.emit({ category: "device_reachability", qualifiedId: "shelly:plug", reachable: false });

    expect(received).toEqual([
      { category: "device_reachability", qualifiedId: "shelly:plug", reachable: false },
    ]);
  });

  it("delivers a device_appeared category event carrying the full descriptor", () => {
    const bus = new EventBus();
    const received: StreamEvent[] = [];
    bus.subscribe((e) => received.push(e));

    const device = {
      source: "shelly",
      id: "plug",
      qualifiedId: "shelly:plug",
      displayName: "plug",
      state: { on: false },
      capabilities: [],
      reachable: true,
      observation: { mode: "push" as const, observedAt: 1000 },
      hidden: false,
    };
    bus.emit({ category: "device_appeared", device });

    expect(received).toEqual([{ category: "device_appeared", device }]);
  });

  it("delivers a device_disappeared category event", () => {
    const bus = new EventBus();
    const received: StreamEvent[] = [];
    bus.subscribe((e) => received.push(e));

    bus.emit({ category: "device_disappeared", qualifiedId: "zigbee:0xaaa" });

    expect(received).toEqual([{ category: "device_disappeared", qualifiedId: "zigbee:0xaaa" }]);
  });

  it("delivers an automation_execution category event with automation, trigger, duration, and outcome", () => {
    const bus = new EventBus();
    const received: StreamEvent[] = [];
    bus.subscribe((e) => received.push(e));

    const trigger = { type: "cron" as const, expression: "0 7 * * *", firedAt: new Date(0) };
    bus.emit({
      category: "automation_execution",
      automation: "motion-light",
      trigger,
      durationMs: 12,
      outcome: "success",
    });

    expect(received).toEqual([
      {
        category: "automation_execution",
        automation: "motion-light",
        trigger,
        durationMs: 12,
        outcome: "success",
      },
    ]);
  });

  it("delivers a room category event with the room's current definition", () => {
    const bus = new EventBus();
    const received: StreamEvent[] = [];
    bus.subscribe((e) => received.push(e));

    bus.emit({ category: "room", id: "room-1", room: { id: "room-1", name: "Kitchen" } });

    expect(received).toEqual([
      { category: "room", id: "room-1", room: { id: "room-1", name: "Kitchen" } },
    ]);
  });

  it("delivers a room category event with room: null for a deletion", () => {
    const bus = new EventBus();
    const received: StreamEvent[] = [];
    bus.subscribe((e) => received.push(e));

    bus.emit({ category: "room", id: "room-1", room: null });

    expect(received).toEqual([{ category: "room", id: "room-1", room: null }]);
  });

  it("delivers a room_membership category event as a delta for one device", () => {
    const bus = new EventBus();
    const received: StreamEvent[] = [];
    bus.subscribe((e) => received.push(e));

    bus.emit({ category: "room_membership", qualifiedId: "zigbee:0xaaa", roomId: "room-1" });

    expect(received).toEqual([
      { category: "room_membership", qualifiedId: "zigbee:0xaaa", roomId: "room-1" },
    ]);
  });

  it("delivers a room_membership category event with roomId: null for an unassignment", () => {
    const bus = new EventBus();
    const received: StreamEvent[] = [];
    bus.subscribe((e) => received.push(e));

    bus.emit({ category: "room_membership", qualifiedId: "zigbee:0xaaa", roomId: null });

    expect(received).toEqual([
      { category: "room_membership", qualifiedId: "zigbee:0xaaa", roomId: null },
    ]);
  });

  it("delivers a device_visibility category event naming the device and its new visibility", () => {
    const bus = new EventBus();
    const received: StreamEvent[] = [];
    bus.subscribe((e) => received.push(e));

    bus.emit({ category: "device_visibility", qualifiedId: "zigbee:0xaaa", hidden: true });

    expect(received).toEqual([
      { category: "device_visibility", qualifiedId: "zigbee:0xaaa", hidden: true },
    ]);
  });

  it("fans out one event to every subscriber", () => {
    const bus = new EventBus();
    const a: StreamEvent[] = [];
    const b: StreamEvent[] = [];
    bus.subscribe((e) => a.push(e));
    bus.subscribe((e) => b.push(e));

    bus.emit({ category: "readiness", ready: false });

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it("stops delivering to an unsubscribed listener", () => {
    const bus = new EventBus();
    const received: StreamEvent[] = [];
    const unsubscribe = bus.subscribe((e) => received.push(e));

    unsubscribe();
    bus.emit({ category: "readiness", ready: true });

    expect(received).toHaveLength(0);
  });

  it("a throwing subscriber does not prevent delivery to the others", () => {
    const bus = new EventBus();
    const received: StreamEvent[] = [];
    bus.subscribe(() => {
      throw new Error("boom");
    });
    bus.subscribe((e) => received.push(e));

    expect(() => bus.emit({ category: "readiness", ready: true })).not.toThrow();
    expect(received).toHaveLength(1);
  });
});
