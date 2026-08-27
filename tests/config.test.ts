import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all config-related env vars to test defaults
    delete process.env.MQTT_HOST;
    delete process.env.MQTT_PORT;
    delete process.env.ZIGBEE2MQTT_PREFIX;
    delete process.env.LOG_LEVEL;
    delete process.env.STATE_PERSIST;
    delete process.env.STATE_FILE_PATH;
    delete process.env.STATE_FLUSH_MS;
    delete process.env.AUTOMATIONS_RECURSIVE;
    delete process.env.HTTP_PORT;
    delete process.env.DEVICE_REGISTRY_ENABLED;
    delete process.env.DEVICE_REGISTRY_PERSIST;
    delete process.env.DEVICE_REGISTRY_FILE_PATH;
    delete process.env.SHELLY_POLL_MS;
    delete process.env.NANOLEAF_POLL_MS;
  });

  afterEach(() => {
    // Restore original environment
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  describe("defaults", () => {
    it("returns correct defaults when no env vars are set", () => {
      const config = loadConfig();
      expect(config.mqtt.host).toBe("localhost");
      expect(config.mqtt.port).toBe(1883);
      expect(config.zigbee2mqttPrefix).toBe("zigbee2mqtt");
      expect(config.logLevel).toBe("info");
      // Persistence now defaults on: the store holds rooms and automation
      // enabled flags, which must survive a restart (design.md D6, R14).
      expect(config.state.persist).toBe(true);
      expect(config.state.filePath).toBe("./state.json");
      expect(config.state.flushIntervalMs).toBe(1000);
      expect(config.automations.recursive).toBe(false);
      expect(config.httpServer.port).toBe(8080);
      expect(config.deviceRegistry.persist).toBe(true);
      expect(config.services).toEqual({});
    });
  });

  describe("MQTT config", () => {
    it("reads MQTT_HOST from env", () => {
      process.env.MQTT_HOST = "192.168.1.100";
      const config = loadConfig();
      expect(config.mqtt.host).toBe("192.168.1.100");
    });

    it("reads and coerces MQTT_PORT from env", () => {
      process.env.MQTT_PORT = "1884";
      const config = loadConfig();
      expect(config.mqtt.port).toBe(1884);
    });
  });

  describe("Zigbee2MQTT prefix", () => {
    it("reads ZIGBEE2MQTT_PREFIX from env", () => {
      process.env.ZIGBEE2MQTT_PREFIX = "z2m";
      const config = loadConfig();
      expect(config.zigbee2mqttPrefix).toBe("z2m");
    });
  });

  describe("log level", () => {
    it.each([
      "fatal",
      "error",
      "warn",
      "info",
      "debug",
      "trace",
    ] as const)("accepts valid log level '%s'", (level) => {
      process.env.LOG_LEVEL = level;
      const config = loadConfig();
      expect(config.logLevel).toBe(level);
    });
  });

  describe("state config", () => {
    it.each([
      ["true", true],
      ["1", true],
      ["yes", true],
      ["on", true],
      ["TRUE", true],
      ["On", true],
      ["  true  ", true],
      ["false", false],
      ["0", false],
      ["no", false],
      ["off", false],
      ["FALSE", false],
      ["Off", false],
    ] as const)("STATE_PERSIST='%s' parses to %s", (envValue, expected) => {
      process.env.STATE_PERSIST = envValue;
      const config = loadConfig();
      expect(config.state.persist).toBe(expected);
    });

    it("reads STATE_FILE_PATH from env", () => {
      process.env.STATE_FILE_PATH = "/data/state.json";
      const config = loadConfig();
      expect(config.state.filePath).toBe("/data/state.json");
    });

    it("resolves unset STATE_PERSIST to true", () => {
      const config = loadConfig();
      expect(config.state.persist).toBe(true);
    });

    it("STATE_PERSIST='false' resolves to false", () => {
      process.env.STATE_PERSIST = "false";
      const config = loadConfig();
      expect(config.state.persist).toBe(false);
    });

    it("defaults STATE_FLUSH_MS to 1000", () => {
      const config = loadConfig();
      expect(config.state.flushIntervalMs).toBe(1000);
    });

    it("reads an explicit STATE_FLUSH_MS from env", () => {
      process.env.STATE_FLUSH_MS = "5000";
      const config = loadConfig();
      expect(config.state.flushIntervalMs).toBe(5000);
    });

    it("accepts STATE_FLUSH_MS=0", () => {
      process.env.STATE_FLUSH_MS = "0";
      const config = loadConfig();
      expect(config.state.flushIntervalMs).toBe(0);
    });

    it("rejects a negative STATE_FLUSH_MS", () => {
      process.env.STATE_FLUSH_MS = "-5";

      const originalExit = process.exit;
      const originalError = console.error;
      const exitMock = mock(() => {
        throw new Error("process.exit called");
      });
      process.exit = exitMock as unknown as typeof process.exit;
      console.error = mock(() => {});

      try {
        expect(() => loadConfig()).toThrow("process.exit called");
        expect(exitMock).toHaveBeenCalledWith(1);
      } finally {
        process.exit = originalExit;
        console.error = originalError;
      }
    });
  });

  describe("device registry config", () => {
    it("resolves unset DEVICE_REGISTRY_PERSIST to true", () => {
      const config = loadConfig();
      expect(config.deviceRegistry.persist).toBe(true);
    });

    it("DEVICE_REGISTRY_PERSIST='false' resolves to false", () => {
      process.env.DEVICE_REGISTRY_PERSIST = "false";
      const config = loadConfig();
      expect(config.deviceRegistry.persist).toBe(false);
    });

    it("defaults DEVICE_REGISTRY_ENABLED to false", () => {
      const config = loadConfig();
      expect(config.deviceRegistry.enabled).toBe(false);
    });

    it("fails gracefully via process.exit on an invalid boolean value", () => {
      process.env.STATE_PERSIST = "maybe";

      const originalExit = process.exit;
      const originalError = console.error;
      const exitMock = mock(() => {
        throw new Error("process.exit called");
      });
      process.exit = exitMock as unknown as typeof process.exit;
      console.error = mock(() => {});

      try {
        expect(() => loadConfig()).toThrow("process.exit called");
        expect(exitMock).toHaveBeenCalledWith(1);
      } finally {
        process.exit = originalExit;
        console.error = originalError;
      }
    });
  });

  describe("device source poll intervals", () => {
    it("defaults SHELLY_POLL_MS and NANOLEAF_POLL_MS to 10000", () => {
      const config = loadConfig();
      expect(config.devices.shellyPollMs).toBe(10000);
      expect(config.devices.nanoleafPollMs).toBe(10000);
    });

    it("reads explicit SHELLY_POLL_MS and NANOLEAF_POLL_MS from env", () => {
      process.env.SHELLY_POLL_MS = "5000";
      process.env.NANOLEAF_POLL_MS = "20000";
      const config = loadConfig();
      expect(config.devices.shellyPollMs).toBe(5000);
      expect(config.devices.nanoleafPollMs).toBe(20000);
    });

    it("rejects a negative SHELLY_POLL_MS", () => {
      process.env.SHELLY_POLL_MS = "-1";

      const originalExit = process.exit;
      const originalError = console.error;
      const exitMock = mock(() => {
        throw new Error("process.exit called");
      });
      process.exit = exitMock as unknown as typeof process.exit;
      console.error = mock(() => {});

      try {
        expect(() => loadConfig()).toThrow("process.exit called");
        expect(exitMock).toHaveBeenCalledWith(1);
      } finally {
        process.exit = originalExit;
        console.error = originalError;
      }
    });

    it("rejects a zero NANOLEAF_POLL_MS", () => {
      process.env.NANOLEAF_POLL_MS = "0";

      const originalExit = process.exit;
      const originalError = console.error;
      const exitMock = mock(() => {
        throw new Error("process.exit called");
      });
      process.exit = exitMock as unknown as typeof process.exit;
      console.error = mock(() => {});

      try {
        expect(() => loadConfig()).toThrow("process.exit called");
        expect(exitMock).toHaveBeenCalledWith(1);
      } finally {
        process.exit = originalExit;
        console.error = originalError;
      }
    });
  });

  describe("HTTP server config", () => {
    it("reads and coerces HTTP_PORT from env", () => {
      process.env.HTTP_PORT = "9090";
      const config = loadConfig();
      expect(config.httpServer.port).toBe(9090);
    });
  });
});
