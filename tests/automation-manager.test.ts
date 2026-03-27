import { beforeEach, describe, expect, it, mock } from "bun:test";
import pino from "pino";
import type { Config } from "../src/config.js";
import { Automation, type Trigger, type TriggerContext } from "../src/core/automation.js";
import { AutomationManager } from "../src/core/automation-manager.js";
import type { CronScheduler } from "../src/core/cron-scheduler.js";
import type { HttpClient } from "../src/core/http-client.js";
import type { MqttMessageHandler, MqttService } from "../src/core/mqtt-service.js";
import type { ShellyService } from "../src/core/shelly-service.js";
import type { StateChangeHandler, StateManager } from "../src/core/state-manager.js";

const logger = pino({ level: "silent" });

const config: Config = {
  mqtt: { host: "localhost", port: 1883 },
  zigbee2mqttPrefix: "zigbee2mqtt",
  logLevel: "info",
  state: { persist: false, filePath: "./state.json" },
  health: { port: 0 },
};

/** Concrete test automation with configurable triggers. */
class TestAutomation extends Automation {
  readonly name: string;
  readonly triggers: Trigger[];
  readonly executeFn = mock((_ctx: TriggerContext) => Promise.resolve());
  readonly onStartFn = mock(() => Promise.resolve());
  readonly onStopFn = mock(() => Promise.resolve());

  constructor(name: string, triggers: Trigger[] = []) {
    super();
    this.name = name;
    this.triggers = triggers;
  }

  async execute(context: TriggerContext): Promise<void> {
    return this.executeFn(context);
  }

  async onStart(): Promise<void> {
    return this.onStartFn();
  }

  async onStop(): Promise<void> {
    return this.onStopFn();
  }
}

function createMocks() {
  const subscribedHandlers: { topic: string; handler: MqttMessageHandler }[] = [];
  const stateHandlers: { key: string; handler: StateChangeHandler }[] = [];

  const mqtt = {
    subscribe: mock((topic: string, handler: MqttMessageHandler) => {
      subscribedHandlers.push({ topic, handler });
    }),
    unsubscribe: mock((_topic: string, _handler: MqttMessageHandler) => {}),
  } as unknown as MqttService;

  const cron = {
    schedule: mock((_id: string, _expr: string, _cb: () => void) => {}),
    removeByPrefix: mock((_prefix: string) => {}),
    stopAll: mock(() => {}),
  } as unknown as CronScheduler;

  const http = {} as HttpClient;
  const shelly = {} as ShellyService;

  const state = {
    onChange: mock((key: string, handler: StateChangeHandler) => {
      stateHandlers.push({ key, handler });
    }),
    offChange: mock((_key: string, _handler: StateChangeHandler) => {}),
  } as unknown as StateManager;

  return { mqtt, cron, http, shelly, state, subscribedHandlers, stateHandlers };
}

describe("AutomationManager", () => {
  let manager: AutomationManager;
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
    manager = new AutomationManager(
      mocks.mqtt,
      mocks.cron,
      mocks.http,
      mocks.shelly,
      mocks.state,
      null,
      config,
      logger,
    );
  });

  describe("register", () => {
    it("calls onStart lifecycle hook", async () => {
      const auto = new TestAutomation("test");
      await manager.register(auto);
      expect(auto.onStartFn).toHaveBeenCalledTimes(1);
    });

    it("catches and logs onStart failure without throwing", async () => {
      const auto = new TestAutomation("test");
      auto.onStartFn.mockImplementation(() => Promise.reject(new Error("start failed")));
      // Should not throw
      await manager.register(auto);
    });

    it("subscribes to MQTT topic for mqtt triggers", async () => {
      const auto = new TestAutomation("test", [{ type: "mqtt", topic: "zigbee2mqtt/sensor" }]);
      await manager.register(auto);
      expect(mocks.mqtt.subscribe).toHaveBeenCalledTimes(1);
      expect((mocks.mqtt.subscribe as ReturnType<typeof mock>).mock.calls[0][0]).toBe(
        "zigbee2mqtt/sensor",
      );
    });

    it("schedules cron job for cron triggers", async () => {
      const auto = new TestAutomation("test", [{ type: "cron", expression: "0 7 * * *" }]);
      await manager.register(auto);
      expect(mocks.cron.schedule).toHaveBeenCalledTimes(1);
      const call = (mocks.cron.schedule as ReturnType<typeof mock>).mock.calls[0];
      expect(call[0]).toBe("test:cron:0");
      expect(call[1]).toBe("0 7 * * *");
    });

    it("registers state change listener for state triggers", async () => {
      const auto = new TestAutomation("test", [{ type: "state", key: "night_mode" }]);
      await manager.register(auto);
      expect(mocks.state.onChange).toHaveBeenCalledTimes(1);
      expect((mocks.state.onChange as ReturnType<typeof mock>).mock.calls[0][0]).toBe("night_mode");
    });

    it("registers multiple triggers of different types", async () => {
      const auto = new TestAutomation("test", [
        { type: "mqtt", topic: "zigbee2mqtt/sensor" },
        { type: "cron", expression: "0 8 * * *" },
        { type: "state", key: "mode" },
      ]);
      await manager.register(auto);
      expect(mocks.mqtt.subscribe).toHaveBeenCalledTimes(1);
      expect(mocks.cron.schedule).toHaveBeenCalledTimes(1);
      expect(mocks.state.onChange).toHaveBeenCalledTimes(1);
    });
  });

  describe("MQTT trigger execution", () => {
    it("calls execute when MQTT message arrives", async () => {
      const auto = new TestAutomation("test", [{ type: "mqtt", topic: "zigbee2mqtt/sensor" }]);
      await manager.register(auto);

      // Simulate MQTT message
      const handler = mocks.subscribedHandlers[0].handler;
      handler("zigbee2mqtt/sensor", { occupancy: true });

      // execute is called async, give it a tick
      await new Promise((r) => setTimeout(r, 10));
      expect(auto.executeFn).toHaveBeenCalledTimes(1);
    });

    it("skips execution when MQTT filter returns false", async () => {
      const auto = new TestAutomation("test", [
        {
          type: "mqtt",
          topic: "zigbee2mqtt/sensor",
          filter: (p) => p.occupancy === true,
        },
      ]);
      await manager.register(auto);

      const handler = mocks.subscribedHandlers[0].handler;
      handler("zigbee2mqtt/sensor", { occupancy: false });

      await new Promise((r) => setTimeout(r, 10));
      expect(auto.executeFn).not.toHaveBeenCalled();
    });

    it("executes when MQTT filter returns true", async () => {
      const auto = new TestAutomation("test", [
        {
          type: "mqtt",
          topic: "zigbee2mqtt/sensor",
          filter: (p) => p.occupancy === true,
        },
      ]);
      await manager.register(auto);

      const handler = mocks.subscribedHandlers[0].handler;
      handler("zigbee2mqtt/sensor", { occupancy: true });

      await new Promise((r) => setTimeout(r, 10));
      expect(auto.executeFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("state trigger execution", () => {
    it("calls execute when state changes", async () => {
      const auto = new TestAutomation("test", [{ type: "state", key: "night_mode" }]);
      await manager.register(auto);

      const handler = mocks.stateHandlers[0].handler;
      handler("night_mode", true, false);

      await new Promise((r) => setTimeout(r, 10));
      expect(auto.executeFn).toHaveBeenCalledTimes(1);
    });

    it("skips execution when state filter returns false", async () => {
      const auto = new TestAutomation("test", [
        {
          type: "state",
          key: "night_mode",
          filter: (newVal) => newVal === true,
        },
      ]);
      await manager.register(auto);

      const handler = mocks.stateHandlers[0].handler;
      handler("night_mode", false, true);

      await new Promise((r) => setTimeout(r, 10));
      expect(auto.executeFn).not.toHaveBeenCalled();
    });
  });

  describe("stopAll", () => {
    it("unsubscribes MQTT handlers", async () => {
      const auto = new TestAutomation("test", [{ type: "mqtt", topic: "zigbee2mqtt/sensor" }]);
      await manager.register(auto);
      await manager.stopAll();
      expect(mocks.mqtt.unsubscribe).toHaveBeenCalledTimes(1);
    });

    it("removes state handlers", async () => {
      const auto = new TestAutomation("test", [{ type: "state", key: "mode" }]);
      await manager.register(auto);
      await manager.stopAll();
      expect(mocks.state.offChange).toHaveBeenCalledTimes(1);
    });

    it("removes cron jobs by prefix", async () => {
      const auto = new TestAutomation("my-auto", [{ type: "cron", expression: "0 * * * *" }]);
      await manager.register(auto);
      await manager.stopAll();
      expect(mocks.cron.removeByPrefix).toHaveBeenCalledWith("my-auto:");
    });

    it("calls onStop lifecycle hook", async () => {
      const auto = new TestAutomation("test");
      await manager.register(auto);
      await manager.stopAll();
      expect(auto.onStopFn).toHaveBeenCalledTimes(1);
    });

    it("catches and logs onStop failure without throwing", async () => {
      const auto = new TestAutomation("test");
      auto.onStopFn.mockImplementation(() => Promise.reject(new Error("stop failed")));
      await manager.register(auto);
      // Should not throw
      await manager.stopAll();
    });
  });
});
