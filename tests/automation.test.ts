import { describe, expect, it, mock } from "bun:test";
import pino from "pino";
import type { Config } from "../src/config.js";
import {
  Automation,
  type AutomationContext,
  type Trigger,
  type TriggerContext,
} from "../src/core/automation.js";
import type { HttpClient } from "../src/core/http/http-client.js";
import type { MqttService } from "../src/core/mqtt/mqtt-service.js";
import type { NanoleafService } from "../src/core/services/nanoleaf-service.js";
import type { ShellyService } from "../src/core/services/shelly-service.js";
import type { StateManager } from "../src/core/state/state-manager.js";
import type { NotificationService } from "../src/types/notification.js";

const _logger = pino({ level: "silent" });

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

function createMockContext(overrides: Partial<AutomationContext> = {}): AutomationContext {
  const config: Config = {
    mqtt: { host: "localhost", port: 1883 },
    zigbee2mqttPrefix: "zigbee2mqtt",
    logLevel: "info",
    state: { persist: false, filePath: "./state.json" },
    automations: { recursive: false },
    httpServer: { port: 0, token: "", webUi: { enabled: false, path: "/status" } },
  };
  return {
    mqtt: {} as MqttService,
    shelly: {} as ShellyService,
    nanoleaf: {} as NanoleafService,
    http: {} as HttpClient,
    state: {} as StateManager,
    logger: pino({ level: "silent" }),
    config,
    notifications: null,
    weather: null,
    ...overrides,
  };
}

describe("Automation base class", () => {
  it("_inject sets all protected properties", () => {
    const auto = new TestAutomation();
    const ctx = createMockContext();

    auto._inject(ctx);

    expect(auto.getMqtt()).toBe(ctx.mqtt);
    expect(auto.getShelly()).toBe(ctx.shelly);
    expect(auto.getHttp()).toBe(ctx.http);
    expect(auto.getState()).toBe(ctx.state);
    expect(auto.getLogger()).toBeDefined();
    expect(auto.getConfig()).toBe(ctx.config);
  });

  it("notify delegates to notification service when configured", async () => {
    const auto = new TestAutomation();
    const sendMock = mock(() => Promise.resolve());
    const notifications: NotificationService = { send: sendMock };

    auto._inject(createMockContext({ notifications }));

    const options = { title: "Test", message: "Hello" };
    await auto.callNotify(options);

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(options);
  });

  it("notify does not throw when no notification service is configured", async () => {
    const auto = new TestAutomation();

    auto._inject(createMockContext({ notifications: null }));

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
