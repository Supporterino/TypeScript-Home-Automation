import { beforeEach, describe, expect, it, mock } from "bun:test";
import pino from "pino";
import type { Config } from "../src/config.js";
import { type MqttMessageHandler, MqttService } from "../src/core/mqtt/mqtt-service.js";

const logger = pino({ level: "silent" });

const config: Config = {
  mqtt: { host: "localhost", port: 1883, username: "", password: "" },
  zigbee2mqttPrefix: "zigbee2mqtt",
  logLevel: "info",
  state: { persist: false, filePath: "./state.json" },
  automations: { recursive: false },
  deviceRegistry: { enabled: false, persist: false, filePath: "./device-registry.json" },
  httpServer: { port: 0, token: "", webUi: { enabled: false, path: "/status" } },
  services: {},
};

// ---------------------------------------------------------------------------
// Test MqttService's subscribe/unsubscribe/dispatch logic WITHOUT connecting
// to a real broker. The `dispatch()` method is private, so we access it via
// the message event handler that `connect()` wires up — but since we cannot
// connect in tests, we'll directly test the subscription tracking +
// dispatch by calling the private method through a cast.
// ---------------------------------------------------------------------------

type DispatchableMqtt = MqttService & {
  dispatch(topic: string, message: Buffer): void;
};

describe("MqttService", () => {
  let service: DispatchableMqtt;

  beforeEach(() => {
    service = new MqttService(config, logger) as DispatchableMqtt;
  });

  // ── Subscribe / Unsubscribe ─────────────────────────────────────────────

  describe("subscribe and unsubscribe", () => {
    it("registers an exact handler and dispatches to it", () => {
      const handler = mock((_topic: string, _payload: Record<string, unknown>) => {});
      service.subscribe("test/topic", handler);

      service.dispatch("test/topic", Buffer.from(JSON.stringify({ value: 42 })));

      expect(handler).toHaveBeenCalledTimes(1);
      const [topic, payload] = handler.mock.calls[0];
      expect(topic).toBe("test/topic");
      expect(payload).toEqual({ value: 42 });
    });

    it("registers a wildcard handler and dispatches to it", () => {
      const handler = mock((_topic: string, _payload: Record<string, unknown>) => {});
      service.subscribe("zigbee2mqtt/+/set", handler);

      service.dispatch("zigbee2mqtt/lamp/set", Buffer.from(JSON.stringify({ state: "ON" })));

      expect(handler).toHaveBeenCalledTimes(1);
      const [topic, payload] = handler.mock.calls[0];
      expect(topic).toBe("zigbee2mqtt/lamp/set");
      expect(payload).toEqual({ state: "ON" });
    });

    it("does not dispatch to a handler after unsubscribe", () => {
      const handler = mock((_topic: string, _payload: Record<string, unknown>) => {});
      service.subscribe("test/topic", handler);
      service.unsubscribe("test/topic", handler);

      service.dispatch("test/topic", Buffer.from(JSON.stringify({ value: 1 })));

      expect(handler).not.toHaveBeenCalled();
    });

    it("removes only the specified handler when multiple are subscribed", () => {
      const handler1 = mock((_topic: string, _payload: Record<string, unknown>) => {});
      const handler2 = mock((_topic: string, _payload: Record<string, unknown>) => {});

      service.subscribe("test/topic", handler1);
      service.subscribe("test/topic", handler2);
      service.unsubscribe("test/topic", handler1);

      service.dispatch("test/topic", Buffer.from(JSON.stringify({ value: 1 })));

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it("removes wildcard handler on unsubscribe", () => {
      const handler = mock((_topic: string, _payload: Record<string, unknown>) => {});
      service.subscribe("zigbee2mqtt/#", handler);
      service.unsubscribe("zigbee2mqtt/#", handler);

      service.dispatch("zigbee2mqtt/sensor", Buffer.from(JSON.stringify({ state: "ON" })));

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ── Dispatch behavior ───────────────────────────────────────────────────

  describe("dispatch", () => {
    it("does not parse JSON when no handlers match", () => {
      // Subscribe to a different topic
      const handler = mock((_topic: string, _payload: Record<string, unknown>) => {});
      service.subscribe("other/topic", handler);

      // Dispatch to unsubscribed topic — should be a no-op
      service.dispatch("test/topic", Buffer.from("invalid json"));

      expect(handler).not.toHaveBeenCalled();
    });

    it("falls back to { raw: message } when JSON parse fails", () => {
      const handler = mock((_topic: string, _payload: Record<string, unknown>) => {});
      service.subscribe("test/topic", handler);

      service.dispatch("test/topic", Buffer.from("not json"));

      expect(handler).toHaveBeenCalledTimes(1);
      const [, payload] = handler.mock.calls[0];
      expect(payload).toEqual({ raw: "not json" });
    });

    it("dispatches to both exact and wildcard handlers for the same message", () => {
      const exactHandler = mock((_topic: string, _payload: Record<string, unknown>) => {});
      const wildcardHandler = mock((_topic: string, _payload: Record<string, unknown>) => {});

      service.subscribe("zigbee2mqtt/sensor_a", exactHandler);
      service.subscribe("zigbee2mqtt/+", wildcardHandler);

      service.dispatch("zigbee2mqtt/sensor_a", Buffer.from(JSON.stringify({ occupancy: true })));

      expect(exactHandler).toHaveBeenCalledTimes(1);
      expect(wildcardHandler).toHaveBeenCalledTimes(1);
    });

    it("dispatches to multiple exact handlers for the same topic", () => {
      const handler1 = mock((_topic: string, _payload: Record<string, unknown>) => {});
      const handler2 = mock((_topic: string, _payload: Record<string, unknown>) => {});

      service.subscribe("test/topic", handler1);
      service.subscribe("test/topic", handler2);

      service.dispatch("test/topic", Buffer.from(JSON.stringify({ value: 1 })));

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it("does not match wildcard handler on non-matching topic", () => {
      const handler = mock((_topic: string, _payload: Record<string, unknown>) => {});
      service.subscribe("zigbee2mqtt/+/set", handler);

      // This topic has no trailing /set so it should not match
      service.dispatch("zigbee2mqtt/lamp", Buffer.from(JSON.stringify({ value: 1 })));

      expect(handler).not.toHaveBeenCalled();
    });

    it("matches multi-level wildcard (#)", () => {
      const handler = mock((_topic: string, _payload: Record<string, unknown>) => {});
      service.subscribe("zigbee2mqtt/#", handler);

      service.dispatch("zigbee2mqtt/sensor/deep/path", Buffer.from(JSON.stringify({ value: 1 })));

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // ── Error isolation in dispatch ─────────────────────────────────────────

  describe("error isolation", () => {
    it("catches synchronous handler errors and continues to next handler", () => {
      const badHandler = mock(() => {
        throw new Error("sync boom");
      }) as unknown as MqttMessageHandler;

      const goodHandler = mock((_topic: string, _payload: Record<string, unknown>) => {});

      service.subscribe("test/topic", badHandler);
      service.subscribe("test/topic", goodHandler);

      // Should not throw despite first handler throwing
      service.dispatch("test/topic", Buffer.from(JSON.stringify({ value: 1 })));

      expect(goodHandler).toHaveBeenCalledTimes(1);
    });

    it("catches async handler rejections", async () => {
      const asyncHandler = mock(async (_topic: string, _payload: Record<string, unknown>) => {
        throw new Error("async boom");
      }) as unknown as MqttMessageHandler;

      service.subscribe("test/topic", asyncHandler);

      // Should not throw — the rejection is caught internally
      service.dispatch("test/topic", Buffer.from(JSON.stringify({ value: 1 })));

      // Wait a tick for the promise rejection to be caught
      await new Promise((r) => setTimeout(r, 10));

      expect(asyncHandler).toHaveBeenCalledTimes(1);
    });

    it("catches async wildcard handler rejections", async () => {
      const asyncHandler = mock(async (_topic: string, _payload: Record<string, unknown>) => {
        throw new Error("wildcard async boom");
      }) as unknown as MqttMessageHandler;

      service.subscribe("test/#", asyncHandler);

      service.dispatch("test/topic", Buffer.from(JSON.stringify({ value: 1 })));

      await new Promise((r) => setTimeout(r, 10));

      expect(asyncHandler).toHaveBeenCalledTimes(1);
    });

    it("continues to wildcard handlers after exact handler throws", () => {
      const badExact = mock(() => {
        throw new Error("exact boom");
      }) as unknown as MqttMessageHandler;

      const wildcardHandler = mock((_topic: string, _payload: Record<string, unknown>) => {});

      service.subscribe("test/topic", badExact);
      service.subscribe("test/+", wildcardHandler);

      service.dispatch("test/topic", Buffer.from(JSON.stringify({ value: 1 })));

      expect(wildcardHandler).toHaveBeenCalledTimes(1);
    });
  });

  // ── Publish ─────────────────────────────────────────────────────────────

  describe("publish", () => {
    it("does not throw when not connected", () => {
      // No client connected — publish should log error and return silently
      expect(() => service.publish("test/topic", { value: 1 })).not.toThrow();
    });

    it("does not throw when publishToDevice is called without connection", () => {
      expect(() => service.publishToDevice("lamp", { state: "ON" })).not.toThrow();
    });
  });

  // ── Device topic helpers ────────────────────────────────────────────────

  describe("device helpers", () => {
    it("builds a device topic with the configured prefix", () => {
      expect(service.deviceTopic("sensor_a")).toBe("zigbee2mqtt/sensor_a");
    });

    it("builds a device topic with a custom prefix", () => {
      const customConfig = { ...config, zigbee2mqttPrefix: "z2m" };
      const customService = new MqttService(customConfig, logger);
      expect(customService.deviceTopic("lamp")).toBe("z2m/lamp");
    });
  });

  // ── Connection state ────────────────────────────────────────────────────

  describe("connection state", () => {
    it("starts as not connected", () => {
      expect(service.isConnected).toBe(false);
    });
  });

  // ── MQTT credentials config ─────────────────────────────────────────────

  describe("credentials config", () => {
    it("accepts config with username and password", () => {
      const authConfig = {
        ...config,
        mqtt: { ...config.mqtt, username: "user", password: "pass" },
      };
      const authService = new MqttService(authConfig, logger);
      // Just verify it constructs without error
      expect(authService.isConnected).toBe(false);
    });
  });

  // ── Reference counting ─────────────────────────────────────────────────

  describe("reference counting", () => {
    it("allows multiple handlers on the same topic without duplicating broker subscriptions", () => {
      const handler1 = mock((_topic: string, _payload: Record<string, unknown>) => {});
      const handler2 = mock((_topic: string, _payload: Record<string, unknown>) => {});

      service.subscribe("test/topic", handler1);
      service.subscribe("test/topic", handler2);

      // Unsubscribe one — the other should still receive messages
      service.unsubscribe("test/topic", handler1);

      service.dispatch("test/topic", Buffer.from(JSON.stringify({ value: 1 })));

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });
});
