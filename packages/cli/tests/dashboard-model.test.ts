import { describe, expect, it } from "bun:test";
import type { DeviceDescriptor, StreamEvent } from "@ts-ha/shared";
import type { DashboardData } from "../src/components/types.js";
import {
  applyStreamEvent,
  createDeltaGate,
  energySummary,
  weatherSummary,
} from "../src/dashboard-model.js";

// The reducer is pure, so a synthetic event sequence drives it directly.

function descriptor(overrides: Partial<DeviceDescriptor> = {}): DeviceDescriptor {
  return {
    source: "zigbee",
    id: "0x1",
    qualifiedId: "zigbee:0x1",
    displayName: "Light",
    state: { state: "OFF" },
    capabilities: [],
    reachable: true,
    observation: { mode: "push", observedAt: 1 },
    hidden: false,
    ...overrides,
  };
}

function baseData(): DashboardData {
  return {
    readiness: {
      status: "not ready",
      checks: { mqtt: false, engine: false },
      startedAt: null,
      tz: null,
    },
    automations: { automations: [{ name: "a1", enabled: false, triggers: [] }], count: 1 },
    devices: { devices: [descriptor()], count: 1, sources: ["zigbee"] },
    rooms: { rooms: [], count: 0 },
    state: { state: { keep: 1 }, count: 1 },
    logs: { entries: [], count: 0 },
    homekit: null,
    energy: null,
    weather: null,
    error: null,
    lastRefresh: 0,
  };
}

describe("applyStreamEvent", () => {
  it("patches each streamed domain from a synthetic sequence", () => {
    const events: StreamEvent[] = [
      { category: "readiness", ready: true },
      { category: "automation", name: "a1", enabled: true },
      { category: "state", key: "new_key", value: true },
      { category: "log", entry: { level: 30, time: 5, msg: "hello" } },
      {
        category: "device_state",
        qualifiedId: "zigbee:0x1",
        properties: { state: "ON", brightness: 80 },
        observation: { mode: "push", observedAt: 9 },
      },
      { category: "device_reachability", qualifiedId: "zigbee:0x1", reachable: false },
      { category: "device_visibility", qualifiedId: "zigbee:0x1", hidden: true },
      {
        category: "device_appeared",
        device: descriptor({ id: "0x2", qualifiedId: "zigbee:0x2", displayName: "Sensor" }),
      },
    ];

    const result = events.reduce(applyStreamEvent, baseData());

    expect(result.readiness.status).toBe("ready");
    // The readiness event cannot say which sub-check moved, so `checks` are
    // left to the snapshot.
    expect(result.readiness.checks).toEqual({ mqtt: false, engine: false });
    expect(result.automations.automations[0].enabled).toBe(true);
    expect(result.state.state).toEqual({ keep: 1, new_key: true });
    expect(result.state.count).toBe(2);
    expect(result.logs.entries).toHaveLength(1);
    expect(result.logs.entries[0].msg).toBe("hello");
    expect(result.devices.devices[0].state).toEqual({ state: "ON", brightness: 80 });
    expect(result.devices.devices[0].observation.observedAt).toBe(9);
    expect(result.devices.devices[0].reachable).toBe(false);
    expect(result.devices.devices[0].hidden).toBe(true);
    expect(result.devices.count).toBe(2);
    expect(result.devices.devices.map((d) => d.qualifiedId)).toEqual(["zigbee:0x1", "zigbee:0x2"]);
  });

  it("removes a state key on an undefined value", () => {
    const result = applyStreamEvent(baseData(), {
      category: "state",
      key: "keep",
      value: undefined,
      previous: 1,
    });
    expect(result.state.state).toEqual({});
    expect(result.state.count).toBe(0);
  });

  it("removes a disappeared device", () => {
    const result = applyStreamEvent(baseData(), {
      category: "device_disappeared",
      qualifiedId: "zigbee:0x1",
    });
    expect(result.devices.devices).toHaveLength(0);
    expect(result.devices.count).toBe(0);
  });

  it("leaves state unchanged on fell_behind", () => {
    const data = baseData();
    expect(applyStreamEvent(data, { category: "fell_behind" })).toBe(data);
  });

  it("ignores wall events", () => {
    const data = baseData();
    expect(applyStreamEvent(data, { category: "wall", name: "hall", kind: "created" })).toBe(data);
  });

  it("ignores an unknown category without corrupting state", () => {
    const data = baseData();
    const unknown = { category: "future_category" } as unknown as StreamEvent;
    expect(() => applyStreamEvent(data, unknown)).not.toThrow();
    expect(applyStreamEvent(data, unknown)).toBe(data);
  });

  it("ignores a malformed log frame with no entry", () => {
    const data = baseData();
    const malformed = { category: "log" } as unknown as StreamEvent;
    expect(() => applyStreamEvent(data, malformed)).not.toThrow();
    expect(applyStreamEvent(data, malformed)).toBe(data);
  });

  it("adds, renames, and removes rooms from room events", () => {
    const added = applyStreamEvent(baseData(), {
      category: "room",
      id: "living",
      room: { id: "living", name: "Living Room" },
    });
    expect(added.rooms.rooms).toEqual([{ id: "living", name: "Living Room", members: [] }]);

    const renamed = applyStreamEvent(added, {
      category: "room",
      id: "living",
      room: { id: "living", name: "Lounge" },
    });
    expect(renamed.rooms.rooms[0].name).toBe("Lounge");

    const removed = applyStreamEvent(renamed, {
      category: "room",
      id: "living",
      room: null,
    });
    expect(removed.rooms.rooms).toHaveLength(0);
  });

  it("patches room membership from room_membership events", () => {
    const withRoom = applyStreamEvent(baseData(), {
      category: "room",
      id: "living",
      room: { id: "living", name: "Living Room" },
    });

    const assigned = applyStreamEvent(withRoom, {
      category: "room_membership",
      qualifiedId: "zigbee:0x1",
      roomId: "living",
    });
    expect(assigned.rooms.rooms[0].members).toEqual([
      {
        qualifiedId: "zigbee:0x1",
        available: true,
        device: assigned.devices.devices[0],
      },
    ]);

    const unassigned = applyStreamEvent(assigned, {
      category: "room_membership",
      qualifiedId: "zigbee:0x1",
      roomId: null,
    });
    expect(unassigned.rooms.rooms[0].members).toHaveLength(0);
  });

  it("is idempotent when a room_membership assignment is replayed", () => {
    const withRoom = applyStreamEvent(baseData(), {
      category: "room",
      id: "living",
      room: { id: "living", name: "Living Room" },
    });
    const assigned = applyStreamEvent(withRoom, {
      category: "room_membership",
      qualifiedId: "zigbee:0x1",
      roomId: "living",
    });

    const replayed = applyStreamEvent(assigned, {
      category: "room_membership",
      qualifiedId: "zigbee:0x1",
      roomId: "living",
    });

    expect(replayed.rooms.rooms[0].members).toEqual(assigned.rooms.rooms[0].members);
    expect(replayed).toBe(assigned);
  });

  it("is idempotent when a room_membership unassignment is replayed", () => {
    const withRoom = applyStreamEvent(baseData(), {
      category: "room",
      id: "living",
      room: { id: "living", name: "Living Room" },
    });
    const assigned = applyStreamEvent(withRoom, {
      category: "room_membership",
      qualifiedId: "zigbee:0x1",
      roomId: "living",
    });
    const unassigned = applyStreamEvent(assigned, {
      category: "room_membership",
      qualifiedId: "zigbee:0x1",
      roomId: null,
    });

    const replayed = applyStreamEvent(unassigned, {
      category: "room_membership",
      qualifiedId: "zigbee:0x1",
      roomId: null,
    });

    expect(replayed.rooms.rooms[0].members).toHaveLength(0);
    expect(replayed).toBe(unassigned);
  });
});

describe("energySummary", () => {
  it("returns null when energy is unavailable", () => {
    expect(energySummary(null)).toBeNull();
  });

  it("projects power, consumption, and device count", () => {
    expect(
      energySummary({
        powerWatts: 42,
        energyWh: 100,
        breakdown: [
          { qualifiedId: "shelly:tv", displayName: "TV", available: true },
          { qualifiedId: "shelly:x", displayName: "X", available: false },
        ],
        history: [],
      }),
    ).toEqual({ powerWatts: 42, energyWh: 100, deviceCount: 2 });
  });
});

describe("weatherSummary", () => {
  it("marks null weather as unavailable", () => {
    const summary = weatherSummary(null);
    expect(summary.available).toBe(false);
    expect(summary.message).toBe("Weather unavailable.");
  });

  it("carries the unavailable marker message", () => {
    const summary = weatherSummary({ available: false, reason: "service_unregistered" });
    expect(summary.available).toBe(false);
    expect(summary.message).toBe("Weather unavailable — no weather service is configured.");
  });

  it("projects current conditions and the forecast", () => {
    const summary = weatherSummary({
      location: { latitude: 48, longitude: 11 },
      current: {
        temperature: 18,
        feelsLike: 17,
        humidity: 60,
        pressure: 1013,
        condition: "clear",
        description: "clear sky",
        wind: { speed: 2, direction: 180 },
        cloudCover: 5,
        timestamp: 1,
      },
      forecast: [
        {
          date: "2026-05-01",
          tempHigh: 20,
          tempLow: 10,
          condition: "rain",
          description: "light rain",
          precipitationChance: 0.6,
          wind: { speed: 3, direction: 90 },
        },
      ],
    });

    expect(summary.available).toBe(true);
    expect(summary.message).toBe("clear sky");
    expect(summary.current?.temperature).toBe(18);
    expect(summary.forecast).toEqual([
      { date: "2026-05-01", tempLow: 10, tempHigh: 20, description: "light rain" },
    ]);
  });
});

describe("createDeltaGate", () => {
  it("replays a delta buffered before the snapshot resolves", () => {
    const gate = createDeltaGate();
    const snapshot = baseData();
    const delta: StreamEvent = { category: "readiness", ready: true };

    // The delta arrives while the snapshot is still in flight → buffered.
    expect(gate.accept(delta)).toEqual([]);

    // The snapshot resolves; the gate opens and replays the buffered delta.
    const replay = gate.open();
    expect(replay).toEqual([delta]);

    const final = replay.reduce(applyStreamEvent, snapshot);
    expect(final.readiness.status).toBe("ready");
    // `checks` are preserved from the snapshot, not derived from the event.
    expect(final.readiness.checks).toEqual({ mqtt: false, engine: false });
  });

  it("applies deltas immediately once open", () => {
    const gate = createDeltaGate();
    gate.open();

    const event: StreamEvent = { category: "automation", name: "a1", enabled: true };
    expect(gate.accept(event)).toEqual([event]);
  });

  it("re-buffers deltas after close (a re-snapshot began)", () => {
    const gate = createDeltaGate();
    gate.open();
    gate.close();

    const event: StreamEvent = { category: "readiness", ready: true };
    expect(gate.accept(event)).toEqual([]);
    expect(gate.open()).toEqual([event]);
  });

  it("does not duplicate a replayed log entry already in the snapshot", () => {
    const gate = createDeltaGate();
    const entry = { level: 30, time: 5, msg: "hello" };
    const snapshot: DashboardData = {
      ...baseData(),
      logs: { entries: [entry], count: 1 },
    };

    gate.accept({ category: "log", entry });
    const replay = gate.open();
    const final = replay.reduce(applyStreamEvent, snapshot);

    expect(final.logs.entries).toEqual([entry]);
  });
});
