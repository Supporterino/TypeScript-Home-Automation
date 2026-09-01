import { beforeEach, describe, expect, it, mock } from "bun:test";
import pino from "pino";
import type { Config } from "../src/config.js";
import { formatQualifiedId } from "../src/core/device-sources/qualified-id.js";
import { ZigbeeDeviceSource } from "../src/core/device-sources/zigbee-source.js";
import type { MqttMessageHandler, MqttService } from "../src/core/mqtt/mqtt-service.js";
import { DeviceRegistry } from "../src/core/zigbee/device-registry.js";
import type { ZigbeeDevice } from "../src/types/zigbee/bridge.js";

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
};

function makeDevice(
  friendlyName: string,
  ieee: string,
  exposes: ZigbeeDevice["definition"]["exposes"] = [],
): ZigbeeDevice {
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
      exposes,
      options: [],
    },
  };
}

/**
 * A raw Zigbee2MQTT `binary` expose for the `state` property, in the shape
 * `DeviceRegistry.mapExposes()` expects on the wire — not the already-mapped
 * `Capability` vocabulary, which the registry derives from this itself.
 */
const STATE_EXPOSE = {
  type: "binary",
  name: "state",
  property: "state",
  access: 3, // published (1) + set (2)
  value_on: "ON",
  value_off: "OFF",
};

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

describe("ZigbeeDeviceSource", () => {
  let mqttMock: ReturnType<typeof createMockMqtt>;
  let registry: DeviceRegistry;
  let source: ZigbeeDeviceSource;

  beforeEach(() => {
    mqttMock = createMockMqtt();
    registry = new DeviceRegistry(mqttMock.mqtt, config, logger);
    registry.start();
    source = new ZigbeeDeviceSource(registry, mqttMock.mqtt, logger);
  });

  it("reports available when a registry is present", () => {
    expect(source.available).toBe(true);
  });

  it("reports unavailable and yields no devices when the registry is null", () => {
    const disabled = new ZigbeeDeviceSource(null, mqttMock.mqtt, logger);
    expect(disabled.available).toBe(false);
    expect(disabled.list()).toEqual([]);
  });

  it("enumerates devices from the registry, each carrying a qualified id", () => {
    mqttMock.emit("zigbee2mqtt/bridge/devices", [makeDevice("lamp", "0xaaa")] as unknown as Record<
      string,
      unknown
    >);
    source.start();

    const devices = source.list();
    expect(devices).toHaveLength(1);
    expect(devices[0].source).toBe("zigbee");
    expect(devices[0].id).toBe("0xaaa");
    expect(devices[0].qualifiedId).toBe(formatQualifiedId("zigbee", "0xaaa"));
    expect(devices[0].displayName).toBe("lamp");
    expect(devices[0].observation.mode).toBe("push");
  });

  it("preserves a binary expose's declared on/off encoding end-to-end (design.md D1/D2)", () => {
    mqttMock.emit("zigbee2mqtt/bridge/devices", [
      makeDevice("lamp", "0xaaa", [STATE_EXPOSE]),
    ] as unknown as Record<string, unknown>);
    source.start();

    const device = source.get("0xaaa");
    const [capability] = device?.capabilities ?? [];
    expect(capability?.property).toBe("state");
    expect(capability?.valueOn).toBe("ON");
    expect(capability?.valueOff).toBe("OFF");
  });

  it("preserves stable identity across a rename", () => {
    mqttMock.emit("zigbee2mqtt/bridge/devices", [makeDevice("lamp", "0xaaa")] as unknown as Record<
      string,
      unknown
    >);
    source.start();
    const before = source.get("0xaaa");
    expect(before?.displayName).toBe("lamp");

    // Zigbee2MQTT reports a rename via a fresh bridge/devices payload.
    mqttMock.emit("zigbee2mqtt/bridge/devices", [
      makeDevice("kitchen_lamp", "0xaaa"),
    ] as unknown as Record<string, unknown>);

    const after = source.get("0xaaa");
    expect(after?.id).toBe("0xaaa");
    expect(after?.displayName).toBe("kitchen_lamp");
  });

  it("dispatches a command by publishing to the device's current friendly name", async () => {
    mqttMock.emit("zigbee2mqtt/bridge/devices", [
      makeDevice("lamp", "0xaaa", [STATE_EXPOSE]),
    ] as unknown as Record<string, unknown>);
    source.start();

    const outcome = await source.command("0xaaa", { state: "ON" });
    expect(outcome).toEqual({ status: "ok" });
    expect(mqttMock.publishToDeviceCalls).toEqual([
      { friendlyName: "lamp", payload: { state: "ON" } },
    ]);
  });

  it("rejects a command naming an unknown property without publishing", async () => {
    mqttMock.emit("zigbee2mqtt/bridge/devices", [
      makeDevice("lamp", "0xaaa", [STATE_EXPOSE]),
    ] as unknown as Record<string, unknown>);
    source.start();

    const outcome = await source.command("0xaaa", { brightness: 100 });
    expect(outcome.status).toBe("invalid");
    expect(mqttMock.publishToDeviceCalls).toEqual([]);
  });

  it("returns not_found for an unknown device id", async () => {
    source.start();
    const outcome = await source.command("0xunknown", {});
    expect(outcome).toEqual({ status: "not_found" });
  });

  it("returns unavailable for a command when the registry is disabled", async () => {
    const disabled = new ZigbeeDeviceSource(null, mqttMock.mqtt, logger);
    const outcome = await disabled.command("0xaaa", {});
    expect(outcome).toEqual({ status: "unavailable" });
  });

  it("notifies subscribers on a device state change without a restart", () => {
    mqttMock.emit("zigbee2mqtt/bridge/devices", [makeDevice("lamp", "0xaaa")] as unknown as Record<
      string,
      unknown
    >);
    source.start();

    const seen: string[] = [];
    source.subscribe((descriptor) => seen.push(descriptor.displayName));

    mqttMock.emit("zigbee2mqtt/lamp", { state: "ON" });

    expect(seen).toContain("lamp");
  });

  it("notifies subscribers when a new device joins without a restart", () => {
    source.start();
    const seen: string[] = [];
    source.subscribe((descriptor) => seen.push(descriptor.id));

    mqttMock.emit("zigbee2mqtt/bridge/devices", [makeDevice("lamp", "0xaaa")] as unknown as Record<
      string,
      unknown
    >);

    expect(seen).toContain("0xaaa");
    expect(source.list()).toHaveLength(1);
  });

  it("stop() releases listeners so no further notifications are delivered", () => {
    mqttMock.emit("zigbee2mqtt/bridge/devices", [makeDevice("lamp", "0xaaa")] as unknown as Record<
      string,
      unknown
    >);
    source.start();
    const seen: string[] = [];
    source.subscribe((descriptor) => seen.push(descriptor.displayName));

    source.stop();
    mqttMock.emit("zigbee2mqtt/lamp", { state: "ON" });

    expect(seen).toHaveLength(0);
  });
});
