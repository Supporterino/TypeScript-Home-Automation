import { describe, expect, it, mock } from "bun:test";
import pino from "pino";
import type { Config } from "../src/config.js";
import { Automation, type Trigger, type TriggerContext } from "../src/core/automation.js";
import type { HttpClient } from "../src/core/http-client.js";
import type { MqttService } from "../src/core/mqtt-service.js";
import type { NanoleafService } from "../src/core/nanoleaf-service.js";
import type { NotificationService } from "../src/core/notification-service.js";
import type { ShellyService } from "../src/core/shelly-service.js";
import type { StateManager } from "../src/core/state-manager.js";

const logger = pino({ level: "silent" });

/** Concrete test subclass to access protected members. */
class TestAutomation extends Automation {
  readonly name = "test-automation";
  readonly triggers: Trigger[] = [];
  readonly executeMock = mock((_ctx: TriggerContext) => Promise.resolve());

  async execute(context: TriggerContext): Promise<void> {
    this.executeMock(context);
  }

  // Expose protected members for testing
  getMqtt() {
    return this.mqtt;
  }
  getShelly() {
    return this.shelly;
  }
  getHttp() {
    return this.http;
  }
  getState() {
    return this.state;
  }
  getLogger() {
    return this.logger;
  }
  getConfig() {
    return this.config;
  }
  async callNotify(options: Parameters<Automation["notify"]>[0]) {
    return this.notify(options);
  }
}

function createMocks() {
  const mqtt = {} as MqttService;
  const shelly = {} as ShellyService;
  const nanoleaf = {} as NanoleafService;
  const http = {} as HttpClient;
  const state = {} as StateManager;
  const config = {
    mqtt: { host: "localhost", port: 1883 },
    zigbee2mqttPrefix: "zigbee2mqtt",
    logLevel: "info" as const,
    state: { persist: false, filePath: "./state.json" },
    automations: { recursive: false },
    httpServer: { port: 0, token: "" },
  } satisfies Config;

  return { mqtt, shelly, nanoleaf, http, state, config };
}

describe("Automation base class", () => {
  it("_inject sets all protected properties", () => {
    const auto = new TestAutomation();
    const { mqtt, shelly, nanoleaf, http, state, config } = createMocks();

    auto._inject(mqtt, shelly, nanoleaf, http, state, logger, config, null);

    expect(auto.getMqtt()).toBe(mqtt);
    expect(auto.getShelly()).toBe(shelly);
    expect(auto.getHttp()).toBe(http);
    expect(auto.getState()).toBe(state);
    expect(auto.getLogger()).toBeDefined();
    expect(auto.getConfig()).toBe(config);
  });

  it("notify delegates to notification service when configured", async () => {
    const auto = new TestAutomation();
    const { mqtt, shelly, nanoleaf, http, state, config } = createMocks();
    const sendMock = mock(() => Promise.resolve());
    const notifications: NotificationService = { send: sendMock };

    auto._inject(mqtt, shelly, nanoleaf, http, state, logger, config, notifications);

    const options = { title: "Test", message: "Hello" };
    await auto.callNotify(options);

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(options);
  });

  it("notify does not throw when no notification service is configured", async () => {
    const auto = new TestAutomation();
    const { mqtt, shelly, nanoleaf, http, state, config } = createMocks();

    auto._inject(mqtt, shelly, nanoleaf, http, state, logger, config, null);

    // Should not throw
    await auto.callNotify({ title: "Test", message: "Hello" });
  });

  it("onStart default implementation resolves", async () => {
    const auto = new TestAutomation();
    await expect(auto.onStart()).resolves.toBeUndefined();
  });

  it("onStop default implementation resolves", async () => {
    const auto = new TestAutomation();
    await expect(auto.onStop()).resolves.toBeUndefined();
  });
});
