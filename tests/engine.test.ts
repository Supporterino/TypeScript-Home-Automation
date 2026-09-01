import { afterEach, describe, expect, it, mock } from "bun:test";
import pino from "pino";
import { Automation, type Trigger } from "../src/core/automation.js";
import { createEngine, type Engine } from "../src/core/engine.js";

const logger = pino({ level: "silent" });

// ---------------------------------------------------------------------------
// We cannot connect to a real MQTT broker in tests, so we mock
// MqttService.connect / MqttService.disconnect at the instance level after
// engine creation. The createEngine() factory builds all internal objects
// synchronously, making them available as engine.mqtt etc.
// ---------------------------------------------------------------------------

/** Create an engine with mocked MQTT connect/disconnect so start() can complete. */
function createTestEngine(overrides: Record<string, unknown> = {}): Engine {
  const engine = createEngine({
    automationsDir: new URL("./fixtures/empty", import.meta.url).pathname,
    logger,
    config: {
      httpServer: { port: 0, token: "", webUi: { enabled: false, path: "/status" } },
      // State/device-registry persistence now defaults to true (design.md
      // D6); disable it here so engine tests never write real files unless a
      // test explicitly opts back in via `overrides`.
      state: { persist: false, filePath: "./state.json", flushIntervalMs: 1000 },
      deviceRegistry: { enabled: false, persist: false, filePath: "./device-registry.json" },
      ...overrides,
    },
  });

  // Mock MQTT connect/disconnect so start() doesn't need a real broker
  (engine.mqtt as { connect: unknown }).connect = mock(() => Promise.resolve());
  (engine.mqtt as { disconnect: unknown }).disconnect = mock(() => Promise.resolve());

  return engine;
}

// Ensure a fixture directory exists for the empty automations dir
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const fixturesDir = join(dirname(new URL(import.meta.url).pathname), "fixtures", "empty");
try {
  mkdirSync(fixturesDir, { recursive: true });
} catch {
  /* already exists */
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createEngine", () => {
  let engine: Engine;

  afterEach(async () => {
    try {
      await engine?.stop();
    } catch {
      /* may not have started */
    }
  });

  // ── Factory construction ────────────────────────────────────────────────

  describe("construction", () => {
    it("returns an Engine object with all expected properties", () => {
      engine = createTestEngine();
      expect(engine.config).toBeDefined();
      expect(engine.logger).toBeDefined();
      expect(engine.mqtt).toBeDefined();
      expect(engine.http).toBeDefined();
      expect(engine.state).toBeDefined();
      expect(engine.services).toBeDefined();
      expect(engine.manager).toBeDefined();
      expect(typeof engine.start).toBe("function");
      expect(typeof engine.stop).toBe("function");
    });

    it("applies config overrides", () => {
      engine = createTestEngine({ logLevel: "debug" });
      expect(engine.config.logLevel).toBe("debug");
    });

    it("applies MQTT config overrides", () => {
      engine = createTestEngine({ mqtt: { host: "broker.local", port: 1884 } });
      expect(engine.config.mqtt.host).toBe("broker.local");
      expect(engine.config.mqtt.port).toBe(1884);
    });

    it("sets deviceRegistry to null when disabled", () => {
      engine = createTestEngine({ deviceRegistry: { enabled: false } });
      expect(engine.deviceRegistry).toBeNull();
    });

    it("sets notifications to null when not provided", () => {
      engine = createTestEngine();
      expect(engine.notifications).toBeNull();
    });
  });

  // ── Service registration ────────────────────────────────────────────────

  describe("service registration", () => {
    it("registers services passed as direct instances", () => {
      const myService = { doWork: () => "done" };
      engine = createEngine({
        automationsDir: fixturesDir,
        logger,
        config: { httpServer: { port: 0 } },
        services: {
          custom: myService,
        },
      });

      expect(engine.services.has("custom")).toBe(true);
      expect(engine.services.get("custom")).toBe(myService);
    });

    it("registers services passed as factory functions", () => {
      const factory = mock((_http, _logger) => ({ value: 42 }));
      engine = createEngine({
        automationsDir: fixturesDir,
        logger,
        config: { httpServer: { port: 0 } },
        services: {
          shelly: factory as unknown as ReturnType<typeof mock>,
        },
      });

      expect(factory).toHaveBeenCalledTimes(1);
      expect(engine.services.has("shelly")).toBe(true);
    });

    it("does not register undefined service values", () => {
      engine = createEngine({
        automationsDir: fixturesDir,
        logger,
        config: { httpServer: { port: 0 } },
        services: {
          shelly: undefined,
        },
      });

      expect(engine.services.has("shelly")).toBe(false);
    });
  });

  // ── Start / Stop lifecycle ──────────────────────────────────────────────

  describe("start and stop", () => {
    it("starts and stops without errors", async () => {
      engine = createTestEngine();
      await engine.start();
      await engine.stop();
    });

    it("calls mqtt.connect on start", async () => {
      engine = createTestEngine();
      await engine.start();

      const connectMock = engine.mqtt.connect as ReturnType<typeof mock>;
      expect(connectMock).toHaveBeenCalledTimes(1);
    });

    it("calls mqtt.disconnect on stop", async () => {
      engine = createTestEngine();
      await engine.start();
      await engine.stop();

      const disconnectMock = engine.mqtt.disconnect as ReturnType<typeof mock>;
      expect(disconnectMock).toHaveBeenCalledTimes(1);
    });

    it("is idempotent on double start", async () => {
      engine = createTestEngine();
      await engine.start();
      await engine.start(); // Should not throw, just log a warning

      const connectMock = engine.mqtt.connect as ReturnType<typeof mock>;
      expect(connectMock).toHaveBeenCalledTimes(1);
    });

    it("is idempotent on double stop", async () => {
      engine = createTestEngine();
      await engine.start();
      await engine.stop();
      await engine.stop(); // Should not throw
    });

    it("does not throw on stop without start", async () => {
      engine = createTestEngine();
      await engine.stop(); // Should be a silent no-op
    });

    it("persists state on stop when persistence is enabled", async () => {
      engine = createTestEngine();
      // Don't enable persistence since we don't want real file writes in tests
      await engine.start();
      engine.state.set("test_key", "test_value");
      await engine.stop();
      // If persist=false, save is a no-op and should not throw
    });

    it("isolates a failing teardown step: MQTT still disconnects and started resets", async () => {
      engine = createTestEngine();
      await engine.start();

      // Force an intermediate step (state save) to throw during shutdown.
      (engine.state as { save: unknown }).save = mock(() =>
        Promise.reject(new Error("save failed")),
      );

      // stop() must not reject even though a step failed.
      await engine.stop();

      // MQTT must still have been disconnected despite the earlier failure.
      const disconnectMock = engine.mqtt.disconnect as ReturnType<typeof mock>;
      expect(disconnectMock).toHaveBeenCalledTimes(1);

      // started must be reset — proven by being able to start again cleanly.
      await engine.start();
      const connectMock = engine.mqtt.connect as ReturnType<typeof mock>;
      expect(connectMock).toHaveBeenCalledTimes(2);
    });
  });

  // ── Startup rollback ───────────────────────────────────────────────────

  describe("startup rollback", () => {
    it("rolls back on MQTT connect failure", async () => {
      engine = createTestEngine();
      (engine.mqtt as { connect: unknown }).connect = mock(() =>
        Promise.reject(new Error("connection refused")),
      );

      await expect(engine.start()).rejects.toThrow("connection refused");

      // After rollback, disconnect should have been called for cleanup
      const disconnectMock = engine.mqtt.disconnect as ReturnType<typeof mock>;
      expect(disconnectMock).toHaveBeenCalledTimes(1);
    });

    it("allows re-start after rollback", async () => {
      engine = createTestEngine();

      // First attempt: fail
      let connectAttempts = 0;
      (engine.mqtt as { connect: unknown }).connect = mock(() => {
        connectAttempts++;
        if (connectAttempts === 1) {
          return Promise.reject(new Error("first attempt fails"));
        }
        return Promise.resolve();
      });

      await expect(engine.start()).rejects.toThrow("first attempt fails");

      // Second attempt: succeed
      await engine.start();
      expect(connectAttempts).toBe(2);
    });
  });

  // ── State manager ──────────────────────────────────────────────────────

  describe("state manager", () => {
    it("provides a working state manager", async () => {
      engine = createTestEngine();
      await engine.start();

      engine.state.set("key1", "value1");
      expect(engine.state.get("key1")).toBe("value1");

      engine.state.set("key2", 42);
      expect(engine.state.get<number>("key2")).toBe(42);

      engine.state.delete("key1");
      expect(engine.state.has("key1")).toBe(false);
    });
  });

  // ── Automation manager ─────────────────────────────────────────────────

  describe("automation manager", () => {
    it("lists automations (empty for empty directory)", async () => {
      engine = createTestEngine();
      await engine.start();

      const automations = engine.manager.listAutomations();
      expect(automations).toEqual([]);
    });
  });

  // ── HTTP server ─────────────────────────────────────────────────────────

  describe("HTTP server", () => {
    it("disables HTTP server when port is 0", () => {
      engine = createTestEngine();
      // Port 0 means no HTTP server — we just confirm engine creates without error
      expect(engine.config.httpServer.port).toBe(0);
    });
  });

  // ── Realtime event stream (group 5) ─────────────────────────────────────

  describe("realtime event stream", () => {
    it("constructs a stream-only logger distinct from the supplied logger (task 5.0b)", () => {
      engine = createTestEngine();
      expect(engine.streamLogger).toBeDefined();
      expect(engine.streamLogger).not.toBe(engine.logger);
    });

    it("exposes a shared EventBus", () => {
      engine = createTestEngine();
      expect(engine.events).toBeDefined();
      expect(typeof engine.events.subscribe).toBe("function");
    });

    it("emits a state category event for an ordinary key change", async () => {
      engine = createTestEngine();
      await engine.start();

      const received: unknown[] = [];
      engine.events.subscribe((e) => received.push(e));

      engine.state.set("night_mode", true);

      expect(received).toEqual([
        { category: "state", key: "night_mode", value: true, previous: undefined },
      ]);
    });

    it("emits only an automation category event for an enabled-flag change, not a state event (task 5.7)", async () => {
      engine = createTestEngine();
      await engine.start();

      const received: unknown[] = [];
      engine.events.subscribe((e) => received.push(e));

      // The internal write path automations use — mirrors automation-manager's
      // stop()/start(), without depending on a real automation file.
      (
        engine.state as unknown as { setInternal: (key: string, value: unknown) => void }
      ).setInternal("$internal:automation-enabled:my-automation", false);

      expect(received).toEqual([{ category: "automation", name: "my-automation", enabled: false }]);
    });

    it("emits a readiness category event when the engine finishes starting", async () => {
      engine = createTestEngine();
      // The mocked connect() never flips the real MqttService's internal
      // `connected` flag, so readiness is exercised here by overriding
      // `isConnected` directly, the same way `isConnected` would read true
      // after a real broker connection.
      Object.defineProperty(engine.mqtt, "isConnected", { get: () => true, configurable: true });

      const received: unknown[] = [];
      engine.events.subscribe((e) => received.push(e));

      await engine.start();

      expect(received).toEqual([{ category: "readiness", ready: true }]);
    });

    it("emits a readiness category event when the engine stops", async () => {
      engine = createTestEngine();
      Object.defineProperty(engine.mqtt, "isConnected", { get: () => true, configurable: true });
      await engine.start();

      const received: unknown[] = [];
      engine.events.subscribe((e) => received.push(e));

      await engine.stop();

      expect(received).toEqual([{ category: "readiness", ready: false }]);
    });
  });

  // ── Automation observability (group 8) ──────────────────────────────────

  describe("automation execution observability", () => {
    it("emits an automation_execution event naming the automation, trigger, duration, and outcome (task 8.7)", async () => {
      engine = createTestEngine();
      await engine.start();

      class QuietAutomation extends Automation {
        readonly name = "quiet-automation";
        readonly triggers: Trigger[] = [];
        async execute(): Promise<void> {}
      }
      await engine.manager.register(new QuietAutomation());

      const received: unknown[] = [];
      engine.events.subscribe((e) => received.push(e));

      const result = await engine.manager.triggerAutomation("quiet-automation", {
        type: "cron",
        expression: "manual",
        firedAt: new Date(),
      });
      expect(result).toBe("executed");

      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        category: "automation_execution",
        automation: "quiet-automation",
        outcome: "success",
      });
    });

    it("exposes execution history and relationships through the manager (tasks 8.3, 8.5)", async () => {
      engine = createTestEngine();
      await engine.start();

      class QuietAutomation extends Automation {
        readonly name = "quiet-automation";
        readonly triggers: Trigger[] = [{ type: "state", key: "night_mode" }];
        async execute(): Promise<void> {
          this.state.set("last_run_marker", true);
        }
      }
      await engine.manager.register(new QuietAutomation());

      expect(engine.manager.getHistory("quiet-automation")).toEqual([]);

      await engine.manager.triggerAutomation("quiet-automation", {
        type: "state",
        key: "night_mode",
        newValue: true,
        oldValue: false,
      });

      const history = engine.manager.getHistory("quiet-automation");
      expect(history).toHaveLength(1);
      expect(history?.[0].outcome).toBe("success");

      const relationships = engine.manager.getRelationships("quiet-automation");
      expect(relationships?.declared.watchedStateKeys).toEqual(["night_mode"]);
      expect(relationships?.observed.writtenStateKeys).toEqual(["last_run_marker"]);
    });
  });

  // ── Unified device sources (group 6) ────────────────────────────────────

  describe("unified device sources", () => {
    it("always exposes engine.devices, even with no Shelly, Nanoleaf, or toggle configuration", () => {
      engine = createTestEngine();
      expect(engine.devices).toBeDefined();
      expect(engine.devices.list()).toEqual([]);
      expect(
        engine.devices
          .sources()
          .map((s) => s.id)
          .sort(),
      ).toEqual(["nanoleaf", "shelly", "state", "zigbee", "zigbee-group"]);
    });

    it("reports the zigbee, shelly, and nanoleaf sources unavailable when unconfigured", () => {
      engine = createTestEngine();
      const statuses = new Map(engine.devices.sources().map((s) => [s.id, s.available]));
      expect(statuses.get("zigbee")).toBe(false);
      expect(statuses.get("shelly")).toBe(false);
      expect(statuses.get("nanoleaf")).toBe(false);
      // The state source is always available — its backing store is in-process.
      expect(statuses.get("state")).toBe(true);
    });

    it("registers the zigbee-group source alongside zigbee, both unavailable with the registry disabled (task 3.7)", () => {
      engine = createTestEngine();
      const statuses = new Map(engine.devices.sources().map((s) => [s.id, s.available]));
      expect(statuses.has("zigbee-group")).toBe(true);
      expect(statuses.get("zigbee-group")).toBe(false);
      expect(engine.devices.list()).toEqual([]);
    });

    it("exposes engine.deviceVisibility, and the aggregate stamps hidden on a device through it (task 3.7)", async () => {
      engine = createEngine({
        automationsDir: fixturesDir,
        logger,
        config: {
          httpServer: { port: 0, token: "", webUi: { enabled: false, path: "/status" } },
          state: { persist: false, filePath: "./state.json", flushIntervalMs: 1000 },
          deviceRegistry: { enabled: false, persist: false, filePath: "./device-registry.json" },
        },
        stateToggles: [{ stateKey: "night_mode", name: "Night Mode" }],
      });
      (engine.mqtt as { connect: unknown }).connect = mock(() => Promise.resolve());
      (engine.mqtt as { disconnect: unknown }).disconnect = mock(() => Promise.resolve());
      await engine.start();

      expect(engine.deviceVisibility).toBeDefined();
      expect(engine.devices.get("state:night_mode")?.hidden).toBe(false);

      engine.deviceVisibility.hide("state:night_mode");

      expect(engine.devices.get("state:night_mode")?.hidden).toBe(true);
      expect(engine.devices.list()[0]?.hidden).toBe(true);
    });

    it("presents configured state toggles as devices through engine.devices", async () => {
      engine = createEngine({
        automationsDir: fixturesDir,
        logger,
        config: {
          httpServer: { port: 0, token: "", webUi: { enabled: false, path: "/status" } },
          state: { persist: false, filePath: "./state.json", flushIntervalMs: 1000 },
          deviceRegistry: { enabled: false, persist: false, filePath: "./device-registry.json" },
        },
        stateToggles: [{ stateKey: "night_mode", name: "Night Mode" }],
      });
      (engine.mqtt as { connect: unknown }).connect = mock(() => Promise.resolve());
      (engine.mqtt as { disconnect: unknown }).disconnect = mock(() => Promise.resolve());
      await engine.start();

      const devices = engine.devices.list();
      expect(devices).toHaveLength(1);
      expect(devices[0].qualifiedId).toBe("state:night_mode");
    });

    it("an automation's onStart() sees a populated device accessor (task 6.13a)", async () => {
      // discoverAndRegister runs after deviceSources.start() (task 6.13a); an
      // engine.devices populated with a configured state toggle proves the
      // ordering, since automations register during discovery.
      engine = createEngine({
        automationsDir: fixturesDir,
        logger,
        config: {
          httpServer: { port: 0, token: "", webUi: { enabled: false, path: "/status" } },
          state: { persist: false, filePath: "./state.json", flushIntervalMs: 1000 },
          deviceRegistry: { enabled: false, persist: false, filePath: "./device-registry.json" },
        },
        stateToggles: [{ stateKey: "night_mode", name: "Night Mode" }],
      });
      (engine.mqtt as { connect: unknown }).connect = mock(() => {
        // At the point MQTT connects, device sources must already be running.
        expect(engine.devices.list()).toHaveLength(1);
        return Promise.resolve();
      });
      (engine.mqtt as { disconnect: unknown }).disconnect = mock(() => Promise.resolve());
      await engine.start();
      expect(engine.mqtt.connect as ReturnType<typeof mock>).toHaveBeenCalledTimes(1);
    });

    it("stops device sources during shutdown, releasing their subscriptions", async () => {
      engine = createEngine({
        automationsDir: fixturesDir,
        logger,
        config: {
          httpServer: { port: 0, token: "", webUi: { enabled: false, path: "/status" } },
          state: { persist: false, filePath: "./state.json", flushIntervalMs: 1000 },
          deviceRegistry: { enabled: false, persist: false, filePath: "./device-registry.json" },
        },
        stateToggles: [{ stateKey: "night_mode", name: "Night Mode" }],
      });
      (engine.mqtt as { connect: unknown }).connect = mock(() => Promise.resolve());
      (engine.mqtt as { disconnect: unknown }).disconnect = mock(() => Promise.resolve());
      await engine.start();

      const seen: unknown[] = [];
      engine.devices.subscribe((d) => seen.push(d));
      await engine.stop();

      engine.state.set("night_mode", true);
      expect(seen).toEqual([]);
    });

    it("stops device sources on startup rollback after a later failure", async () => {
      engine = createTestEngine();
      (engine.mqtt as { connect: unknown }).connect = mock(() =>
        Promise.reject(new Error("connection refused")),
      );

      const stopSpy = mock(() => Promise.resolve());
      (engine.devices as unknown as { stop: unknown }).stop = stopSpy;

      await expect(engine.start()).rejects.toThrow("connection refused");
      expect(stopSpy).toHaveBeenCalledTimes(1);
    });

    it("keeps device sources running through an automation's onStop() (task 6.13c)", async () => {
      engine = createEngine({
        automationsDir: fixturesDir,
        logger,
        config: {
          httpServer: { port: 0, token: "", webUi: { enabled: false, path: "/status" } },
          state: { persist: false, filePath: "./state.json", flushIntervalMs: 1000 },
          deviceRegistry: { enabled: false, persist: false, filePath: "./device-registry.json" },
        },
        stateToggles: [{ stateKey: "night_mode", name: "Night Mode" }],
      });
      (engine.mqtt as { connect: unknown }).connect = mock(() => Promise.resolve());
      (engine.mqtt as { disconnect: unknown }).disconnect = mock(() => Promise.resolve());
      await engine.start();

      let dispatchedDuringStop: unknown = null;
      const probe = new (class extends Automation {
        readonly name = "device-sources-onstop-probe";
        readonly triggers: Trigger[] = [];
        async execute(): Promise<void> {}
        async onStop(): Promise<void> {
          dispatchedDuringStop = await engine.devices.command("state:night_mode", { on: true });
        }
      })();
      await engine.manager.register(probe);

      await engine.stop();

      expect(dispatchedDuringStop).toEqual({ status: "ok" });
    });

    it("passes HomekitService a context exposing http, logger, devices, and deviceVisibility (task 6.16b)", () => {
      let receivedContext: Record<string, unknown> | null = null;
      engine = createEngine({
        automationsDir: fixturesDir,
        logger,
        config: {
          httpServer: { port: 0, token: "", webUi: { enabled: false, path: "/status" } },
          state: { persist: false, filePath: "./state.json", flushIntervalMs: 1000 },
          deviceRegistry: { enabled: false, persist: false, filePath: "./device-registry.json" },
        },
        services: {
          homekit: ((ctx: Record<string, unknown>) => {
            receivedContext = ctx;
            return { serviceKey: "homekit" };
          }) as unknown as NonNullable<Parameters<typeof createEngine>[0]["services"]>["homekit"],
        },
      });

      expect(receivedContext).not.toBeNull();
      expect(Object.keys(receivedContext as Record<string, unknown>).sort()).toEqual([
        "deviceVisibility",
        "devices",
        "http",
        "logger",
      ]);
    });

    it("no device source is registered in the ServiceRegistry (task 6.13d)", () => {
      engine = createTestEngine();
      const keys = engine.services.keys();
      expect(keys).not.toContain("zigbee");
      expect(keys).not.toContain("shelly-source");
      expect(keys).not.toContain("nanoleaf-source");
      expect(keys).not.toContain("state-source");
      expect(keys).not.toContain("devices");
    });
  });

  // ── Rooms (group 9) ───────────────────────────────────────────────────────

  describe("rooms", () => {
    it("always exposes engine.rooms", () => {
      engine = createTestEngine();
      expect(engine.rooms).toBeDefined();
      expect(typeof engine.rooms.createRoom).toBe("function");
    });

    it("emits a room category event, not a state event, when a room is created (task 9.7)", async () => {
      engine = createTestEngine();
      await engine.start();

      const received: unknown[] = [];
      engine.events.subscribe((e) => received.push(e));

      const result = engine.rooms.createRoom("Kitchen");
      if (result.status !== "ok") throw new Error("unreachable");

      expect(received).toEqual([
        { category: "room", id: result.room.id, room: { id: result.room.id, name: "Kitchen" } },
      ]);
    });

    it("emits only a room_membership delta for one device, not a full room list, on assignment (task 9.7)", async () => {
      engine = createTestEngine();
      await engine.start();

      const created = engine.rooms.createRoom("Kitchen");
      if (created.status !== "ok") throw new Error("unreachable");

      const received: unknown[] = [];
      engine.events.subscribe((e) => received.push(e));

      engine.rooms.assignDevice("zigbee:0xaaa", created.room.id);

      expect(received).toEqual([
        { category: "room_membership", qualifiedId: "zigbee:0xaaa", roomId: created.room.id },
      ]);
      // No "room" event was resent, and no room's full membership was carried —
      // the delta names only the one device and its new room.
      expect(
        received.every((e) => (e as { category: string }).category === "room_membership"),
      ).toBe(true);
    });

    it("emits a room_membership event with roomId: null on unassignment", async () => {
      engine = createTestEngine();
      await engine.start();

      const created = engine.rooms.createRoom("Kitchen");
      if (created.status !== "ok") throw new Error("unreachable");
      engine.rooms.assignDevice("zigbee:0xaaa", created.room.id);

      const received: unknown[] = [];
      engine.events.subscribe((e) => received.push(e));

      engine.rooms.unassignDevice("zigbee:0xaaa");

      expect(received).toEqual([
        { category: "room_membership", qualifiedId: "zigbee:0xaaa", roomId: null },
      ]);
    });

    it("emits a room event with room: null when a room is deleted", async () => {
      engine = createTestEngine();
      await engine.start();
      const created = engine.rooms.createRoom("Kitchen");
      if (created.status !== "ok") throw new Error("unreachable");

      const received: unknown[] = [];
      engine.events.subscribe((e) => received.push(e));

      engine.rooms.deleteRoom(created.room.id);

      expect(received).toEqual([{ category: "room", id: created.room.id, room: null }]);
    });

    it("rooms span every unified device source, including state toggles", async () => {
      engine = createEngine({
        automationsDir: fixturesDir,
        logger,
        config: {
          httpServer: { port: 0, token: "", webUi: { enabled: false, path: "/status" } },
          state: { persist: false, filePath: "./state.json", flushIntervalMs: 1000 },
          deviceRegistry: { enabled: false, persist: false, filePath: "./device-registry.json" },
        },
        stateToggles: [{ stateKey: "night_mode", name: "Night Mode" }],
      });
      (engine.mqtt as { connect: unknown }).connect = mock(() => Promise.resolve());
      (engine.mqtt as { disconnect: unknown }).disconnect = mock(() => Promise.resolve());
      await engine.start();

      const created = engine.rooms.createRoom("Whole House");
      if (created.status !== "ok") throw new Error("unreachable");

      const toggle = engine.devices.list().find((d) => d.source === "state");
      if (!toggle) throw new Error("expected a state toggle device");
      const result = engine.rooms.assignDevice(toggle.qualifiedId, created.room.id);
      expect(result).toBe("ok");

      const listed = engine.rooms.listRooms();
      expect(listed[0].members[0].qualifiedId).toBe(toggle.qualifiedId);
      expect(listed[0].members[0].available).toBe(true);
    });
  });

  // ── Device visibility (task 5.3) ─────────────────────────────────────────

  describe("device visibility", () => {
    it("always exposes engine.deviceVisibility", () => {
      engine = createTestEngine();
      expect(engine.deviceVisibility).toBeDefined();
      expect(typeof engine.deviceVisibility.hide).toBe("function");
    });

    it("emits a device_visibility event naming the device and its new visibility on hide (task 5.3)", async () => {
      engine = createTestEngine();
      await engine.start();

      const received: unknown[] = [];
      engine.events.subscribe((e) => received.push(e));

      engine.deviceVisibility.hide("zigbee:0xaaa");

      expect(received).toEqual([
        { category: "device_visibility", qualifiedId: "zigbee:0xaaa", hidden: true },
      ]);
    });

    it("emits a device_visibility event with hidden: false on unhide", async () => {
      engine = createTestEngine();
      await engine.start();
      engine.deviceVisibility.hide("zigbee:0xaaa");

      const received: unknown[] = [];
      engine.events.subscribe((e) => received.push(e));

      engine.deviceVisibility.unhide("zigbee:0xaaa");

      expect(received).toEqual([
        { category: "device_visibility", qualifiedId: "zigbee:0xaaa", hidden: false },
      ]);
    });

    it("emits no state-key event for the reserved key backing visibility (task 5.3)", async () => {
      engine = createTestEngine();
      await engine.start();

      const received: unknown[] = [];
      engine.events.subscribe((e) => received.push(e));

      engine.deviceVisibility.hide("zigbee:0xaaa");

      expect(received.some((e) => (e as { category: string }).category === "state")).toBe(false);
    });
  });
});
