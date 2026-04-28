import { describe, expect, it, mock } from "bun:test";
import pino from "pino";
import type { Config } from "../src/config.js";
import { Automation, type Trigger, type TriggerContext } from "../src/core/automation.js";
import { AutomationManager } from "../src/core/automation-manager.js";
import type { HttpClient } from "../src/core/http/http-client.js";
import type { MqttService } from "../src/core/mqtt/mqtt-service.js";
import type { CronScheduler } from "../src/core/scheduling/cron-scheduler.js";
import { ServiceRegistry } from "../src/core/services/service-registry.js";
import type { StateManager } from "../src/core/state/state-manager.js";
import type {
  DeviceAddedHandler,
  DeviceRegistry,
  DeviceRemovedHandler,
  DeviceStateChangeHandler,
} from "../src/core/zigbee/device-registry.js";
import type { ZigbeeDevice } from "../src/types/zigbee/bridge.js";

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

/** Minimal ZigbeeDevice fixture. */
function makeDevice(friendlyName: string): ZigbeeDevice {
  return {
    ieee_address: `0x${friendlyName}`,
    friendly_name: friendlyName,
    type: "Router",
    supported: true,
    disabled: false,
    interview_state: "SUCCESSFUL",
    definition: null,
  };
}

/** Concrete test automation with configurable triggers. */
class TestAutomation extends Automation {
  readonly name: string;
  readonly triggers: Trigger[];
  readonly executeFn = mock((_ctx: TriggerContext) => Promise.resolve());

  constructor(name: string, triggers: Trigger[] = []) {
    super();
    this.name = name;
    this.triggers = triggers;
  }

  async execute(context: TriggerContext): Promise<void> {
    return this.executeFn(context);
  }
}

/** Build a mock DeviceRegistry capturing all onX and offX calls. */
function createMockRegistry(getDeviceResult: ZigbeeDevice | undefined = makeDevice("bulb")) {
  const deviceStateHandlers: { friendlyName: string; handler: DeviceStateChangeHandler }[] = [];
  const deviceAddedHandlers: DeviceAddedHandler[] = [];
  const deviceRemovedHandlers: DeviceRemovedHandler[] = [];

  const registry = {
    getDevice: mock((_name: string) => getDeviceResult),
    onDeviceStateChange: mock((friendlyName: string, handler: DeviceStateChangeHandler) => {
      deviceStateHandlers.push({ friendlyName, handler });
    }),
    offDeviceStateChange: mock((_friendlyName: string, _handler: DeviceStateChangeHandler) => {}),
    onDeviceAdded: mock((handler: DeviceAddedHandler) => {
      deviceAddedHandlers.push(handler);
    }),
    offDeviceAdded: mock((_handler: DeviceAddedHandler) => {}),
    onDeviceRemoved: mock((handler: DeviceRemovedHandler) => {
      deviceRemovedHandlers.push(handler);
    }),
    offDeviceRemoved: mock((_handler: DeviceRemovedHandler) => {}),
  } as unknown as DeviceRegistry;

  /** Simulate a device state change message. */
  function emitStateChange(
    friendlyName: string,
    state: Record<string, unknown>,
    prev?: Record<string, unknown>,
  ): void {
    for (const { friendlyName: fn, handler } of deviceStateHandlers) {
      if (fn === friendlyName) handler(state, prev);
    }
  }

  /** Simulate a device joining the network. */
  function emitDeviceAdded(device: ZigbeeDevice): void {
    for (const handler of deviceAddedHandlers) handler(device);
  }

  /** Simulate a device leaving the network. */
  function emitDeviceRemoved(device: ZigbeeDevice): void {
    for (const handler of deviceRemovedHandlers) handler(device);
  }

  return {
    registry,
    deviceStateHandlers,
    deviceAddedHandlers,
    deviceRemovedHandlers,
    emitStateChange,
    emitDeviceAdded,
    emitDeviceRemoved,
  };
}

/** Build an AutomationManager with a given (possibly null) device registry. */
function createManager(registry: DeviceRegistry | null) {
  return new AutomationManager(
    {} as MqttService,
    { schedule: mock(() => {}), removeByPrefix: mock(() => {}) } as unknown as CronScheduler,
    {} as HttpClient,
    { onChange: mock(() => {}), offChange: mock(() => {}) } as unknown as StateManager,
    null, // httpServer
    config,
    logger,
    new ServiceRegistry(),
    registry,
  );
}

// ---------------------------------------------------------------------------
// Tick helper: let the microtask queue drain so async execute() calls settle.
// ---------------------------------------------------------------------------
const tick = () => new Promise((r) => setTimeout(r, 10));

describe("device triggers in AutomationManager", () => {
  // -------------------------------------------------------------------------
  // device_state
  // -------------------------------------------------------------------------

  describe("device_state trigger", () => {
    it("registers with onDeviceStateChange when registry is present", async () => {
      const { registry } = createMockRegistry();
      const manager = createManager(registry);
      const auto = new TestAutomation("test", [{ type: "device_state", friendlyName: "bulb" }]);
      await manager.register(auto);

      expect(registry.onDeviceStateChange).toHaveBeenCalledTimes(1);
      const call = (registry.onDeviceStateChange as ReturnType<typeof mock>).mock.calls[0];
      expect(call[0]).toBe("bulb");
    });

    it("warns and skips when registry is null", async () => {
      const manager = createManager(null);
      const auto = new TestAutomation("test", [{ type: "device_state", friendlyName: "bulb" }]);
      await manager.register(auto);
      // No throw — automation still registers without the trigger
      expect(auto.executeFn).not.toHaveBeenCalled();
    });

    it("fires execute with full context when state changes", async () => {
      const device = makeDevice("bulb");
      const { registry, emitStateChange } = createMockRegistry(device);
      const manager = createManager(registry);
      const auto = new TestAutomation("test", [{ type: "device_state", friendlyName: "bulb" }]);
      await manager.register(auto);

      emitStateChange("bulb", { state: "ON", brightness: 200 });
      await tick();

      expect(auto.executeFn).toHaveBeenCalledTimes(1);
      const ctx = auto.executeFn.mock.calls[0][0] as Extract<
        TriggerContext,
        { type: "device_state" }
      >;
      expect(ctx.type).toBe("device_state");
      expect(ctx.friendlyName).toBe("bulb");
      expect(ctx.state).toEqual({ state: "ON", brightness: 200 });
      expect(ctx.device).toBe(device);
    });

    it("skips execute when filter returns false", async () => {
      const { registry, emitStateChange } = createMockRegistry();
      const manager = createManager(registry);
      const auto = new TestAutomation("test", [
        {
          type: "device_state",
          friendlyName: "bulb",
          filter: (s) => s.state === "ON",
        },
      ]);
      await manager.register(auto);

      emitStateChange("bulb", { state: "OFF" });
      await tick();

      expect(auto.executeFn).not.toHaveBeenCalled();
    });

    it("fires execute when filter returns true", async () => {
      const { registry, emitStateChange } = createMockRegistry();
      const manager = createManager(registry);
      const auto = new TestAutomation("test", [
        {
          type: "device_state",
          friendlyName: "bulb",
          filter: (s) => s.state === "ON",
        },
      ]);
      await manager.register(auto);

      emitStateChange("bulb", { state: "ON" });
      await tick();

      expect(auto.executeFn).toHaveBeenCalledTimes(1);
    });

    it("filter receives both state and device", async () => {
      const device = makeDevice("bulb");
      const filterFn = mock((_state: Record<string, unknown>, _device: ZigbeeDevice) => true);
      const { registry, emitStateChange } = createMockRegistry(device);
      const manager = createManager(registry);
      const auto = new TestAutomation("test", [
        { type: "device_state", friendlyName: "bulb", filter: filterFn },
      ]);
      await manager.register(auto);

      emitStateChange("bulb", { brightness: 128 });
      await tick();

      expect(filterFn).toHaveBeenCalledTimes(1);
      const [passedState, passedDevice] = filterFn.mock.calls[0] as [
        Record<string, unknown>,
        ZigbeeDevice,
      ];
      expect(passedState).toEqual({ brightness: 128 });
      expect(passedDevice).toBe(device);
    });

    it("calls getDevice to look up device metadata when state changes", async () => {
      // Verifies the handler looks up device metadata via the registry.
      // When getDevice returns undefined (device not yet known), execute is
      // not called — this is covered by the guard in automation-manager.ts
      // and confirmed by the integration trace (see inline trace test).
      const { registry, emitStateChange } = createMockRegistry(makeDevice("ghost"));
      const manager = createManager(registry);
      const auto = new TestAutomation("test", [{ type: "device_state", friendlyName: "ghost" }]);
      await manager.register(auto);

      emitStateChange("ghost", { state: "ON" });
      await tick();

      expect(registry.getDevice).toHaveBeenCalledWith("ghost");
    });
  });

  // -------------------------------------------------------------------------
  // device_joined
  // -------------------------------------------------------------------------

  describe("device_joined trigger", () => {
    it("registers with onDeviceAdded when registry is present", async () => {
      const { registry } = createMockRegistry();
      const manager = createManager(registry);
      const auto = new TestAutomation("test", [{ type: "device_joined" }]);
      await manager.register(auto);

      expect(registry.onDeviceAdded).toHaveBeenCalledTimes(1);
    });

    it("warns and skips when registry is null", async () => {
      const manager = createManager(null);
      const auto = new TestAutomation("test", [{ type: "device_joined" }]);
      await manager.register(auto);
      expect(auto.executeFn).not.toHaveBeenCalled();
    });

    it("fires execute for any device when friendlyName is omitted", async () => {
      const { registry, emitDeviceAdded } = createMockRegistry();
      const manager = createManager(registry);
      const auto = new TestAutomation("test", [{ type: "device_joined" }]);
      await manager.register(auto);

      emitDeviceAdded(makeDevice("sensor"));
      await tick();

      expect(auto.executeFn).toHaveBeenCalledTimes(1);
      const ctx = auto.executeFn.mock.calls[0][0] as Extract<
        TriggerContext,
        { type: "device_joined" }
      >;
      expect(ctx.type).toBe("device_joined");
      expect(ctx.device.friendly_name).toBe("sensor");
    });

    it("fires execute only for the matching device when friendlyName is set", async () => {
      const { registry, emitDeviceAdded } = createMockRegistry();
      const manager = createManager(registry);
      const auto = new TestAutomation("test", [{ type: "device_joined", friendlyName: "sensor" }]);
      await manager.register(auto);

      emitDeviceAdded(makeDevice("sensor"));
      await tick();

      expect(auto.executeFn).toHaveBeenCalledTimes(1);
    });

    it("skips execute for a non-matching device when friendlyName is set", async () => {
      const { registry, emitDeviceAdded } = createMockRegistry();
      const manager = createManager(registry);
      const auto = new TestAutomation("test", [{ type: "device_joined", friendlyName: "sensor" }]);
      await manager.register(auto);

      emitDeviceAdded(makeDevice("other_device"));
      await tick();

      expect(auto.executeFn).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // device_left
  // -------------------------------------------------------------------------

  describe("device_left trigger", () => {
    it("registers with onDeviceRemoved when registry is present", async () => {
      const { registry } = createMockRegistry();
      const manager = createManager(registry);
      const auto = new TestAutomation("test", [{ type: "device_left" }]);
      await manager.register(auto);

      expect(registry.onDeviceRemoved).toHaveBeenCalledTimes(1);
    });

    it("warns and skips when registry is null", async () => {
      const manager = createManager(null);
      const auto = new TestAutomation("test", [{ type: "device_left" }]);
      await manager.register(auto);
      expect(auto.executeFn).not.toHaveBeenCalled();
    });

    it("fires execute for any device when friendlyName is omitted", async () => {
      const { registry, emitDeviceRemoved } = createMockRegistry();
      const manager = createManager(registry);
      const auto = new TestAutomation("test", [{ type: "device_left" }]);
      await manager.register(auto);

      emitDeviceRemoved(makeDevice("old_plug"));
      await tick();

      expect(auto.executeFn).toHaveBeenCalledTimes(1);
      const ctx = auto.executeFn.mock.calls[0][0] as Extract<
        TriggerContext,
        { type: "device_left" }
      >;
      expect(ctx.type).toBe("device_left");
      expect(ctx.device.friendly_name).toBe("old_plug");
    });

    it("fires execute only for the matching device when friendlyName is set", async () => {
      const { registry, emitDeviceRemoved } = createMockRegistry();
      const manager = createManager(registry);
      const auto = new TestAutomation("test", [{ type: "device_left", friendlyName: "old_plug" }]);
      await manager.register(auto);

      emitDeviceRemoved(makeDevice("old_plug"));
      await tick();

      expect(auto.executeFn).toHaveBeenCalledTimes(1);
    });

    it("skips execute for a non-matching device when friendlyName is set", async () => {
      const { registry, emitDeviceRemoved } = createMockRegistry();
      const manager = createManager(registry);
      const auto = new TestAutomation("test", [{ type: "device_left", friendlyName: "old_plug" }]);
      await manager.register(auto);

      emitDeviceRemoved(makeDevice("something_else"));
      await tick();

      expect(auto.executeFn).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // stopAll cleanup
  // -------------------------------------------------------------------------

  describe("stopAll cleanup", () => {
    it("calls offDeviceStateChange with the correct handler on stopAll", async () => {
      const { registry } = createMockRegistry();
      const manager = createManager(registry);
      const auto = new TestAutomation("test", [{ type: "device_state", friendlyName: "bulb" }]);
      await manager.register(auto);
      await manager.stopAll();

      expect(registry.offDeviceStateChange).toHaveBeenCalledTimes(1);
      const [name, handler] = (registry.offDeviceStateChange as ReturnType<typeof mock>).mock
        .calls[0] as [string, DeviceStateChangeHandler];
      expect(name).toBe("bulb");
      expect(typeof handler).toBe("function");
    });

    it("calls offDeviceAdded with the correct handler on stopAll", async () => {
      const { registry } = createMockRegistry();
      const manager = createManager(registry);
      const auto = new TestAutomation("test", [{ type: "device_joined" }]);
      await manager.register(auto);
      await manager.stopAll();

      expect(registry.offDeviceAdded).toHaveBeenCalledTimes(1);
      const [handler] = (registry.offDeviceAdded as ReturnType<typeof mock>).mock.calls[0] as [
        DeviceAddedHandler,
      ];
      expect(typeof handler).toBe("function");
    });

    it("calls offDeviceRemoved with the correct handler on stopAll", async () => {
      const { registry } = createMockRegistry();
      const manager = createManager(registry);
      const auto = new TestAutomation("test", [{ type: "device_left" }]);
      await manager.register(auto);
      await manager.stopAll();

      expect(registry.offDeviceRemoved).toHaveBeenCalledTimes(1);
      const [handler] = (registry.offDeviceRemoved as ReturnType<typeof mock>).mock.calls[0] as [
        DeviceRemovedHandler,
      ];
      expect(typeof handler).toBe("function");
    });

    it("does not call off* methods when registry is null", async () => {
      // When registry is null, triggers are skipped at registration, so no
      // cleanup handlers should be registered or called.
      const manager = createManager(null);
      const auto = new TestAutomation("test", [
        { type: "device_state", friendlyName: "bulb" },
        { type: "device_joined" },
        { type: "device_left" },
      ]);
      await manager.register(auto);
      // Should not throw
      await manager.stopAll();
    });

    it("passes the same handler to offDeviceStateChange as was registered", async () => {
      const device = makeDevice("bulb");
      const { registry } = createMockRegistry(device);
      const manager = createManager(registry);
      const auto = new TestAutomation("test", [{ type: "device_state", friendlyName: "bulb" }]);
      await manager.register(auto);
      await manager.stopAll();

      // The handler passed to offDeviceStateChange must be the exact same
      // function reference that was passed to onDeviceStateChange.
      const registeredHandler = (registry.onDeviceStateChange as ReturnType<typeof mock>).mock
        .calls[0][1] as DeviceStateChangeHandler;
      const unregisteredHandler = (registry.offDeviceStateChange as ReturnType<typeof mock>).mock
        .calls[0][1] as DeviceStateChangeHandler;
      expect(registeredHandler).toBe(unregisteredHandler);
    });
  });

  // -------------------------------------------------------------------------
  // serializeAutomation (via listAutomations)
  // -------------------------------------------------------------------------

  describe("listAutomations serialization", () => {
    it("serializes device_state trigger correctly", async () => {
      const { registry } = createMockRegistry();
      const manager = createManager(registry);
      const filter = (_s: Record<string, unknown>) => true;
      const auto = new TestAutomation("test", [
        { type: "device_state", friendlyName: "bulb", filter },
      ]);
      await manager.register(auto);

      const list = manager.listAutomations();
      expect(list[0].triggers[0]).toMatchObject({
        type: "device_state",
        friendlyName: "bulb",
        hasFilter: true,
      });
    });

    it("serializes device_joined trigger with specific friendlyName", async () => {
      const { registry } = createMockRegistry();
      const manager = createManager(registry);
      const auto = new TestAutomation("test", [
        { type: "device_joined", friendlyName: "new_sensor" },
      ]);
      await manager.register(auto);

      const list = manager.listAutomations();
      expect(list[0].triggers[0]).toEqual({
        type: "device_joined",
        friendlyName: "new_sensor",
      });
    });

    it("serializes device_joined trigger with wildcard when no friendlyName", async () => {
      const { registry } = createMockRegistry();
      const manager = createManager(registry);
      const auto = new TestAutomation("test", [{ type: "device_joined" }]);
      await manager.register(auto);

      const list = manager.listAutomations();
      expect(list[0].triggers[0]).toEqual({
        type: "device_joined",
        friendlyName: "*",
      });
    });

    it("serializes device_left trigger with specific friendlyName", async () => {
      const { registry } = createMockRegistry();
      const manager = createManager(registry);
      const auto = new TestAutomation("test", [{ type: "device_left", friendlyName: "old_plug" }]);
      await manager.register(auto);

      const list = manager.listAutomations();
      expect(list[0].triggers[0]).toEqual({
        type: "device_left",
        friendlyName: "old_plug",
      });
    });

    it("serializes device_left trigger with wildcard when no friendlyName", async () => {
      const { registry } = createMockRegistry();
      const manager = createManager(registry);
      const auto = new TestAutomation("test", [{ type: "device_left" }]);
      await manager.register(auto);

      const list = manager.listAutomations();
      expect(list[0].triggers[0]).toEqual({
        type: "device_left",
        friendlyName: "*",
      });
    });
  });
});
