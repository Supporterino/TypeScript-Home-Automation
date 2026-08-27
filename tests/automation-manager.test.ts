import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pino from "pino";
import type { Config } from "../src/config.js";
import { Automation, type Trigger, type TriggerContext } from "../src/core/automation.js";
import { AutomationManager, automationEnabledKey } from "../src/core/automation-manager.js";
import type { HttpClient } from "../src/core/http/http-client.js";
import type { HttpServer, WebhookHandler } from "../src/core/http/http-server.js";
import type { MqttMessageHandler, MqttService } from "../src/core/mqtt/mqtt-service.js";
import type { CronScheduler } from "../src/core/scheduling/cron-scheduler.js";
import { ServiceRegistry } from "../src/core/services/service-registry.js";
import { type StateChangeHandler, StateManager } from "../src/core/state/state-manager.js";

const logger = pino({ level: "silent" });

/** Absolute path to the real Automation base class, for generated fixture files. */
const AUTOMATION_BASE_PATH = resolve(import.meta.dir, "../src/core/automation.js");

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
    onAnyChange: mock((_handler: StateChangeHandler) => {}),
    offAnyChange: mock((_handler: StateChangeHandler) => {}),
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

    it("calls onStop during rollback when onStart throws", async () => {
      const auto = new TestAutomation("test", [{ type: "mqtt", topic: "zigbee2mqtt/sensor" }]);
      auto.onStartFn.mockImplementation(() => Promise.reject(new Error("start failed")));

      await manager.register(auto);

      // onStop must be invoked so any partial resources are released.
      expect(auto.onStopFn).toHaveBeenCalledTimes(1);
      // The wired trigger must be unwound and the automation removed.
      expect(mocks.mqtt.unsubscribe).toHaveBeenCalledTimes(1);
      expect(manager.getAutomation("test")).toBeNull();
    });

    it("swallows onStop errors during rollback", async () => {
      const auto = new TestAutomation("test");
      auto.onStartFn.mockImplementation(() => Promise.reject(new Error("start failed")));
      auto.onStopFn.mockImplementation(() => Promise.reject(new Error("stop failed")));

      // Should not throw despite both hooks rejecting.
      await manager.register(auto);
      expect(auto.onStopFn).toHaveBeenCalledTimes(1);
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
      expect(result).toBe("not_found");
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

      expect(result).toBe("executed");
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

// ── Group 3: automation control plane (enable/disable, source, discovery) ──

/**
 * Writes a fixture automation file to `dir`. Its `execute()` increments a
 * public state counter `<name>:executed-count`, and its `onStart()` sets
 * `<name>:started` — both readable from tests without needing a live
 * instance reference, so behaviour survives across disable/enable cycles and
 * process-simulated restarts (a fresh `StateManager` reused across manager
 * instances).
 *
 * `onStartBody` may reference `this.state` to make `onStart()` conditionally
 * throw (task 3.6's failed-enable scenario).
 */
async function writeAutomationFixture(
  dir: string,
  fileName: string,
  opts: { name: string; triggersSource?: string; onStartBody?: string },
): Promise<string> {
  const { name, triggersSource = "[]", onStartBody = "" } = opts;
  const filePath = join(dir, fileName);
  const source = `
import { Automation } from ${JSON.stringify(AUTOMATION_BASE_PATH)};

export default class extends Automation {
  readonly name = ${JSON.stringify(name)};
  readonly triggers = ${triggersSource};

  async execute(context) {
    const key = ${JSON.stringify(name)} + ":executed-count";
    this.state.set(key, (this.state.get(key) ?? 0) + 1);
  }

  async onStart() {
    ${onStartBody}
    // A fresh onStart() re-initialises this automation's own counters,
    // demonstrating that a fresh instance is genuinely fresh rather than
    // continuing to accumulate into a shared state key across restarts.
    this.state.set(${JSON.stringify(name)} + ":executed-count", 0);
    this.state.set(${JSON.stringify(name)} + ":started", true);
  }
}
`;
  await writeFile(filePath, source, "utf-8");
  return filePath;
}

/** A not-a-valid-Automation fixture file, for discovery's skip-on-invalid path. */
async function writeInvalidFixture(dir: string, fileName: string): Promise<string> {
  const filePath = join(dir, fileName);
  await writeFile(filePath, "export default class NotAnAutomation {}\n", "utf-8");
  return filePath;
}

/** Real (non-mocked) dependencies for tests that exercise discovery, restart
 * simulation, or the persisted enabled flag — a lightweight mqtt/cron mock
 * plus a genuine in-memory `StateManager`. */
function createRealDeps() {
  const state = new StateManager(logger, { persist: false });
  const mqtt = {
    subscribe: mock((_topic: string, _handler: MqttMessageHandler) => {}),
    unsubscribe: mock((_topic: string, _handler: MqttMessageHandler) => {}),
  } as unknown as MqttService;
  const cron = {
    schedule: mock((_id: string, _expr: string, _cb: () => void) => {}),
    removeByPrefix: mock((_prefix: string) => {}),
    stopAll: mock(() => {}),
  } as unknown as CronScheduler;
  const http = {} as HttpClient;
  const services = new ServiceRegistry();
  return { state, mqtt, cron, http, services };
}

function createManagerWithDeps(
  deps: ReturnType<typeof createRealDeps>,
  httpServer: HttpServer | null = null,
): AutomationManager {
  return new AutomationManager(
    deps.mqtt,
    deps.cron,
    deps.http,
    deps.state,
    httpServer,
    config,
    logger,
    deps.services,
    null,
  );
}

describe("AutomationManager — control plane (group 3)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "ts-ha-automations-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("discoverAndRegister — file path retention (3.1)", () => {
    it("retains the resolved file path by name, and skips invalid files without retaining anything", async () => {
      const deps = createRealDeps();
      const manager = createManagerWithDeps(deps);
      const validPath = await writeAutomationFixture(tmpDir, "valid.ts", { name: "valid-auto" });
      await writeInvalidFixture(tmpDir, "invalid.ts");

      await manager.discoverAndRegister(tmpDir);

      expect(manager.listAutomations()).toHaveLength(1);
      expect(manager.getAutomation("valid-auto")).not.toBeNull();

      const source = await manager.getSource("valid-auto");
      expect(source).toEqual({ status: "found", source: await readFile(validPath, "utf-8") });
    });
  });

  describe("unwire reuse across rollback and stop() (3.2, 3.3)", () => {
    it("rollback on onStart failure and stop() release the same resources", async () => {
      const deps = createRealDeps();
      const manager = createManagerWithDeps(deps);

      // Path A: onStart failure during register() unwires and removes.
      const failPath = await writeAutomationFixture(tmpDir, "fail.ts", {
        name: "fail-auto",
        triggersSource: '[{ type: "mqtt", topic: "zigbee2mqtt/sensor" }]',
        onStartBody: 'throw new Error("boom");',
      });
      const failModule = await import(failPath);
      const failInstance = new failModule.default();
      await manager.register(failInstance, { filePath: failPath });
      expect(deps.mqtt.unsubscribe).toHaveBeenCalledTimes(1);
      expect(manager.getAutomation("fail-auto")).toBeNull();

      // Path B: stop() on a successfully started automation unwires the same way.
      const okPath = await writeAutomationFixture(tmpDir, "ok.ts", {
        name: "ok-auto",
        triggersSource: '[{ type: "mqtt", topic: "zigbee2mqtt/other" }]',
      });
      const okModule = await import(okPath);
      const okInstance = new okModule.default();
      await manager.register(okInstance, { filePath: okPath });
      expect(deps.mqtt.unsubscribe).toHaveBeenCalledTimes(1); // not yet, for this automation
      await manager.stop("ok-auto");
      expect(deps.mqtt.unsubscribe).toHaveBeenCalledTimes(2); // now both automations unwound once each
      expect(manager.getAutomation("ok-auto")?.enabled).toBe(false);
    });

    it("a shared MQTT topic stays active for the other subscriber when one is disabled", async () => {
      const deps = createRealDeps();
      const manager = createManagerWithDeps(deps);

      class SharedAuto extends Automation {
        readonly name: string;
        readonly triggers: Trigger[] = [{ type: "mqtt", topic: "zigbee2mqtt/shared" }];
        readonly executeFn = mock((_ctx: TriggerContext) => Promise.resolve());
        constructor(name: string) {
          super();
          this.name = name;
        }
        async execute(context: TriggerContext): Promise<void> {
          return this.executeFn(context);
        }
      }

      const a = new SharedAuto("shared-a");
      const b = new SharedAuto("shared-b");
      await manager.register(a);
      await manager.register(b);

      await manager.stop("shared-a");

      // b's handler is still registered — invoke it directly to prove it survives.
      const calls = (deps.mqtt.subscribe as ReturnType<typeof mock>).mock.calls;
      const bSubscribeCall = calls[1];
      bSubscribeCall[1]("zigbee2mqtt/shared", {});

      expect(b.executeFn).toHaveBeenCalledTimes(1);
      expect(a.executeFn).not.toHaveBeenCalled();
    });
  });

  describe("stop(name) (3.4)", () => {
    it("stops triggers firing and disables even when onStop throws", async () => {
      class Flaky extends Automation {
        readonly name = "flaky";
        readonly triggers: Trigger[] = [{ type: "mqtt", topic: "zigbee2mqtt/flaky" }];
        readonly executeFn = mock((_ctx: TriggerContext) => Promise.resolve());
        async execute(context: TriggerContext): Promise<void> {
          return this.executeFn(context);
        }
        async onStop(): Promise<void> {
          throw new Error("stop failed");
        }
      }

      const deps = createRealDeps();
      const manager = createManagerWithDeps(deps);
      const auto = new Flaky();
      await manager.register(auto);

      const result = await manager.stop("flaky");
      expect(result).toBe("stopped");
      expect(manager.getAutomation("flaky")?.enabled).toBe(false);

      // Firing the (now-unsubscribed) handler manually must not reach execute.
      const call = (deps.mqtt.subscribe as ReturnType<typeof mock>).mock.calls[0];
      expect(deps.mqtt.unsubscribe).toHaveBeenCalledWith(call[0], call[1]);
    });

    it("returns not_found for an unknown automation", async () => {
      const deps = createRealDeps();
      const manager = createManagerWithDeps(deps);
      expect(await manager.stop("nope")).toBe("not_found");
    });

    it("is a no-op without side effects when already stopped", async () => {
      const deps = createRealDeps();
      const manager = createManagerWithDeps(deps);
      const auto = new TestAutomation("idempotent");
      await manager.register(auto);
      await manager.stop("idempotent");
      const before = deps.state.get(automationEnabledKey("idempotent"));
      await manager.stop("idempotent");
      expect(deps.state.get(automationEnabledKey("idempotent"))).toBe(before);
    });
  });

  describe("start(name) (3.5, 3.6)", () => {
    it("constructs a fresh instance with reset internal state and preserves trigger order", async () => {
      const deps = createRealDeps();
      const manager = createManagerWithDeps(deps);
      const filePath = await writeAutomationFixture(tmpDir, "counter.ts", {
        name: "counter-auto",
        triggersSource:
          '[{ type: "cron", expression: "0 1 * * *" }, { type: "cron", expression: "0 2 * * *" }]',
      });
      const module = await import(filePath);
      const instance = new module.default();
      await manager.register(instance, { filePath });

      // Declared trigger order preserved: two cron jobs scheduled in order.
      const cronCalls = (deps.cron.schedule as ReturnType<typeof mock>).mock.calls;
      expect(cronCalls[0][1]).toBe("0 1 * * *");
      expect(cronCalls[1][1]).toBe("0 2 * * *");

      await manager.triggerAutomation("counter-auto", {
        type: "cron",
        expression: "manual",
        firedAt: new Date(),
      });
      expect(deps.state.get("counter-auto:executed-count")).toBe(1);

      await manager.stop("counter-auto");
      const result = await manager.start("counter-auto");
      expect(result).toEqual({ status: "started" });

      // A fresh instance's execute() starts counting from zero again.
      await manager.triggerAutomation("counter-auto", {
        type: "cron",
        expression: "manual",
        firedAt: new Date(),
      });
      expect(deps.state.get("counter-auto:executed-count")).toBe(1);

      // Trigger order is preserved across the restart too.
      const cronCallsAfter = (deps.cron.schedule as ReturnType<typeof mock>).mock.calls;
      expect(cronCallsAfter[2][1]).toBe("0 1 * * *");
      expect(cronCallsAfter[3][1]).toBe("0 2 * * *");
    });

    it("returns not_found for an unknown automation", async () => {
      const deps = createRealDeps();
      const manager = createManagerWithDeps(deps);
      expect(await manager.start("nope")).toEqual({ status: "not_found" });
    });

    it("is a no-op success when already started", async () => {
      const deps = createRealDeps();
      const manager = createManagerWithDeps(deps);
      const auto = new TestAutomation("already-on");
      await manager.register(auto);
      expect(await manager.start("already-on")).toEqual({ status: "started" });
      expect(auto.onStartFn).toHaveBeenCalledTimes(1); // not called again
    });

    it("a stopped name is not treated as a duplicate on re-registration", async () => {
      const deps = createRealDeps();
      const manager = createManagerWithDeps(deps);
      const first = new TestAutomation("dup");
      await manager.register(first);
      await manager.stop("dup");

      const second = new TestAutomation("dup");
      await expect(manager.register(second)).resolves.toBeUndefined();
      expect(manager.getAutomation("dup")?.enabled).toBe(true);
    });

    it("a failed start unwinds partial wiring and leaves the automation stopped", async () => {
      const deps = createRealDeps();
      const manager = createManagerWithDeps(deps);
      const filePath = await writeAutomationFixture(tmpDir, "flaky-start.ts", {
        name: "flaky-start",
        triggersSource: '[{ type: "mqtt", topic: "zigbee2mqtt/flaky-start" }]',
        onStartBody: 'if (this.state.get("fail-on-start")) throw new Error("start boom");',
      });
      const module = await import(filePath);
      const instance = new module.default();
      await manager.register(instance, { filePath }); // succeeds — fail-on-start unset
      await manager.stop("flaky-start");

      deps.state.set("fail-on-start", true);
      const result = await manager.start("flaky-start");
      expect(result.status).toBe("error");
      expect(manager.getAutomation("flaky-start")?.enabled).toBe(false);

      // The mqtt trigger from the failed start attempt must have been unwound.
      const subscribeCalls = (deps.mqtt.subscribe as ReturnType<typeof mock>).mock.calls.length;
      const unsubscribeCalls = (deps.mqtt.unsubscribe as ReturnType<typeof mock>).mock.calls.length;
      expect(unsubscribeCalls).toBe(subscribeCalls);
    });
  });

  describe("webhook conflict on start (3.7)", () => {
    it("fails start() with a descriptive error when the path was claimed while stopped, leaving the existing route intact", async () => {
      const deps = createRealDeps();
      const registerWebhook = mock(
        (_path: string, _methods: string[], _handler: WebhookHandler) => {},
      );
      const removeWebhook = mock((_path: string) => {});
      const httpServer = { registerWebhook, removeWebhook } as unknown as HttpServer;
      const manager = createManagerWithDeps(deps, httpServer);

      // Real automations always have zero-arg constructors (discovery
      // constructs them via `new AutomationClass()`), which matters here:
      // `start()` re-constructs from the cached constructor with no args.
      class HookA extends Automation {
        readonly name = "hook-a";
        readonly triggers: Trigger[] = [{ type: "webhook", path: "shared-path" }];
        async execute(): Promise<void> {}
      }
      class HookB extends Automation {
        readonly name = "hook-b";
        readonly triggers: Trigger[] = [{ type: "webhook", path: "shared-path" }];
        async execute(): Promise<void> {}
      }

      const a = new HookA();
      await manager.register(a);
      await manager.stop("hook-a");
      expect(removeWebhook).toHaveBeenCalledWith("shared-path");

      const b = new HookB();
      await manager.register(b); // claims the now-free path

      const result = await manager.start("hook-a");
      expect(result.status).toBe("error");
      expect(manager.getAutomation("hook-a")?.enabled).toBe(false);
      // a's initial registration and b's claim are the only two calls — the
      // failed restart of a must not have added a third.
      expect(registerWebhook).toHaveBeenCalledTimes(2);
      expect(registerWebhook).toHaveBeenCalledWith("shared-path", ["POST"], expect.anything());
    });
  });

  describe("enabled flag persistence and discovery (3.8)", () => {
    it("defaults to enabled, persists disabling, and restores it as inert-but-listed across a simulated restart", async () => {
      const deps = createRealDeps();
      await writeAutomationFixture(tmpDir, "auto-a.ts", {
        name: "auto-a",
        triggersSource: '[{ type: "mqtt", topic: "zigbee2mqtt/auto-a" }]',
      });

      const managerBefore = createManagerWithDeps(deps);
      await managerBefore.discoverAndRegister(tmpDir);
      expect(managerBefore.getAutomation("auto-a")?.enabled).toBe(true);

      await managerBefore.stop("auto-a");
      expect(deps.state.get(automationEnabledKey("auto-a"))).toBe(false);

      // Simulate a restart: a fresh manager, the same (persisted) state store.
      deps.state.delete("auto-a:started"); // clear the mark left by the first onStart
      const managerAfter = createManagerWithDeps(deps);
      await managerAfter.discoverAndRegister(tmpDir);

      const restored = managerAfter.getAutomation("auto-a");
      expect(restored).not.toBeNull();
      expect(restored?.enabled).toBe(false);
      // No triggers wired and onStart not invoked for the disabled automation.
      expect(deps.state.get("auto-a:started")).toBeUndefined();
    });
  });

  describe("stale enabled-flag reaping (3.8b)", () => {
    it("discards a stale flag naming no discovered automation, retains a live one, and never reaps an empty scan", async () => {
      const deps = createRealDeps();
      deps.state.setInternal(automationEnabledKey("ghost"), false);
      deps.state.setInternal(automationEnabledKey("auto-a"), false);

      // Empty discovery (no files at all) must not reap anything.
      const emptyDir = await mkdtemp(join(tmpdir(), "ts-ha-empty-"));
      try {
        const managerEmpty = createManagerWithDeps(deps);
        await managerEmpty.discoverAndRegister(emptyDir);
        expect(deps.state.get(automationEnabledKey("ghost"))).toBe(false);
        expect(deps.state.get(automationEnabledKey("auto-a"))).toBe(false);
      } finally {
        await rm(emptyDir, { recursive: true, force: true });
      }

      // A successful scan that finds auto-a (but never ghost) reaps only ghost.
      await writeAutomationFixture(tmpDir, "auto-a.ts", { name: "auto-a" });
      const manager = createManagerWithDeps(deps);
      await manager.discoverAndRegister(tmpDir);

      expect(deps.state.get(automationEnabledKey("ghost"))).toBeUndefined();
      expect(deps.state.get(automationEnabledKey("auto-a"))).toBe(false);
      expect(manager.getAutomation("auto-a")?.enabled).toBe(false);
    });
  });

  describe("manual trigger honours disabled state (3.8c)", () => {
    it("refuses a disabled automation with a conflict distinguishable from not-found, and executes an enabled one normally", async () => {
      const deps = createRealDeps();
      const manager = createManagerWithDeps(deps);
      const auto = new TestAutomation("triggerable");
      await manager.register(auto);

      expect(
        await manager.triggerAutomation("triggerable", {
          type: "cron",
          expression: "manual",
          firedAt: new Date(),
        }),
      ).toBe("executed");
      expect(auto.executeFn).toHaveBeenCalledTimes(1);

      await manager.stop("triggerable");
      expect(
        await manager.triggerAutomation("triggerable", {
          type: "cron",
          expression: "manual",
          firedAt: new Date(),
        }),
      ).toBe("disabled");
      expect(auto.executeFn).toHaveBeenCalledTimes(1); // not called again

      expect(
        await manager.triggerAutomation("does-not-exist", {
          type: "cron",
          expression: "manual",
          firedAt: new Date(),
        }),
      ).toBe("not_found");
    });
  });

  describe("automation summary carries enabled state (3.9)", () => {
    it("reports enabled in both listAutomations and getAutomation", async () => {
      const deps = createRealDeps();
      const manager = createManagerWithDeps(deps);
      const auto = new TestAutomation("summarized");
      await manager.register(auto);

      expect(manager.listAutomations()[0].enabled).toBe(true);
      expect(manager.getAutomation("summarized")?.enabled).toBe(true);

      await manager.stop("summarized");
      expect(manager.listAutomations()[0].enabled).toBe(false);
      expect(manager.getAutomation("summarized")?.enabled).toBe(false);
    });
  });

  describe("source retrieval by name only (3.10)", () => {
    it("returns the file contents for a known automation, not_found for an unknown one, and an error for a deleted file", async () => {
      const deps = createRealDeps();
      const manager = createManagerWithDeps(deps);
      const filePath = await writeAutomationFixture(tmpDir, "sourced.ts", { name: "sourced" });
      const module = await import(filePath);
      await manager.register(new module.default(), { filePath });

      const found = await manager.getSource("sourced");
      expect(found).toEqual({ status: "found", source: await readFile(filePath, "utf-8") });

      expect(await manager.getSource("nonexistent")).toEqual({ status: "not_found" });

      await unlink(filePath);
      const afterDelete = await manager.getSource("sourced");
      expect(afterDelete.status).toBe("error");
    });

    it("has no parameter through which a caller could supply a file path directly", () => {
      // getSource(name: string) — the only addressing mechanism is the
      // retained-path map keyed by automation name (design.md D5).
      expect(AutomationManager.prototype.getSource.length).toBe(1);
    });
  });

  describe("enabled flag cannot be set by writing raw state (3.11)", () => {
    it("rejects a direct raw-state write and leaves triggers unwired", async () => {
      const deps = createRealDeps();
      const manager = createManagerWithDeps(deps);
      const auto = new TestAutomation("guarded", [{ type: "mqtt", topic: "zigbee2mqtt/guarded" }]);
      await manager.register(auto);
      await manager.stop("guarded");

      expect(() => deps.state.set(automationEnabledKey("guarded"), true)).toThrow();
      expect(manager.getAutomation("guarded")?.enabled).toBe(false);
      // No new subscribe call happened as a side effect of the rejected write.
      expect(deps.mqtt.subscribe).toHaveBeenCalledTimes(1);
    });
  });
});

describe("AutomationManager — observability (group 8)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "ts-ha-automations-observability-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("execution history (tasks 8.1, 8.3)", () => {
    it("returns an empty history for an automation that has never run", async () => {
      const mocks = createMocks();
      const manager = new AutomationManager(
        mocks.mqtt,
        mocks.cron,
        mocks.http,
        mocks.state,
        null,
        config,
        logger,
        mocks.services,
        null,
      );
      const auto = new TestAutomation("idle", []);
      await manager.register(auto);

      expect(manager.getHistory("idle")).toEqual([]);
    });

    it("returns null for an unknown automation", () => {
      const mocks = createMocks();
      const manager = new AutomationManager(
        mocks.mqtt,
        mocks.cron,
        mocks.http,
        mocks.state,
        null,
        config,
        logger,
        mocks.services,
        null,
      );
      expect(manager.getHistory("nonexistent")).toBeNull();
    });

    it("records a successful MQTT-triggered run in history", async () => {
      const mocks = createMocks();
      const manager = new AutomationManager(
        mocks.mqtt,
        mocks.cron,
        mocks.http,
        mocks.state,
        null,
        config,
        logger,
        mocks.services,
        null,
      );
      const auto = new TestAutomation("test", [{ type: "mqtt", topic: "zigbee2mqtt/sensor" }]);
      await manager.register(auto);

      mocks.subscribedHandlers[0].handler("zigbee2mqtt/sensor", { occupancy: true });
      await new Promise((r) => setTimeout(r, 10));

      const history = manager.getHistory("test");
      expect(history).toHaveLength(1);
      expect(history?.[0].outcome).toBe("success");
      expect(history?.[0].trigger).toMatchObject({ type: "mqtt", topic: "zigbee2mqtt/sensor" });
    });

    it("records a failed run's error message without disrupting the manager's own error handling", async () => {
      const mocks = createMocks();
      const manager = new AutomationManager(
        mocks.mqtt,
        mocks.cron,
        mocks.http,
        mocks.state,
        null,
        config,
        logger,
        mocks.services,
        null,
      );
      const auto = new TestAutomation("failing", [{ type: "mqtt", topic: "zigbee2mqtt/sensor" }]);
      auto.executeFn.mockImplementation(() => Promise.reject(new Error("execute failed")));
      await manager.register(auto);

      mocks.subscribedHandlers[0].handler("zigbee2mqtt/sensor", {});
      await new Promise((r) => setTimeout(r, 10));

      const history = manager.getHistory("failing");
      expect(history).toHaveLength(1);
      expect(history?.[0].outcome).toBe("failure");
      expect(history?.[0].error).toBe("execute failed");
    });

    it("records a manually-triggered run via triggerAutomation()", async () => {
      const mocks = createMocks();
      const manager = new AutomationManager(
        mocks.mqtt,
        mocks.cron,
        mocks.http,
        mocks.state,
        null,
        config,
        logger,
        mocks.services,
        null,
      );
      const auto = new TestAutomation("manual", []);
      await manager.register(auto);

      const result = await manager.triggerAutomation("manual", {
        type: "cron",
        expression: "manual",
        firedAt: new Date(),
      });

      expect(result).toBe("executed");
      const history = manager.getHistory("manual");
      expect(history).toHaveLength(1);
      expect(history?.[0].outcome).toBe("success");
    });
  });

  describe("state write attribution (task 8.2)", () => {
    it("attributes a state write made during an automation's execute() to that automation", async () => {
      const deps = createRealDeps();
      const manager = createManagerWithDeps(deps);
      class WritesState extends Automation {
        readonly name = "writer";
        readonly triggers: Trigger[] = [{ type: "mqtt", topic: "zigbee2mqtt/sensor" }];
        async execute(): Promise<void> {
          this.state.set("lights_on", true);
        }
      }
      await manager.register(new WritesState());

      const subscribeCalls = (deps.mqtt.subscribe as unknown as ReturnType<typeof mock>).mock
        .calls as [string, MqttMessageHandler][];
      const handler = subscribeCalls[0][1];
      handler("zigbee2mqtt/sensor", {});
      await new Promise((r) => setTimeout(r, 10));

      expect(manager.getRelationships("writer")?.observed.writtenStateKeys).toEqual(["lights_on"]);
    });

    it("does not attribute an API write made outside any automation run", () => {
      const deps = createRealDeps();
      const manager = createManagerWithDeps(deps);
      deps.state.set("some_key", true);
      // No automation was executing, so nothing observed it.
      expect(manager.getRelationships("anything")).toBeNull();
    });
  });

  describe("declared relationships (task 8.5)", () => {
    it("reports related devices and watched state keys for a never-run enabled automation", async () => {
      const deps = createRealDeps();
      const manager = createManagerWithDeps(deps);

      class RichAutomation extends Automation {
        readonly name = "rich";
        readonly triggers: Trigger[] = [
          { type: "mqtt", topic: "zigbee2mqtt/hallway_sensor" },
          { type: "device_state", friendlyName: "kitchen_light" },
          { type: "device_joined" },
          { type: "state", key: "night_mode" },
        ];
        async execute(): Promise<void> {}
      }

      // Not yet registered — relationships cannot be reported for an
      // unknown automation.
      expect(manager.getRelationships("rich")).toBeNull();

      // Registered but never triggered — relationships must still be
      // reported in full (design.md D11).
      await manager.register(new RichAutomation());

      const result = manager.getRelationships("rich");
      expect(result).not.toBeNull();
      expect(result?.declared.relatedDevices.sort()).toEqual(["hallway_sensor", "kitchen_light"]);
      expect(result?.declared.watchedStateKeys).toEqual(["night_mode"]);
      expect(result?.observed.writtenStateKeys).toEqual([]);
      expect(result?.observed.truncated).toBe(false);
    });

    it("reports each declared required service's current registration status, including one that is not registered", async () => {
      // A disabled automation is never validated at startup (design.md D4),
      // so this is the natural way for a declared required service to be
      // unregistered without the fail-fast startup check throwing first —
      // an operator inspecting a disabled automation's relationships before
      // deciding whether to re-enable it.
      const deps = createRealDeps();
      deps.services.register("shelly", {});
      const manager = createManagerWithDeps(deps);
      const filePath = join(tmpDir, "rich.ts");
      await writeFile(
        filePath,
        `
import { Automation } from ${JSON.stringify(AUTOMATION_BASE_PATH)};

export default class extends Automation {
  readonly name = "rich";
  readonly requiredServices = ["shelly", "nanoleaf"];
  readonly triggers = [];
  async execute() {}
}
`,
        "utf-8",
      );
      deps.state.setInternal(automationEnabledKey("rich"), false);

      await manager.discoverAndRegister(tmpDir);

      expect(manager.getAutomation("rich")?.enabled).toBe(false);
      const result = manager.getRelationships("rich");
      expect(result?.declared.requiredServices).toEqual(
        expect.arrayContaining([
          { name: "shelly", registered: true },
          { name: "nanoleaf", registered: false },
        ]),
      );
    });

    it("returns null for an unknown automation", () => {
      const deps = createRealDeps();
      const manager = createManagerWithDeps(deps);
      expect(manager.getRelationships("nonexistent")).toBeNull();
    });
  });

  describe("execution completion broadcasts (task 8.7)", () => {
    it("notifies the shared execution recorder's completion listeners", async () => {
      const mocks = createMocks();
      const manager = new AutomationManager(
        mocks.mqtt,
        mocks.cron,
        mocks.http,
        mocks.state,
        null,
        config,
        logger,
        mocks.services,
        null,
      );
      const events: { automation: string; outcome: string }[] = [];
      manager.getExecutionRecorder().onCompletion((e) => events.push(e));

      const auto = new TestAutomation("test", [{ type: "mqtt", topic: "zigbee2mqtt/sensor" }]);
      await manager.register(auto);
      mocks.subscribedHandlers[0].handler("zigbee2mqtt/sensor", {});
      await new Promise((r) => setTimeout(r, 10));

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ automation: "test", outcome: "success" });
    });
  });
});
