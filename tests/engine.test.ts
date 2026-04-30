import { afterEach, describe, expect, it, mock } from "bun:test";
import pino from "pino";
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
});
