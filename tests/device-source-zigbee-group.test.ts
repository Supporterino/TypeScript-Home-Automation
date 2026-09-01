import { beforeEach, describe, expect, it, mock } from "bun:test";
import pino from "pino";
import type { Config } from "../src/config.js";
import { formatQualifiedId } from "../src/core/device-sources/qualified-id.js";
import {
  deriveGroupState,
  intersectCapabilities,
  ZigbeeGroupDeviceSource,
} from "../src/core/device-sources/zigbee-group-source.js";
import { ZIGBEE_SOURCE_ID } from "../src/core/device-sources/zigbee-source.js";
import type { MqttMessageHandler, MqttService } from "../src/core/mqtt/mqtt-service.js";
import { DeviceRegistry } from "../src/core/zigbee/device-registry.js";
import type { Capability } from "../src/types/capabilities.js";
import type { ZigbeeDevice, ZigbeeGroup } from "../src/types/zigbee/bridge.js";

const logger = pino({ level: "silent" });

const config: Config = {
  mqtt: { host: "localhost", port: 1883, username: "", password: "", shellyRpcSrc: "test" },
  zigbee2mqttPrefix: "zigbee2mqtt",
  logLevel: "info",
  state: { persist: false, filePath: "./state.json", flushIntervalMs: 1000 },
  automations: { recursive: false },
  deviceRegistry: { enabled: true, persist: false, filePath: "./device-registry.json" },
  devices: { shellyPollMs: 10000, nanoleafPollMs: 10000 },
  httpServer: { port: 0, token: "", webUi: { enabled: false, path: "/status" } },
  services: {},
} as unknown as Config;

const ON_OFF: Capability = {
  kind: "binary",
  property: "state",
  access: { readable: true, writable: true },
  valueType: "boolean",
  valueOn: "ON",
  valueOff: "OFF",
};

const BRIGHTNESS: Capability = {
  kind: "numeric",
  property: "brightness",
  access: { readable: true, writable: true },
  valueType: "numeric",
  range: { min: 0, max: 254 },
};

const COLOR: Capability = {
  kind: "numeric",
  property: "color_temp",
  access: { readable: true, writable: true },
  valueType: "numeric",
  range: { min: 150, max: 500 },
};

/**
 * Raw Zigbee2MQTT `exposes` fixtures — the wire shape `DeviceRegistry`
 * maps into the `Capability` vocabulary on arrival, matching
 * `STATE_EXPOSE` in `tests/device-source-zigbee.test.ts`.
 */
const RAW_ON_OFF = {
  type: "binary",
  name: "state",
  property: "state",
  access: 3, // published (1) + set (2)
  value_on: "ON",
  value_off: "OFF",
};

const RAW_BRIGHTNESS = {
  type: "numeric",
  name: "brightness",
  property: "brightness",
  access: 7,
  value_min: 0,
  value_max: 254,
};

function makeDevice(friendlyName: string, ieee: string, rawExposes: unknown[] = []): ZigbeeDevice {
  return {
    ieee_address: ieee,
    friendly_name: friendlyName,
    type: "Router",
    supported: true,
    disabled: false,
    interview_state: "SUCCESSFUL",
    definition: {
      model: "TEST-01",
      vendor: "TestCo",
      description: "Test device",
      source: "native",
      exposes: rawExposes,
      options: [],
    },
  } as unknown as ZigbeeDevice;
}

function makeGroup(
  id: number,
  friendlyName: string,
  members: { ieee_address: string; endpoint: number }[],
): ZigbeeGroup {
  return { id, friendly_name: friendlyName, members };
}

function createMockMqtt() {
  const subscriptions: { topic: string; handler: MqttMessageHandler }[] = [];
  const publishToDeviceCalls: { friendlyName: string; payload: Record<string, unknown> }[] = [];

  const mqtt = {
    subscribe: mock((topic: string, handler: MqttMessageHandler) => {
      subscriptions.push({ topic, handler });
    }),
    unsubscribe: mock(() => {}),
    publish: mock(() => {}),
    publishToDevice: mock((friendlyName: string, payload: Record<string, unknown>) => {
      publishToDeviceCalls.push({ friendlyName, payload });
    }),
  } as unknown as MqttService;

  function emit(topic: string, payload: Record<string, unknown>): void {
    for (const { topic: t, handler } of subscriptions) {
      if (t === topic) handler(topic, payload);
    }
  }

  return { mqtt, emit, publishToDeviceCalls };
}

// ---------------------------------------------------------------------------
// Pure functions: capability intersection (task 2.1)
// ---------------------------------------------------------------------------

describe("intersectCapabilities", () => {
  it("yields the same capabilities for identical members", () => {
    const result = intersectCapabilities([
      [ON_OFF, BRIGHTNESS],
      [ON_OFF, BRIGHTNESS],
      [ON_OFF, BRIGHTNESS],
    ]);
    expect(result.map((c) => c.property).sort()).toEqual(["brightness", "state"]);
  });

  it("drops a property only some members have", () => {
    const result = intersectCapabilities([
      [ON_OFF, BRIGHTNESS, COLOR],
      [ON_OFF, BRIGHTNESS, COLOR],
      [ON_OFF, BRIGHTNESS], // no colour
    ]);
    const properties = result.map((c) => c.property);
    expect(properties).toContain("state");
    expect(properties).toContain("brightness");
    expect(properties).not.toContain("color_temp");
  });

  it("narrows a numeric range to the intersection every member can satisfy", () => {
    const narrow: Capability = { ...BRIGHTNESS, range: { min: 10, max: 200 } };
    const result = intersectCapabilities([[BRIGHTNESS], [narrow]]);
    const brightness = result.find((c) => c.property === "brightness");
    expect(brightness?.range).toEqual({ min: 10, max: 200 });
  });

  it("drops a property whose range intersection is empty", () => {
    const lowRange: Capability = { ...BRIGHTNESS, range: { min: 0, max: 50 } };
    const highRange: Capability = { ...BRIGHTNESS, range: { min: 100, max: 254 } };
    const result = intersectCapabilities([[lowRange], [highRange]]);
    expect(result.find((c) => c.property === "brightness")).toBeUndefined();
  });

  it("yields an empty capability set when members share nothing", () => {
    const result = intersectCapabilities([[ON_OFF], [BRIGHTNESS]]);
    expect(result).toEqual([]);
  });

  it("returns an empty array for a group with no members", () => {
    expect(intersectCapabilities([])).toEqual([]);
  });

  it("drops a boolean property whose on/off encoding disagrees across members", () => {
    const other: Capability = { ...ON_OFF, valueOn: "on", valueOff: "off" };
    const result = intersectCapabilities([[ON_OFF], [other]]);
    expect(result.find((c) => c.property === "state")).toBeUndefined();
  });

  it("rebuilds the light container wrapping on/off and brightness — the shape HomeKit detection keys on", () => {
    const lightMember: Capability = {
      kind: "light",
      access: { readable: true, writable: true },
      valueType: "composite",
      features: [ON_OFF, BRIGHTNESS],
    };
    const result = intersectCapabilities([[lightMember], [lightMember]]);

    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe("light");
    expect(result[0]?.features?.map((f) => f.property).sort()).toEqual(["brightness", "state"]);
  });

  it("does not wrap a top-level scalar property (e.g. a sensor reading) in a container", () => {
    const battery: Capability = {
      kind: "numeric",
      property: "battery",
      access: { readable: true, writable: false },
      valueType: "numeric",
    };
    const result = intersectCapabilities([[battery], [battery]]);
    expect(result).toEqual([battery]);
  });
});

// ---------------------------------------------------------------------------
// Pure functions: state derivation (task 2.2)
// ---------------------------------------------------------------------------

describe("deriveGroupState", () => {
  const capabilities = [ON_OFF, BRIGHTNESS];

  it("reports on when any member is on", () => {
    const state = deriveGroupState(capabilities, [
      { state: "ON", brightness: 100 },
      { state: "OFF", brightness: 0 },
    ]);
    expect(state.state).toBe("ON");
  });

  it("reports off when every member is off", () => {
    const state = deriveGroupState(capabilities, [
      { state: "OFF", brightness: 0 },
      { state: "OFF", brightness: 0 },
    ]);
    expect(state.state).toBe("OFF");
  });

  it("averages brightness across members that are on, excluding off members", () => {
    const state = deriveGroupState(capabilities, [
      { state: "ON", brightness: 200 },
      { state: "ON", brightness: 100 },
      { state: "OFF", brightness: 254 },
    ]);
    expect(state.brightness).toBe(150);
  });

  it("omits a property no member reports", () => {
    const state = deriveGroupState(capabilities, [{ state: "ON" }]);
    expect(state).not.toHaveProperty("brightness");
  });
});

// ---------------------------------------------------------------------------
// ZigbeeGroupDeviceSource
// ---------------------------------------------------------------------------

describe("ZigbeeGroupDeviceSource", () => {
  let mqttMock: ReturnType<typeof createMockMqtt>;
  let registry: DeviceRegistry;
  let source: ZigbeeGroupDeviceSource;

  beforeEach(() => {
    mqttMock = createMockMqtt();
    registry = new DeviceRegistry(mqttMock.mqtt, config, logger);
    registry.start();
    source = new ZigbeeGroupDeviceSource(registry, mqttMock.mqtt, logger);
  });

  function seedMembers(): void {
    mqttMock.emit("zigbee2mqtt/bridge/devices", [
      makeDevice("bulb1", "0xa", [RAW_ON_OFF, RAW_BRIGHTNESS]),
      makeDevice("bulb2", "0xb", [RAW_ON_OFF, RAW_BRIGHTNESS]),
    ] as unknown as Record<string, unknown>);
  }

  function seedGroup(): void {
    mqttMock.emit("zigbee2mqtt/bridge/groups", [
      makeGroup(5, "lamp", [
        { ieee_address: "0xa", endpoint: 1 },
        { ieee_address: "0xb", endpoint: 1 },
      ]),
    ] as unknown as Record<string, unknown>);
  }

  it("reports available when a registry is present", () => {
    expect(source.available).toBe(true);
  });

  it("reports unavailable and yields no groups when the registry is null", () => {
    const disabled = new ZigbeeGroupDeviceSource(null, mqttMock.mqtt, logger);
    disabled.start();
    expect(disabled.available).toBe(false);
    expect(disabled.list()).toEqual([]);
  });

  it("qualifiedId is zigbee-group:<id> and survives a rename", () => {
    seedMembers();
    seedGroup();
    source.start();

    const before = source.get("5");
    expect(before?.qualifiedId).toBe(formatQualifiedId("zigbee-group", "5"));

    mqttMock.emit("zigbee2mqtt/bridge/groups", [
      makeGroup(5, "renamed_lamp", [
        { ieee_address: "0xa", endpoint: 1 },
        { ieee_address: "0xb", endpoint: 1 },
      ]),
    ] as unknown as Record<string, unknown>);

    const after = source.get("5");
    expect(after?.qualifiedId).toBe(formatQualifiedId("zigbee-group", "5"));
    expect(after?.displayName).toBe("renamed_lamp");
  });

  it("enumerates every tracked group", () => {
    seedMembers();
    mqttMock.emit("zigbee2mqtt/bridge/groups", [
      makeGroup(1, "a", []),
      makeGroup(2, "b", []),
    ] as unknown as Record<string, unknown>);
    source.start();

    expect(source.list()).toHaveLength(2);
  });

  it("returns undefined for an unknown group id", () => {
    source.start();
    expect(source.get("999")).toBeUndefined();
  });

  it("recomputes and notifies only the groups containing a changed member", () => {
    seedMembers();
    mqttMock.emit("zigbee2mqtt/bridge/devices", [
      makeDevice("bulb1", "0xa", [RAW_ON_OFF, RAW_BRIGHTNESS]),
      makeDevice("bulb2", "0xb", [RAW_ON_OFF, RAW_BRIGHTNESS]),
      makeDevice("bulb3", "0xc", [RAW_ON_OFF, RAW_BRIGHTNESS]),
    ] as unknown as Record<string, unknown>);
    mqttMock.emit("zigbee2mqtt/bridge/groups", [
      makeGroup(1, "group1", [{ ieee_address: "0xa", endpoint: 1 }]),
      makeGroup(2, "group2", [{ ieee_address: "0xc", endpoint: 1 }]),
    ] as unknown as Record<string, unknown>);
    source.start();

    const notified: string[] = [];
    source.subscribe((descriptor) => notified.push(descriptor.id));

    mqttMock.emit("zigbee2mqtt/bulb1", { state: "ON", brightness: 100 });

    expect(notified).toEqual(["1"]);
  });

  it("dispatches a group command with one publish to the group's friendly name", async () => {
    seedMembers();
    seedGroup();
    source.start();

    const outcome = await source.command("5", { state: "ON" });
    expect(outcome).toEqual({ status: "ok" });
    expect(mqttMock.publishToDeviceCalls).toEqual([
      { friendlyName: "lamp", payload: { state: "ON" } },
    ]);
  });

  it("rejects an undeclared property with nothing published", async () => {
    seedMembers();
    seedGroup();
    source.start();

    const outcome = await source.command("5", { color_temp: 300 });
    expect(outcome.status).toBe("invalid");
    expect(mqttMock.publishToDeviceCalls).toEqual([]);
  });

  it("does not optimistically write group state on command", async () => {
    seedMembers();
    seedGroup();
    source.start();

    await source.command("5", { state: "ON" });

    // Members have not reported anything yet — derived state has no `state` key.
    const descriptor = source.get("5");
    expect(descriptor?.state).not.toHaveProperty("state");
  });

  it("returns not_found for an unknown group id when commanding", async () => {
    source.start();
    const outcome = await source.command("999", {});
    expect(outcome).toEqual({ status: "not_found" });
  });

  it("returns unavailable for a command when the registry is disabled", async () => {
    const disabled = new ZigbeeGroupDeviceSource(null, mqttMock.mqtt, logger);
    const outcome = await disabled.command("5", {});
    expect(outcome).toEqual({ status: "unavailable" });
  });

  it("carries member qualified ids as metadata without altering member descriptors", () => {
    seedMembers();
    seedGroup();
    source.start();

    const group = source.get("5");
    expect(group?.memberQualifiedIds?.sort()).toEqual(
      [
        formatQualifiedId(ZIGBEE_SOURCE_ID, "0xa"),
        formatQualifiedId(ZIGBEE_SOURCE_ID, "0xb"),
      ].sort(),
    );
  });

  it("produces a light-shaped descriptor for a group of real Zigbee bulbs (task 4.4)", () => {
    const lightExpose = {
      type: "light",
      features: [RAW_ON_OFF, RAW_BRIGHTNESS],
    };
    mqttMock.emit("zigbee2mqtt/bridge/devices", [
      makeDevice("bulb1", "0xa", [lightExpose]),
      makeDevice("bulb2", "0xb", [lightExpose]),
    ] as unknown as Record<string, unknown>);
    seedGroup();
    source.start();

    const group = source.get("5");
    expect(group?.capabilities).toHaveLength(1);
    expect(group?.capabilities[0]?.kind).toBe("light");
    expect(group?.capabilities[0]?.features?.map((f) => f.property).sort()).toEqual([
      "brightness",
      "state",
    ]);
  });

  it("stop() releases listeners so no further notifications are delivered", () => {
    seedMembers();
    seedGroup();
    source.start();
    const seen: string[] = [];
    source.subscribe((descriptor) => seen.push(descriptor.id));

    source.stop();
    mqttMock.emit("zigbee2mqtt/bulb1", { state: "ON" });

    expect(seen).toHaveLength(0);
  });
});
