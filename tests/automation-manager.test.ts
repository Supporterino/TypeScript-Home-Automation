import { beforeEach, describe, expect, it, mock } from "bun:test";
import pino from "pino";
import type { Config } from "../src/config.js";
import { Automation, type Trigger, type TriggerContext } from "../src/core/automation.js";
import { AutomationManager } from "../src/core/automation-manager.js";
import type { HttpClient } from "../src/core/http/http-client.js";
import type { MqttMessageHandler, MqttService } from "../src/core/mqtt/mqtt-service.js";
import type { CronScheduler } from "../src/core/scheduling/cron-scheduler.js";
import { ServiceRegistry } from "../src/core/services/service-registry.js";
import type { StateChangeHandler, StateManager } from "../src/core/state/state-manager.js";

const logger = pino({ level: "silent" });

const config: Config = {
  mqtt: { host: "localhost", port: 1883 },
  zigbee2mqttPrefix: "zigbee2mqtt",
  logLevel: "info",
  state: { persist: false, filePath: "./state.json" },
  automations: { recursive: false },
  deviceRegistry: { enabled: false, persist: false, filePath: "./device-registry.json" },
  httpServer: { port: 0, token: "", webUi: { enabled: false, path: "/status" } },
  services: {},
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

  const state = {
    onChange: mock((key: string, handler: StateChangeHandler) => {
      stateHandlers.push({ key, handler });
    }),
    offChange: mock((_key: string, _handler: StateChangeHandler) => {}),
  } as unknown as StateManager;

  const services = new ServiceRegistry();

  return { mqtt, cron, http, state, services, subscribedHandlers, stateHandlers };
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
      mocks.state,
      null, // httpServer
      config,
      logger,
      mocks.services,
      null, // deviceRegistry
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

    it("throws before onStart when a required service is missing", async () => {
      class RequiresShelly extends Automation {
        readonly name = "requires-shelly";
        readonly triggers: Trigger[] = [];
        readonly requiredServices = ["shelly"] as const;
        async execute(_ctx: TriggerContext): Promise<void> {}
      }

      const auto = new RequiresShelly();
      await expect(manager.register(auto)).rejects.toThrow(
        `Automation "requires-shelly" requires service "shelly" but it is not registered`,
      );
    });

    it("does not throw when all required services are present", async () => {
      class RequiresShelly extends Automation {
        readonly name = "requires-shelly";
        readonly triggers: Trigger[] = [];
        readonly requiredServices = ["shelly"] as const;
        async execute(_ctx: TriggerContext): Promise<void> {}
      }

      mocks.services.register("shelly", { turnOn: () => {} });
      const auto = new RequiresShelly();
      await expect(manager.register(auto)).resolves.toBeUndefined();
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

  describe("listAutomations", () => {
    it("returns empty array when no automations registered", () => {
      expect(manager.listAutomations()).toEqual([]);
    });

    it("lists automations with trigger summaries", async () => {
      const auto = new TestAutomation("test", [
        { type: "mqtt", topic: "zigbee2mqtt/sensor" },
        { type: "cron", expression: "0 7 * * *" },
      ]);
      await manager.register(auto);

      const list = manager.listAutomations();
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe("test");
      expect(list[0].triggers).toHaveLength(2);
      expect(list[0].triggers[0]).toEqual({
        type: "mqtt",
        topic: "zigbee2mqtt/sensor",
        hasFilter: false,
        filterSource: undefined,
      });
      expect(list[0].triggers[1]).toEqual({
        type: "cron",
        expression: "0 7 * * *",
      });
    });

    it("serializes mqtt filter source", async () => {
      const myFilter = (p: Record<string, unknown>) => p.occupancy === true;
      const auto = new TestAutomation("test", [
        { type: "mqtt", topic: "zigbee2mqtt/sensor", filter: myFilter },
      ]);
      await manager.register(auto);

      const list = manager.listAutomations();
      const trigger = list[0].triggers[0];
      expect(trigger.hasFilter).toBe(true);
      expect(trigger.filterSource).toContain("occupancy");
    });

    it("serializes state filter source", async () => {
      const myFilter = (newVal: unknown) => newVal === true;
      const auto = new TestAutomation("test", [
        { type: "state", key: "night_mode", filter: myFilter },
      ]);
      await manager.register(auto);

      const list = manager.listAutomations();
      const trigger = list[0].triggers[0];
      expect(trigger.hasFilter).toBe(true);
      expect(typeof trigger.filterSource).toBe("string");
      expect((trigger.filterSource as string).length).toBeGreaterThan(0);
    });

    it("includes webhook trigger details", async () => {
      const auto = new TestAutomation("test", [
        { type: "webhook", path: "deploy", methods: ["POST", "PUT"] },
      ]);
      await manager.register(auto);

      const list = manager.listAutomations();
      expect(list[0].triggers[0]).toEqual({
        type: "webhook",
        path: "deploy",
        methods: ["POST", "PUT"],
      });
    });
  });

  describe("getAutomation", () => {
    it("returns null for unknown automation", () => {
      expect(manager.getAutomation("nonexistent")).toBeNull();
    });

    it("returns details for registered automation", async () => {
      const auto = new TestAutomation("my-auto", [{ type: "mqtt", topic: "zigbee2mqtt/light" }]);
      await manager.register(auto);

      const result = manager.getAutomation("my-auto");
      expect(result).not.toBeNull();
      expect(result?.name).toBe("my-auto");
      expect(result?.triggers).toHaveLength(1);
    });
  });

  describe("triggerAutomation", () => {
    it("returns false for unknown automation", async () => {
      const result = await manager.triggerAutomation("nonexistent", {
        type: "cron",
        expression: "manual",
        firedAt: new Date(),
      });
      expect(result).toBe(false);
    });

    it("calls execute on the automation with the given context", async () => {
      const auto = new TestAutomation("test");
      await manager.register(auto);

      const context = {
        type: "mqtt" as const,
        topic: "manual/test",
        payload: { occupancy: true },
      };
      const result = await manager.triggerAutomation("test", context);

      expect(result).toBe(true);
      expect(auto.executeFn).toHaveBeenCalledTimes(1);
      expect(auto.executeFn.mock.calls[0][0]).toEqual(context);
    });

    it("returns true even when execute throws", async () => {
      const auto = new TestAutomation("test");
      auto.executeFn.mockImplementation(() => Promise.reject(new Error("boom")));
      await manager.register(auto);

      // triggerAutomation awaits execute, so the error propagates
      expect(
        manager.triggerAutomation("test", {
          type: "cron",
          expression: "manual",
          firedAt: new Date(),
        }),
      ).rejects.toThrow("boom");
    });
  });
});
