/**
 * Tests for HomekitService acting as a source-agnostic bridge host.
 *
 * Focuses on the AccessorySink wiring: accessories added/removed by a source
 * are bridged/unbridged on the underlying HAP bridge, keyed by namespaced id.
 *
 * hap-nodejs is mocked (chacha20-poly1305 is unavailable under Bun), and the
 * Shelly factory module is mocked so no real hap-nodejs Accessory is built.
 */
import { beforeEach, describe, expect, it, mock } from "bun:test";
import pino from "pino";

// ---------------------------------------------------------------------------
// Mock hap-nodejs bridge (records bridged/unbridged accessories)
// ---------------------------------------------------------------------------

const bridged: unknown[] = [];
const unbridged: unknown[] = [];

class MockBridge {
  UUID: string;
  constructor(_name: string, uuidStr: string) {
    this.UUID = uuidStr;
  }
  addBridgedAccessory(acc: unknown) {
    bridged.push(acc);
  }
  removeBridgedAccessory(acc: unknown) {
    unbridged.push(acc);
  }
  async publish(_info: unknown) {}
  async unpublish() {}
}

mock.module("hap-nodejs", () => ({
  Bridge: MockBridge,
  HAPStorage: { setCustomStoragePath: (_p: string) => {} },
  uuid: { generate: (s: string) => `uuid-${s}` },
}));

// Avoid loading the real crypto polyfill machinery.
mock.module("../src/core/services/homekit-crypto-polyfill.js", () => ({}));

// Mock the Shelly factory so it produces plain fake accessories.
let accessoryCounter = 0;
mock.module("../src/core/services/homekit-shelly-factory.js", () => ({
  buildShellyAccessory: (device: { name: string }) => ({
    accessory: { UUID: `acc-${device.name}-${accessoryCounter++}` },
    updateState: () => {},
  }),
}));

import type { HttpClient, HttpResponse } from "../src/core/http/http-client.js";
import type { MqttService } from "../src/core/mqtt/mqtt-service.js";
import { HomekitService } from "../src/core/services/homekit-service.js";
import type { CoreContext } from "../src/core/services/service-plugin.js";
import { ShellyService } from "../src/core/services/shelly-service.js";

const logger = pino({ level: "silent" });

function createMockHttp(): HttpClient {
  const response: HttpResponse = {
    status: 200,
    ok: true,
    headers: new Headers(),
    data: { output: false },
  };
  return {
    get: mock(() => Promise.resolve(response)),
    post: mock(() => Promise.resolve(response)),
    put: mock(() => Promise.resolve(response)),
    patch: mock(() => Promise.resolve(response)),
    del: mock(() => Promise.resolve(response)),
    request: mock(() => Promise.resolve(response)),
  } as unknown as HttpClient;
}

const mqtt = {} as unknown as MqttService;
const ctx = {} as unknown as CoreContext;

describe("HomekitService (source host)", () => {
  beforeEach(() => {
    bridged.length = 0;
    unbridged.length = 0;
    accessoryCounter = 0;
  });

  it("skips startup when no sources are available", async () => {
    const svc = new HomekitService(mqtt, logger, null, null, { pinCode: "031-45-154" });
    await svc.onStart(ctx);
    expect(svc.getStatus().running).toBe(false);
    expect(bridged).toHaveLength(0);
  });

  it("bridges accessories added by the Shelly source through the sink", async () => {
    const shelly = new ShellyService(createMockHttp(), logger);
    shelly.register("plug", "192.168.1.50", "switch");

    // Large poll interval so the loop never fires during the test.
    const svc = new HomekitService(mqtt, logger, null, shelly, {
      pinCode: "031-45-154",
      pollIntervalMs: 1_000_000,
    });
    await svc.onStart(ctx);

    expect(svc.getStatus().running).toBe(true);
    expect(bridged).toHaveLength(1);
    expect(svc.getStatus().accessoryCount).toBe(1);

    await svc.onStop();
  });

  it("bridges a device registered after start", async () => {
    const shelly = new ShellyService(createMockHttp(), logger);
    const svc = new HomekitService(mqtt, logger, null, shelly, {
      pinCode: "031-45-154",
      pollIntervalMs: 1_000_000,
    });
    await svc.onStart(ctx);
    expect(bridged).toHaveLength(0);

    shelly.register("plug", "192.168.1.50", "switch");
    expect(bridged).toHaveLength(1);
    expect(svc.getStatus().accessoryCount).toBe(1);

    await svc.onStop();
  });

  it("clears accessories and unpublishes on stop", async () => {
    const shelly = new ShellyService(createMockHttp(), logger);
    shelly.register("plug", "192.168.1.50", "switch");
    const svc = new HomekitService(mqtt, logger, null, shelly, {
      pinCode: "031-45-154",
      pollIntervalMs: 1_000_000,
    });
    await svc.onStart(ctx);
    await svc.onStop();
    expect(svc.getStatus().running).toBe(false);
    expect(svc.getStatus().accessoryCount).toBe(0);
  });
});
