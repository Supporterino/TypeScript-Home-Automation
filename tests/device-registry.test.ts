import { beforeEach, describe, expect, it, mock } from "bun:test";
import pino from "pino";
import type { Config } from "../src/config.js";
import type { MqttMessageHandler, MqttService } from "../src/core/mqtt/mqtt-service.js";
import { DeviceRegistry } from "../src/core/zigbee/device-registry.js";
import type { ZigbeeDevice } from "../src/types/zigbee/bridge.js";

const logger = pino({ level: "silent" });

const config: Config = {
  mqtt: { host: "localhost", port: 1883 },
  zigbee2mqttPrefix: "zigbee2mqtt",
  logLevel: "info",
  state: { persist: false, filePath: "./state.json" },
  automations: { recursive: false },
  deviceRegistry: { enabled: true },
  httpServer: { port: 0, token: "", webUi: { enabled: false, path: "/status" } },
};

/** A minimal ZigbeeDevice fixture for tests. */
function makeDevice(friendlyName: string, type: ZigbeeDevice["type"] = "Router"): ZigbeeDevice {
  return {
    ieee_address: `0x${friendlyName}`,
    friendly_name: friendlyName,
    type,
    supported: true,
    disabled: false,
    interview_state: "SUCCESSFUL",
    definition: null,
  };
}

/** Create a mock MqttService that captures all subscribe/unsubscribe/publish calls. */
function createMockMqtt() {
  const subscriptions: { topic: string; handler: MqttMessageHandler }[] = [];
  const unsubscriptions: { topic: string; handler: MqttMessageHandler }[] = [];
  const publications: { topic: string; payload: Record<string, unknown> }[] = [];

  const mqtt = {
    subscribe: mock((topic: string, handler: MqttMessageHandler) => {
      subscriptions.push({ topic, handler });
    }),
    unsubscribe: mock((topic: string, handler: MqttMessageHandler) => {
      unsubscriptions.push({ topic, handler });
    }),
    publish: mock((topic: string, payload: Record<string, unknown>) => {
      publications.push({ topic, payload });
    }),
  } as unknown as MqttService;

  /** Helper: find and invoke a subscribed handler by exact topic. */
  function emit(topic: string, payload: Record<string, unknown>): void {
    for (const { topic: t, handler } of subscriptions) {
      if (t === topic) handler(topic, payload);
    }
  }

  return { mqtt, subscriptions, unsubscriptions, publications, emit };
}

describe("DeviceRegistry", () => {
  let registry: DeviceRegistry;
  let mqttMock: ReturnType<typeof createMockMqtt>;

  beforeEach(() => {
    mqttMock = createMockMqtt();
    registry = new DeviceRegistry(mqttMock.mqtt, config, logger);
  });

  // ---------------------------------------------------------------------------
  // start / stop
  // ---------------------------------------------------------------------------

  describe("start", () => {
    it("subscribes to bridge/devices and bridge/event topics", () => {
      registry.start();

      const topics = mqttMock.subscriptions.map((s) => s.topic);
      expect(topics).toContain("zigbee2mqtt/bridge/devices");
      expect(topics).toContain("zigbee2mqtt/bridge/event");
    });

    it("uses the configured zigbee2mqtt prefix", () => {
      const customConfig: Config = { ...config, zigbee2mqttPrefix: "myhome" };
      const reg = new DeviceRegistry(mqttMock.mqtt, customConfig, logger);
      reg.start();

      const topics = mqttMock.subscriptions.map((s) => s.topic);
      expect(topics).toContain("myhome/bridge/devices");
      expect(topics).toContain("myhome/bridge/event");
    });
  });

  describe("stop", () => {
    it("unsubscribes bridge topics on stop", () => {
      registry.start();
      registry.stop();

      const unsubTopics = mqttMock.unsubscriptions.map((u) => u.topic);
      expect(unsubTopics).toContain("zigbee2mqtt/bridge/devices");
      expect(unsubTopics).toContain("zigbee2mqtt/bridge/event");
    });

    it("clears the device list on stop", () => {
      registry.start();
      mqttMock.emit("zigbee2mqtt/bridge/devices", [makeDevice("bulb")] as unknown as Record<
        string,
        unknown
      >);

      expect(registry.getDevices()).toHaveLength(1);
      registry.stop();
      expect(registry.getDevices()).toHaveLength(0);
    });

    it("unsubscribes per-device topics on stop", () => {
      registry.start();
      mqttMock.emit("zigbee2mqtt/bridge/devices", [makeDevice("bulb")] as unknown as Record<
        string,
        unknown
      >);

      registry.stop();

      const unsubTopics = mqttMock.unsubscriptions.map((u) => u.topic);
      expect(unsubTopics).toContain("zigbee2mqtt/bulb");
    });
  });

  // ---------------------------------------------------------------------------
  // Device discovery
  // ---------------------------------------------------------------------------

  describe("device discovery", () => {
    beforeEach(() => {
      registry.start();
    });

    it("populates devices from bridge/devices message", () => {
      mqttMock.emit("zigbee2mqtt/bridge/devices", [
        makeDevice("sensor"),
        makeDevice("bulb"),
      ] as unknown as Record<string, unknown>);

      expect(registry.getDevices()).toHaveLength(2);
    });

    it("getDevice returns the correct device", () => {
      mqttMock.emit("zigbee2mqtt/bridge/devices", [makeDevice("sensor")] as unknown as Record<
        string,
        unknown
      >);

      const device = registry.getDevice("sensor");
      expect(device?.friendly_name).toBe("sensor");
      expect(device?.ieee_address).toBe("0xsensor");
    });

    it("getDevice returns undefined for unknown device", () => {
      expect(registry.getDevice("ghost")).toBeUndefined();
    });

    it("hasDevice returns true for known device", () => {
      mqttMock.emit("zigbee2mqtt/bridge/devices", [makeDevice("sensor")] as unknown as Record<
        string,
        unknown
      >);

      expect(registry.hasDevice("sensor")).toBe(true);
    });

    it("hasDevice returns false for unknown device", () => {
      expect(registry.hasDevice("ghost")).toBe(false);
    });

    it("filters out Coordinator devices", () => {
      mqttMock.emit("zigbee2mqtt/bridge/devices", [
        makeDevice("sensor"),
        makeDevice("Coordinator", "Coordinator"),
      ] as unknown as Record<string, unknown>);

      expect(registry.getDevices()).toHaveLength(1);
      expect(registry.hasDevice("Coordinator")).toBe(false);
    });

    it("includes unsupported non-coordinator devices", () => {
      const unsupported: ZigbeeDevice = { ...makeDevice("mystery"), supported: false };
      mqttMock.emit("zigbee2mqtt/bridge/devices", [unsupported] as unknown as Record<
        string,
        unknown
      >);

      expect(registry.hasDevice("mystery")).toBe(true);
    });

    it("ignores a non-array bridge/devices payload", () => {
      mqttMock.emit("zigbee2mqtt/bridge/devices", { error: "not an array" });
      expect(registry.getDevices()).toHaveLength(0);
    });

    it("updates device definition on a second bridge/devices message", () => {
      const original = makeDevice("bulb");
      mqttMock.emit("zigbee2mqtt/bridge/devices", [original] as unknown as Record<string, unknown>);

      const updated: ZigbeeDevice = { ...original, supported: false };
      mqttMock.emit("zigbee2mqtt/bridge/devices", [updated] as unknown as Record<string, unknown>);

      expect(registry.getDevice("bulb")?.supported).toBe(false);
    });

    it("removes devices absent from the new bridge/devices list", () => {
      mqttMock.emit("zigbee2mqtt/bridge/devices", [
        makeDevice("sensor"),
        makeDevice("bulb"),
      ] as unknown as Record<string, unknown>);

      // Second message only contains sensor
      mqttMock.emit("zigbee2mqtt/bridge/devices", [makeDevice("sensor")] as unknown as Record<
        string,
        unknown
      >);

      expect(registry.hasDevice("sensor")).toBe(true);
      expect(registry.hasDevice("bulb")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Per-device subscriptions
  // ---------------------------------------------------------------------------

  describe("per-device subscriptions", () => {
    beforeEach(() => {
      registry.start();
    });

    it("subscribes to each device topic after discovery", () => {
      mqttMock.emit("zigbee2mqtt/bridge/devices", [
        makeDevice("bulb"),
        makeDevice("sensor"),
      ] as unknown as Record<string, unknown>);

      const topics = mqttMock.subscriptions.map((s) => s.topic);
      expect(topics).toContain("zigbee2mqtt/bulb");
      expect(topics).toContain("zigbee2mqtt/sensor");
    });

    it("unsubscribes from a device topic when the device is removed", () => {
      mqttMock.emit("zigbee2mqtt/bridge/devices", [
        makeDevice("bulb"),
        makeDevice("sensor"),
      ] as unknown as Record<string, unknown>);

      // Remove bulb from the list
      mqttMock.emit("zigbee2mqtt/bridge/devices", [makeDevice("sensor")] as unknown as Record<
        string,
        unknown
      >);

      const unsubTopics = mqttMock.unsubscriptions.map((u) => u.topic);
      expect(unsubTopics).toContain("zigbee2mqtt/bulb");
      expect(unsubTopics).not.toContain("zigbee2mqtt/sensor");
    });

    it("does not re-subscribe for an already-tracked device", () => {
      mqttMock.emit("zigbee2mqtt/bridge/devices", [makeDevice("bulb")] as unknown as Record<
        string,
        unknown
      >);
      mqttMock.emit("zigbee2mqtt/bridge/devices", [makeDevice("bulb")] as unknown as Record<
        string,
        unknown
      >);

      const deviceSubs = mqttMock.subscriptions.filter((s) => s.topic === "zigbee2mqtt/bulb");
      expect(deviceSubs).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // State tracking
  // ---------------------------------------------------------------------------

  describe("state tracking", () => {
    beforeEach(() => {
      registry.start();
      mqttMock.emit("zigbee2mqtt/bridge/devices", [makeDevice("bulb")] as unknown as Record<
        string,
        unknown
      >);
    });

    it("getDeviceState returns undefined before any message arrives", () => {
      expect(registry.getDeviceState("bulb")).toBeUndefined();
    });

    it("stores state from an incoming device message", () => {
      mqttMock.emit("zigbee2mqtt/bulb", { state: "ON", brightness: 200 });

      expect(registry.getDeviceState("bulb")).toEqual({ state: "ON", brightness: 200 });
    });

    it("merges partial state updates", () => {
      mqttMock.emit("zigbee2mqtt/bulb", { state: "ON", brightness: 200 });
      mqttMock.emit("zigbee2mqtt/bulb", { brightness: 100 });

      expect(registry.getDeviceState("bulb")).toEqual({ state: "ON", brightness: 100 });
    });

    it("clears state when device is removed", () => {
      mqttMock.emit("zigbee2mqtt/bulb", { state: "ON" });
      expect(registry.getDeviceState("bulb")).toBeDefined();

      // Remove bulb
      mqttMock.emit("zigbee2mqtt/bridge/devices", [] as unknown as Record<string, unknown>);

      expect(registry.getDeviceState("bulb")).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // State change listeners
  // ---------------------------------------------------------------------------

  describe("onDeviceStateChange / offDeviceStateChange", () => {
    beforeEach(() => {
      registry.start();
      mqttMock.emit("zigbee2mqtt/bridge/devices", [makeDevice("bulb")] as unknown as Record<
        string,
        unknown
      >);
    });

    it("fires the handler with merged state and previous state", () => {
      const handler = mock(
        (_state: Record<string, unknown>, _prev: Record<string, unknown> | undefined) => {},
      );
      registry.onDeviceStateChange("bulb", handler);

      mqttMock.emit("zigbee2mqtt/bulb", { state: "ON", brightness: 200 });

      expect(handler).toHaveBeenCalledTimes(1);
      const [newState, prevState] = (handler as ReturnType<typeof mock>).mock.calls[0] as [
        Record<string, unknown>,
        Record<string, unknown> | undefined,
      ];
      expect(newState).toEqual({ state: "ON", brightness: 200 });
      expect(prevState).toBeUndefined();
    });

    it("passes previous state on subsequent updates", () => {
      const handler = mock(
        (_state: Record<string, unknown>, _prev: Record<string, unknown> | undefined) => {},
      );
      registry.onDeviceStateChange("bulb", handler);

      mqttMock.emit("zigbee2mqtt/bulb", { state: "ON" });
      mqttMock.emit("zigbee2mqtt/bulb", { brightness: 50 });

      expect(handler).toHaveBeenCalledTimes(2);
      const [, prevState] = (handler as ReturnType<typeof mock>).mock.calls[1] as [
        Record<string, unknown>,
        Record<string, unknown> | undefined,
      ];
      expect(prevState).toEqual({ state: "ON" });
    });

    it("does not fire handler for a different device", () => {
      mqttMock.emit("zigbee2mqtt/bridge/devices", [
        makeDevice("bulb"),
        makeDevice("sensor"),
      ] as unknown as Record<string, unknown>);

      const handler = mock(() => {});
      registry.onDeviceStateChange("sensor", handler);

      mqttMock.emit("zigbee2mqtt/bulb", { state: "ON" });

      expect(handler).not.toHaveBeenCalled();
    });

    it("stops firing after offDeviceStateChange", () => {
      const handler = mock(() => {});
      registry.onDeviceStateChange("bulb", handler);
      registry.offDeviceStateChange("bulb", handler);

      mqttMock.emit("zigbee2mqtt/bulb", { state: "ON" });

      expect(handler).not.toHaveBeenCalled();
    });

    it("isolates errors in handlers — other handlers still fire", () => {
      const bad = mock(() => {
        throw new Error("boom");
      });
      const good = mock(() => {});
      registry.onDeviceStateChange("bulb", bad);
      registry.onDeviceStateChange("bulb", good);

      mqttMock.emit("zigbee2mqtt/bulb", { state: "ON" });

      expect(good).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Device list change listeners
  // ---------------------------------------------------------------------------

  describe("onDeviceAdded / onDeviceRemoved", () => {
    beforeEach(() => {
      registry.start();
    });

    it("fires onDeviceAdded when a new device appears", () => {
      const handler = mock((_device: ZigbeeDevice) => {});
      registry.onDeviceAdded(handler);

      mqttMock.emit("zigbee2mqtt/bridge/devices", [makeDevice("bulb")] as unknown as Record<
        string,
        unknown
      >);

      expect(handler).toHaveBeenCalledTimes(1);
      const [device] = (handler as ReturnType<typeof mock>).mock.calls[0] as [ZigbeeDevice];
      expect(device.friendly_name).toBe("bulb");
    });

    it("does not fire onDeviceAdded for an already-tracked device", () => {
      const handler = mock((_device: ZigbeeDevice) => {});
      registry.onDeviceAdded(handler);

      mqttMock.emit("zigbee2mqtt/bridge/devices", [makeDevice("bulb")] as unknown as Record<
        string,
        unknown
      >);
      // Same device again
      mqttMock.emit("zigbee2mqtt/bridge/devices", [makeDevice("bulb")] as unknown as Record<
        string,
        unknown
      >);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("stops firing after offDeviceAdded", () => {
      const handler = mock((_device: ZigbeeDevice) => {});
      registry.onDeviceAdded(handler);
      registry.offDeviceAdded(handler);

      mqttMock.emit("zigbee2mqtt/bridge/devices", [makeDevice("bulb")] as unknown as Record<
        string,
        unknown
      >);

      expect(handler).not.toHaveBeenCalled();
    });

    it("fires onDeviceRemoved when a device leaves the list", () => {
      const handler = mock((_device: ZigbeeDevice) => {});
      registry.onDeviceRemoved(handler);

      mqttMock.emit("zigbee2mqtt/bridge/devices", [makeDevice("bulb")] as unknown as Record<
        string,
        unknown
      >);
      // Bulb removed
      mqttMock.emit("zigbee2mqtt/bridge/devices", [] as unknown as Record<string, unknown>);

      expect(handler).toHaveBeenCalledTimes(1);
      const [device] = (handler as ReturnType<typeof mock>).mock.calls[0] as [ZigbeeDevice];
      expect(device.friendly_name).toBe("bulb");
    });

    it("stops firing after offDeviceRemoved", () => {
      const handler = mock((_device: ZigbeeDevice) => {});
      registry.onDeviceRemoved(handler);
      registry.offDeviceRemoved(handler);

      mqttMock.emit("zigbee2mqtt/bridge/devices", [makeDevice("bulb")] as unknown as Record<
        string,
        unknown
      >);
      mqttMock.emit("zigbee2mqtt/bridge/devices", [] as unknown as Record<string, unknown>);

      expect(handler).not.toHaveBeenCalled();
    });

    it("isolates errors in onDeviceAdded handlers", () => {
      const bad = mock(() => {
        throw new Error("boom");
      });
      const good = mock(() => {});
      registry.onDeviceAdded(bad);
      registry.onDeviceAdded(good);

      mqttMock.emit("zigbee2mqtt/bridge/devices", [makeDevice("bulb")] as unknown as Record<
        string,
        unknown
      >);

      expect(good).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Bridge event handling (join / leave)
  // ---------------------------------------------------------------------------

  describe("bridge/event handling", () => {
    beforeEach(() => {
      registry.start();
    });

    it("publishes a bridge/request/devices message on device_joined", () => {
      mqttMock.emit("zigbee2mqtt/bridge/event", {
        type: "device_joined",
        data: { friendly_name: "new_device", ieee_address: "0xabc" },
      });

      expect(mqttMock.publications).toHaveLength(1);
      expect(mqttMock.publications[0]?.topic).toBe("zigbee2mqtt/bridge/request/devices");
    });

    it("publishes a bridge/request/devices message on device_leave", () => {
      mqttMock.emit("zigbee2mqtt/bridge/devices", [makeDevice("bulb")] as unknown as Record<
        string,
        unknown
      >);

      mqttMock.emit("zigbee2mqtt/bridge/event", {
        type: "device_leave",
        data: { friendly_name: "bulb", ieee_address: "0xbulb" },
      });

      expect(
        mqttMock.publications.some((p) => p.topic === "zigbee2mqtt/bridge/request/devices"),
      ).toBe(true);
    });

    it("does not publish for other event types (device_announce)", () => {
      mqttMock.emit("zigbee2mqtt/bridge/event", {
        type: "device_announce",
        data: { friendly_name: "bulb", ieee_address: "0xbulb" },
      });

      expect(mqttMock.publications).toHaveLength(0);
    });
  });
});
