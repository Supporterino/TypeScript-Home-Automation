import { beforeEach, describe, expect, it, mock } from "bun:test";
import pino from "pino";
import type { Config } from "../src/config.js";
import type { MqttMessageHandler, MqttService } from "../src/core/mqtt/mqtt-service.js";
import {
  type DeviceNiceNames,
  DeviceRegistry,
  type DeviceRegistryPersistenceOptions,
} from "../src/core/zigbee/device-registry.js";
import type { ZigbeeDevice, ZigbeeGroup } from "../src/types/zigbee/bridge.js";

const logger = pino({ level: "silent" });

const config: Config = {
  mqtt: { host: "localhost", port: 1883 },
  zigbee2mqttPrefix: "zigbee2mqtt",
  logLevel: "info",
  state: { persist: false, filePath: "./state.json" },
  automations: { recursive: false },
  deviceRegistry: { enabled: true, persist: false, filePath: "./device-registry.json" },
  httpServer: { port: 0, token: "", webUi: { enabled: false, path: "/status" } },
  services: {},
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

/**
 * A device fixture whose `definition.exposes` holds the *raw* Zigbee2MQTT
 * shape, exactly as it arrives over MQTT — before the registry maps it into
 * the capability vocabulary. Cast through `unknown` because `ZigbeeDevice`'s
 * type now declares the already-mapped shape (design.md D22).
 */
function makeDeviceWithRawExposes(friendlyName: string, rawExposes: unknown[]): ZigbeeDevice {
  return {
    ...makeDevice(friendlyName),
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

/** A minimal ZigbeeGroup fixture for tests. */
function makeGroup(
  id: number,
  friendlyName: string,
  members: { ieee_address: string; endpoint: number }[] = [],
): ZigbeeGroup {
  return { id, friendly_name: friendlyName, members };
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
    it("subscribes to bridge/devices, bridge/groups, and bridge/event topics", () => {
      registry.start();

      const topics = mqttMock.subscriptions.map((s) => s.topic);
      expect(topics).toContain("zigbee2mqtt/bridge/devices");
      expect(topics).toContain("zigbee2mqtt/bridge/groups");
      expect(topics).toContain("zigbee2mqtt/bridge/event");
    });

    it("uses the configured zigbee2mqtt prefix", () => {
      const customConfig: Config = { ...config, zigbee2mqttPrefix: "myhome" };
      const reg = new DeviceRegistry(mqttMock.mqtt, customConfig, logger);
      reg.start();

      const topics = mqttMock.subscriptions.map((s) => s.topic);
      expect(topics).toContain("myhome/bridge/devices");
      expect(topics).toContain("myhome/bridge/groups");
      expect(topics).toContain("myhome/bridge/event");
    });
  });

  describe("stop", () => {
    it("unsubscribes bridge topics on stop", () => {
      registry.start();
      registry.stop();

      const unsubTopics = mqttMock.unsubscriptions.map((u) => u.topic);
      expect(unsubTopics).toContain("zigbee2mqtt/bridge/devices");
      expect(unsubTopics).toContain("zigbee2mqtt/bridge/groups");
      expect(unsubTopics).toContain("zigbee2mqtt/bridge/event");
    });

    it("clears the group list on stop", () => {
      registry.start();
      mqttMock.emit("zigbee2mqtt/bridge/groups", [makeGroup(1, "lamp")] as unknown as Record<
        string,
        unknown
      >);

      expect(registry.getGroups()).toHaveLength(1);
      registry.stop();
      expect(registry.getGroups()).toHaveLength(0);
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
  // Group discovery (tasks 1.2-1.5; specs/zigbee-groups "Group Discovery")
  // ---------------------------------------------------------------------------

  describe("group discovery", () => {
    beforeEach(() => {
      registry.start();
    });

    it("tracks groups from a bridge/groups message", () => {
      mqttMock.emit("zigbee2mqtt/bridge/groups", [
        makeGroup(1, "lamp", [{ ieee_address: "0xa", endpoint: 1 }]),
        makeGroup(2, "fan"),
      ] as unknown as Record<string, unknown>);

      expect(registry.getGroups()).toHaveLength(2);
      expect(registry.getGroup(1)?.friendly_name).toBe("lamp");
      expect(registry.getGroup(2)?.friendly_name).toBe("fan");
    });

    it("getGroup returns undefined for an unknown id", () => {
      expect(registry.getGroup(99)).toBeUndefined();
    });

    it("removes a group absent from a new bridge/groups message", () => {
      mqttMock.emit("zigbee2mqtt/bridge/groups", [
        makeGroup(1, "lamp"),
        makeGroup(2, "fan"),
      ] as unknown as Record<string, unknown>);

      mqttMock.emit("zigbee2mqtt/bridge/groups", [makeGroup(1, "lamp")] as unknown as Record<
        string,
        unknown
      >);

      expect(registry.getGroups()).toHaveLength(1);
      expect(registry.getGroup(2)).toBeUndefined();
    });

    it("updates a group's members in place", () => {
      mqttMock.emit("zigbee2mqtt/bridge/groups", [
        makeGroup(1, "lamp", [{ ieee_address: "0xa", endpoint: 1 }]),
      ] as unknown as Record<string, unknown>);

      mqttMock.emit("zigbee2mqtt/bridge/groups", [
        makeGroup(1, "lamp", [
          { ieee_address: "0xa", endpoint: 1 },
          { ieee_address: "0xb", endpoint: 1 },
        ]),
      ] as unknown as Record<string, unknown>);

      expect(registry.getGroup(1)?.members).toHaveLength(2);
    });

    it("preserves identity across a friendly name rename", () => {
      mqttMock.emit("zigbee2mqtt/bridge/groups", [makeGroup(5, "old_name")] as unknown as Record<
        string,
        unknown
      >);
      mqttMock.emit("zigbee2mqtt/bridge/groups", [makeGroup(5, "new_name")] as unknown as Record<
        string,
        unknown
      >);

      expect(registry.getGroups()).toHaveLength(1);
      expect(registry.getGroup(5)?.friendly_name).toBe("new_name");
    });

    it("ignores a non-array bridge/groups payload, leaving tracked groups unchanged", () => {
      mqttMock.emit("zigbee2mqtt/bridge/groups", [makeGroup(1, "lamp")] as unknown as Record<
        string,
        unknown
      >);

      expect(() =>
        mqttMock.emit("zigbee2mqtt/bridge/groups", { error: "not an array" }),
      ).not.toThrow();

      expect(registry.getGroups()).toHaveLength(1);
    });

    it("skips a malformed group entry (non-numeric id) without throwing", () => {
      expect(() =>
        mqttMock.emit("zigbee2mqtt/bridge/groups", [
          { id: "not-a-number", friendly_name: "bad" },
          makeGroup(1, "lamp"),
        ] as unknown as Record<string, unknown>),
      ).not.toThrow();

      expect(registry.getGroups()).toHaveLength(1);
      expect(registry.getGroup(1)?.friendly_name).toBe("lamp");
    });

    it("skips a malformed group entry (non-string friendly_name) without throwing", () => {
      expect(() =>
        mqttMock.emit("zigbee2mqtt/bridge/groups", [
          { id: 9, friendly_name: 123 },
        ] as unknown as Record<string, unknown>),
      ).not.toThrow();

      expect(registry.getGroups()).toHaveLength(0);
    });

    it("fires onGroupsChanged once per message that changes the tracked set", () => {
      const handler = mock(() => {});
      registry.onGroupsChanged(handler);

      mqttMock.emit("zigbee2mqtt/bridge/groups", [makeGroup(1, "lamp")] as unknown as Record<
        string,
        unknown
      >);
      expect(handler).toHaveBeenCalledTimes(1);

      // Same content again — no observable change.
      mqttMock.emit("zigbee2mqtt/bridge/groups", [makeGroup(1, "lamp")] as unknown as Record<
        string,
        unknown
      >);
      expect(handler).toHaveBeenCalledTimes(1);

      mqttMock.emit("zigbee2mqtt/bridge/groups", [makeGroup(1, "renamed")] as unknown as Record<
        string,
        unknown
      >);
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("stops firing onGroupsChanged after offGroupsChanged", () => {
      const handler = mock(() => {});
      registry.onGroupsChanged(handler);
      registry.offGroupsChanged(handler);

      mqttMock.emit("zigbee2mqtt/bridge/groups", [makeGroup(1, "lamp")] as unknown as Record<
        string,
        unknown
      >);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Capability schema mapping (design.md D22; tasks 4.1b, 4.2)
  // ---------------------------------------------------------------------------

  describe("capability schema", () => {
    beforeEach(() => {
      registry.start();
    });

    it("maps a device's raw exposes into the capability vocabulary on arrival", () => {
      const device = makeDeviceWithRawExposes("bulb", [
        {
          type: "light",
          features: [
            { type: "binary", name: "state", property: "state", access: 7 },
            {
              type: "numeric",
              name: "brightness",
              property: "brightness",
              access: 7,
              value_min: 0,
              value_max: 254,
            },
          ],
        },
      ]);
      mqttMock.emit("zigbee2mqtt/bridge/devices", [device] as unknown as Record<string, unknown>);

      const stored = registry.getDevice("bulb");
      const exposes = stored?.definition?.exposes;
      expect(exposes).toHaveLength(1);
      expect(exposes?.[0].kind).toBe("light");
      expect(exposes?.[0].valueType).toBe("composite");
      expect(exposes?.[0].features).toHaveLength(2);
      expect(exposes?.[0].features?.[1].range).toEqual({ min: 0, max: 254 });
    });

    it("describes a device published with no exposes as having an empty schema", () => {
      mqttMock.emit("zigbee2mqtt/bridge/devices", [makeDevice("sensor")] as unknown as Record<
        string,
        unknown
      >);

      // makeDevice() has `definition: null` — no schema published at all.
      expect(registry.getDevice("sensor")?.definition).toBeNull();
    });

    it("preserves an unrecognised capability entry rather than discarding it", () => {
      const device = makeDeviceWithRawExposes("mystery", [
        { type: "some-future-kind", name: "widget", access: 1 },
      ]);
      mqttMock.emit("zigbee2mqtt/bridge/devices", [device] as unknown as Record<string, unknown>);

      const exposes = registry.getDevice("mystery")?.definition?.exposes;
      expect(exposes).toHaveLength(1);
      expect(exposes?.[0].kind).toBe("some-future-kind");
      expect(exposes?.[0].raw).toEqual({ type: "some-future-kind", name: "widget", access: 1 });
    });

    it("re-maps exposes on a definition update", () => {
      const first = makeDeviceWithRawExposes("bulb", [{ type: "switch", features: [] }]);
      mqttMock.emit("zigbee2mqtt/bridge/devices", [first] as unknown as Record<string, unknown>);
      expect(registry.getDevice("bulb")?.definition?.exposes[0].kind).toBe("switch");

      const second = makeDeviceWithRawExposes("bulb", [
        { type: "numeric", name: "battery", property: "battery", access: 1 },
      ]);
      mqttMock.emit("zigbee2mqtt/bridge/devices", [second] as unknown as Record<string, unknown>);
      expect(registry.getDevice("bulb")?.definition?.exposes[0].kind).toBe("numeric");
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

    it("ignores a non-object payload and leaves existing state unchanged", () => {
      mqttMock.emit("zigbee2mqtt/bulb", { state: "ON", brightness: 200 });

      // A bare availability string must not corrupt the merged state
      mqttMock.emit("zigbee2mqtt/bulb", "online" as unknown as Record<string, unknown>);

      expect(registry.getDeviceState("bulb")).toEqual({ state: "ON", brightness: 200 });
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

    it("skips a device_joined event without a data field without throwing", () => {
      expect(() =>
        mqttMock.emit("zigbee2mqtt/bridge/event", {
          type: "device_joined",
        }),
      ).not.toThrow();

      // No refresh request published for the malformed event
      expect(mqttMock.publications).toHaveLength(0);

      // Handler is still functional afterwards — a valid event triggers a refresh
      mqttMock.emit("zigbee2mqtt/bridge/event", {
        type: "device_joined",
        data: { friendly_name: "new_device", ieee_address: "0xabc" },
      });
      expect(mqttMock.publications).toHaveLength(1);
      expect(mqttMock.publications[0]?.topic).toBe("zigbee2mqtt/bridge/request/devices");
    });
  });

  // ---------------------------------------------------------------------------
  // getNiceName
  // ---------------------------------------------------------------------------

  describe("getNiceName", () => {
    /** Helper: create a registry with specific niceNames config. */
    function makeRegistry(niceNames?: DeviceNiceNames): DeviceRegistry {
      return new DeviceRegistry(mqttMock.mqtt, config, logger, niceNames);
    }

    it("returns raw friendly_name when no niceNames are provided", () => {
      const registry = makeRegistry();
      expect(registry.getNiceName("kitchen_sensor")).toBe("kitchen_sensor");
    });

    it("returns raw friendly_name when niceNames is an empty object", () => {
      const registry = makeRegistry({});
      expect(registry.getNiceName("kitchen_sensor")).toBe("kitchen_sensor");
    });

    it("returns raw friendly_name when devices map has no matching entry", () => {
      const registry = makeRegistry({ devices: { other_device: "Other Device" } });
      expect(registry.getNiceName("kitchen_sensor")).toBe("kitchen_sensor");
    });

    it("returns the per-device override when an explicit entry exists", () => {
      const registry = makeRegistry({
        devices: { kitchen_motion_0x1a2b: "Kitchen Motion Sensor" },
      });
      expect(registry.getNiceName("kitchen_motion_0x1a2b")).toBe("Kitchen Motion Sensor");
    });

    it("returns the transform result when no per-device entry exists", () => {
      const registry = makeRegistry({
        transform: (name) => name.replace(/_/g, " "),
      });
      expect(registry.getNiceName("living_room_bulb")).toBe("living room bulb");
    });

    it("per-device entry takes precedence over transform", () => {
      const registry = makeRegistry({
        devices: { living_room_bulb: "Living Room Lamp" },
        transform: (name) => name.toUpperCase(),
      });
      expect(registry.getNiceName("living_room_bulb")).toBe("Living Room Lamp");
    });

    it("falls back to transform for devices not in the explicit map", () => {
      const registry = makeRegistry({
        devices: { living_room_bulb: "Living Room Lamp" },
        transform: (name) => name.replace(/_/g, " "),
      });
      expect(registry.getNiceName("hallway_sensor")).toBe("hallway sensor");
    });

    it("works for a device not yet in the registry", () => {
      // getNiceName does not require the device to be tracked
      const registry = makeRegistry({
        devices: { future_device: "Future Device" },
      });
      expect(registry.getNiceName("future_device")).toBe("Future Device");
    });

    it("transform receives the exact friendly_name string", () => {
      const transformFn = mock((name: string) => `[${name}]`);
      const registry = makeRegistry({ transform: transformFn });

      registry.getNiceName("my_sensor");

      expect(transformFn).toHaveBeenCalledWith("my_sensor");
    });

    it("transform is not called when a per-device entry matches", () => {
      const transformFn = mock((name: string) => name.toUpperCase());
      const registry = makeRegistry({
        devices: { my_sensor: "My Sensor" },
        transform: transformFn,
      });

      registry.getNiceName("my_sensor");

      expect(transformFn).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Persistence: load() and save()
  // ---------------------------------------------------------------------------

  describe("persistence", () => {
    /** Build a registry with specific persistence options and a mock mqtt. */
    function makePersistedRegistry(
      persistenceOptions: DeviceRegistryPersistenceOptions,
      readFileMock?: ReturnType<typeof mock>,
      writeFileMock?: ReturnType<typeof mock>,
      mkdirMock?: ReturnType<typeof mock>,
    ): DeviceRegistry {
      // Patch node:fs/promises at module level is not straightforward in bun,
      // so we test the observable behaviour via the public API instead.
      // The fs tests use real temp files to verify end-to-end behaviour.
      void readFileMock;
      void writeFileMock;
      void mkdirMock;
      return new DeviceRegistry(
        mqttMock.mqtt,
        {
          ...config,
          deviceRegistry: {
            ...config.deviceRegistry,
            ...persistenceOptions,
          },
        },
        logger,
        {},
        persistenceOptions,
      );
    }

    it("defaults persist to true when no persistence options are given", async () => {
      // No `persistenceOptions` argument at all — exercises the class's own
      // default (design.md D6; task 2.7), not merely config.ts's default.
      const tmpFile = `/tmp/ts-ha-test-default-persist-${Date.now()}.json`;
      const { writeFile: wf, mkdir: mk } = await import("node:fs/promises");
      const { dirname: dn } = await import("node:path");
      await mk(dn(tmpFile), { recursive: true });
      await wf(tmpFile, JSON.stringify({ devices: [makeDevice("lamp")], states: {} }), "utf-8");

      const registry = new DeviceRegistry(mqttMock.mqtt, config, logger, {}, { filePath: tmpFile });
      await registry.load();
      // If persist defaulted to false, load() would be a no-op and the
      // seeded device would not appear.
      expect(registry.getDevices().some((d) => d.friendly_name === "lamp")).toBe(true);

      const { unlink } = await import("node:fs/promises");
      await unlink(tmpFile).catch(() => {});
    });

    it("load() is a no-op when persist is false", async () => {
      const registry = makePersistedRegistry({ persist: false });
      // Should not throw and should leave maps empty
      await registry.load();
      expect(registry.getDevices()).toHaveLength(0);
      expect(registry.getDeviceState("any")).toBeUndefined();
    });

    it("save() is a no-op when persist is false", async () => {
      const registry = makePersistedRegistry({ persist: false });
      // Should not throw
      await registry.save();
    });

    it("load() handles ENOENT gracefully — starts fresh", async () => {
      const tmpFile = `/tmp/ts-ha-test-missing-${Date.now()}.json`;
      const registry = makePersistedRegistry({ persist: true, filePath: tmpFile });
      // File does not exist — should not throw
      await registry.load();
      expect(registry.getDevices()).toHaveLength(0);
    });

    it("save() then load() round-trips devices and states", async () => {
      const tmpFile = `/tmp/ts-ha-test-roundtrip-${Date.now()}.json`;

      // Build a fresh registry with its own mqtt mock so we control exactly
      // which topics fire.
      const freshMqtt = (() => {
        const subs: { topic: string; handler: MqttMessageHandler }[] = [];
        const mqtt = {
          subscribe: mock((t: string, h: MqttMessageHandler) =>
            subs.push({ topic: t, handler: h }),
          ),
          unsubscribe: mock(() => {}),
          publish: mock(() => {}),
        } as unknown as MqttService;
        function emit(topic: string, payload: Record<string, unknown>) {
          for (const { topic: t, handler } of subs) {
            if (t === topic) handler(topic, payload);
          }
        }
        return { mqtt, emit };
      })();

      const regA = new DeviceRegistry(
        freshMqtt.mqtt,
        { ...config, deviceRegistry: { enabled: true, persist: true, filePath: tmpFile } },
        logger,
        {},
        { persist: true, filePath: tmpFile },
      );
      regA.start();
      freshMqtt.emit("zigbee2mqtt/bridge/devices", [
        makeDevice("bulb"),
        makeDevice("sensor"),
      ] as unknown as Record<string, unknown>);
      freshMqtt.emit("zigbee2mqtt/bulb", { state: "ON", brightness: 200 });
      freshMqtt.emit("zigbee2mqtt/sensor", { contact: false, battery: 88 });

      expect(regA.getDevices()).toHaveLength(2);
      expect(regA.getDeviceState("bulb")).toEqual({ state: "ON", brightness: 200 });

      // Save to disk
      await regA.save();

      // Load into a fresh registry (separate instance, separate mqtt mock)
      const freshMqtt2 = {
        subscribe: mock(() => {}),
        unsubscribe: mock(() => {}),
        publish: mock(() => {}),
      } as unknown as MqttService;

      const regB = new DeviceRegistry(
        freshMqtt2,
        { ...config, deviceRegistry: { enabled: true, persist: true, filePath: tmpFile } },
        logger,
        {},
        { persist: true, filePath: tmpFile },
      );
      await regB.load();

      // Devices and states should be restored
      expect(regB.getDevices()).toHaveLength(2);
      expect(regB.getDevice("bulb")?.friendly_name).toBe("bulb");
      expect(regB.getDevice("sensor")?.friendly_name).toBe("sensor");
      expect(regB.getDeviceState("bulb")).toEqual({ state: "ON", brightness: 200 });
      expect(regB.getDeviceState("sensor")).toEqual({ contact: false, battery: 88 });
    });

    it("restores a device's mapped capability schema from a snapshot before the bridge republishes", async () => {
      const tmpFile = `/tmp/ts-ha-test-capability-roundtrip-${Date.now()}.json`;

      const freshMqtt = createMockMqtt();
      const regA = new DeviceRegistry(
        freshMqtt.mqtt,
        { ...config, deviceRegistry: { enabled: true, persist: true, filePath: tmpFile } },
        logger,
        {},
        { persist: true, filePath: tmpFile },
      );
      regA.start();
      const device = makeDeviceWithRawExposes("bulb", [
        { type: "numeric", name: "brightness", property: "brightness", access: 7, value_max: 254 },
      ]);
      freshMqtt.emit("zigbee2mqtt/bridge/devices", [device] as unknown as Record<string, unknown>);
      await regA.save();

      // A brand-new registry, loaded from disk — simulating a restart before
      // the bridge has republished anything.
      const regB = new DeviceRegistry(
        createMockMqtt().mqtt,
        { ...config, deviceRegistry: { enabled: true, persist: true, filePath: tmpFile } },
        logger,
        {},
        { persist: true, filePath: tmpFile },
      );
      await regB.load();

      const exposes = regB.getDevice("bulb")?.definition?.exposes;
      expect(exposes).toHaveLength(1);
      expect(exposes?.[0].kind).toBe("numeric");
      expect(exposes?.[0].property).toBe("brightness");
      expect(exposes?.[0].range).toEqual({ min: undefined, max: 254 });

      const { unlink } = await import("node:fs/promises");
      await unlink(tmpFile).catch(() => {});
    });

    it("load() filters out Coordinator from persisted device list", async () => {
      const tmpFile = `/tmp/ts-ha-test-coordinator-${Date.now()}.json`;

      // Write a file that contains a Coordinator entry
      const { writeFile, mkdir } = await import("node:fs/promises");
      const { dirname } = await import("node:path");
      await mkdir(dirname(tmpFile), { recursive: true });
      await writeFile(
        tmpFile,
        JSON.stringify({
          devices: {
            Coordinator: { ...makeDevice("Coordinator", "Coordinator") },
            bulb: { ...makeDevice("bulb") },
          },
          states: {},
        }),
        "utf-8",
      );

      const freshMqtt = {
        subscribe: mock(() => {}),
        unsubscribe: mock(() => {}),
        publish: mock(() => {}),
      } as unknown as MqttService;

      const registry = new DeviceRegistry(
        freshMqtt,
        { ...config, deviceRegistry: { enabled: true, persist: true, filePath: tmpFile } },
        logger,
        {},
        { persist: true, filePath: tmpFile },
      );
      await registry.load();

      expect(registry.hasDevice("Coordinator")).toBe(false);
      expect(registry.hasDevice("bulb")).toBe(true);
    });

    it("live MQTT state merges on top of restored state", async () => {
      const tmpFile = `/tmp/ts-ha-test-merge-${Date.now()}.json`;
      const { writeFile, mkdir } = await import("node:fs/promises");
      const { dirname } = await import("node:path");
      await mkdir(dirname(tmpFile), { recursive: true });
      await writeFile(
        tmpFile,
        JSON.stringify({
          devices: { bulb: makeDevice("bulb") },
          states: { bulb: { state: "OFF", brightness: 50, color_temp: 4000 } },
        }),
        "utf-8",
      );

      const subs: { topic: string; handler: MqttMessageHandler }[] = [];
      const freshMqtt = {
        subscribe: mock((t: string, h: MqttMessageHandler) => subs.push({ topic: t, handler: h })),
        unsubscribe: mock(() => {}),
        publish: mock(() => {}),
      } as unknown as MqttService;

      const registry = new DeviceRegistry(
        freshMqtt,
        { ...config, deviceRegistry: { enabled: true, persist: true, filePath: tmpFile } },
        logger,
        {},
        { persist: true, filePath: tmpFile },
      );
      await registry.load();
      registry.start();

      // Confirm restored state
      expect(registry.getDeviceState("bulb")).toEqual({
        state: "OFF",
        brightness: 50,
        color_temp: 4000,
      });

      // Simulate a partial MQTT update — only brightness changes
      for (const { topic, handler } of subs) {
        if (topic === "zigbee2mqtt/bulb") handler(topic, { brightness: 200 });
      }

      // brightness updated, other keys preserved from restored state
      expect(registry.getDeviceState("bulb")).toEqual({
        state: "OFF",
        brightness: 200,
        color_temp: 4000,
      });
    });

    it("save() then load() round-trips groups alongside devices", async () => {
      const tmpFile = `/tmp/ts-ha-test-groups-roundtrip-${Date.now()}.json`;

      const freshMqtt = createMockMqtt();
      const regA = new DeviceRegistry(
        freshMqtt.mqtt,
        { ...config, deviceRegistry: { enabled: true, persist: true, filePath: tmpFile } },
        logger,
        {},
        { persist: true, filePath: tmpFile },
      );
      regA.start();
      freshMqtt.emit("zigbee2mqtt/bridge/groups", [
        makeGroup(1, "lamp", [{ ieee_address: "0xa", endpoint: 1 }]),
      ] as unknown as Record<string, unknown>);

      await regA.save();

      const regB = new DeviceRegistry(
        createMockMqtt().mqtt,
        { ...config, deviceRegistry: { enabled: true, persist: true, filePath: tmpFile } },
        logger,
        {},
        { persist: true, filePath: tmpFile },
      );
      await regB.load();

      expect(regB.getGroups()).toHaveLength(1);
      expect(regB.getGroup(1)?.friendly_name).toBe("lamp");

      const { unlink } = await import("node:fs/promises");
      await unlink(tmpFile).catch(() => {});
    });

    it("loads a snapshot written before groups were persisted with no groups and no error", async () => {
      const tmpFile = `/tmp/ts-ha-test-groups-missing-key-${Date.now()}.json`;
      const { writeFile, mkdir } = await import("node:fs/promises");
      const { dirname } = await import("node:path");
      await mkdir(dirname(tmpFile), { recursive: true });
      // No `groups` key at all — simulating a pre-groups snapshot.
      await writeFile(
        tmpFile,
        JSON.stringify({ devices: { bulb: makeDevice("bulb") }, states: {} }),
        "utf-8",
      );

      const registry = new DeviceRegistry(
        createMockMqtt().mqtt,
        { ...config, deviceRegistry: { enabled: true, persist: true, filePath: tmpFile } },
        logger,
        {},
        { persist: true, filePath: tmpFile },
      );

      await expect(registry.load()).resolves.toBeUndefined();
      expect(registry.getGroups()).toHaveLength(0);
      expect(registry.hasDevice("bulb")).toBe(true);

      const { unlink } = await import("node:fs/promises");
      await unlink(tmpFile).catch(() => {});
    });

    it("save() creates parent directories", async () => {
      const tmpFile = `/tmp/ts-ha-test-mkdir-${Date.now()}/nested/dir/registry.json`;

      const freshMqtt = {
        subscribe: mock(() => {}),
        unsubscribe: mock(() => {}),
        publish: mock(() => {}),
      } as unknown as MqttService;

      const registry = new DeviceRegistry(
        freshMqtt,
        { ...config, deviceRegistry: { enabled: true, persist: true, filePath: tmpFile } },
        logger,
        {},
        { persist: true, filePath: tmpFile },
      );

      // Should not throw even with non-existent nested dirs
      await registry.save();

      const { readFile } = await import("node:fs/promises");
      const content = await readFile(tmpFile, "utf-8");
      const parsed = JSON.parse(content) as { devices: unknown; states: unknown };
      expect(parsed).toHaveProperty("devices");
      expect(parsed).toHaveProperty("states");
    });
  });
});
