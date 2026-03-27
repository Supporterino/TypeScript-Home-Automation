import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
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
    delete process.env.HEALTH_PORT;
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
      expect(config.state.persist).toBe(false);
      expect(config.state.filePath).toBe("./state.json");
      expect(config.health.port).toBe(0);
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
    it.each(["fatal", "error", "warn", "info", "debug", "trace"] as const)(
      "accepts valid log level '%s'",
      (level) => {
        process.env.LOG_LEVEL = level;
        const config = loadConfig();
        expect(config.logLevel).toBe(level);
      },
    );
  });

  describe("state config", () => {
    it.each([
      ["true", true],
      ["1", true],
      ["yes", true],
      ["false", false],
      ["0", false],
      ["no", false],
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
  });

  describe("health config", () => {
    it("reads and coerces HEALTH_PORT from env", () => {
      process.env.HEALTH_PORT = "8080";
      const config = loadConfig();
      expect(config.health.port).toBe(8080);
    });
  });
});
