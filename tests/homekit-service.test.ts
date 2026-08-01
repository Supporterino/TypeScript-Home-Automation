/**
 * Tests for HomekitService acting as a source-agnostic bridge host.
 *
 * Focuses on the AccessorySink wiring: accessories added/removed by a source
 * are bridged/unbridged on the underlying HAP bridge, keyed by namespaced id.
 *
 * hap-nodejs is mocked (chacha20-poly1305 is unavailable under Bun). The mock
 * surface mirrors `homekit-accessory-factory.test.ts` so the real Shelly/state
 * factories can be exercised without a real HAP runtime. The Shelly factory
 * module itself is mocked so no hap-nodejs Accessory is built for Shelly
 * devices.
 */
import { beforeEach, describe, expect, it, mock } from "bun:test";
import pino from "pino";

// ---------------------------------------------------------------------------
// Mock hap-nodejs (records bridged/unbridged accessories)
// ---------------------------------------------------------------------------

const bridged: unknown[] = [];
const unbridged: unknown[] = [];
// When set, MockBridge.publish rejects with this error (reset per test).
let publishError: Error | null = null;

class MockCharInstance {
  value: unknown = null;
  private setHandler?: (v: unknown) => void;

  updateValue(v: unknown) {
    this.value = v;
    return this;
  }
  setValue(v: unknown) {
    this.value = v;
    this.setHandler?.(v);
    return this;
  }
  onSet(handler: (v: unknown) => void) {
    this.setHandler = handler;
    return this;
  }
  onGet(_handler: () => unknown) {
    return this;
  }
}

class MockServiceInstance {
  readonly chars: Map<unknown, MockCharInstance> = new Map();

  getCharacteristic(CharClass: unknown): MockCharInstance {
    const existing = this.chars.get(CharClass);
    if (existing) return existing;
    const char = new MockCharInstance();
    this.chars.set(CharClass, char);
    return char;
  }
  addOptionalCharacteristic(CharClass: unknown) {
    this.getCharacteristic(CharClass);
  }
}

const mkSvc = () => class extends MockServiceInstance {};
const LightbulbSvc = mkSvc();
const MotionSensorSvc = mkSvc();
const ContactSensorSvc = mkSvc();
const LeakSensorSvc = mkSvc();
const TempSensorSvc = mkSvc();
const HumidSensorSvc = mkSvc();
const SwitchSvc = mkSvc();
const OutletSvc = mkSvc();
const WindowCoveringSvc = mkSvc();
const BatterySvc = mkSvc();
const AccessoryInfoSvc = mkSvc();

const mkChar = <T extends Record<string, unknown>>(statics: T = {} as T) =>
  Object.assign(class {}, statics) as (new () => object) & T;

const OnChar = mkChar();
const BrightnessChar = mkChar();
const ColorTempChar = mkChar();
const HueChar = mkChar();
const SatChar = mkChar();
const MotionDetectedChar = mkChar();
const ContactStateChar = mkChar({ CONTACT_DETECTED: 0 as const, CONTACT_NOT_DETECTED: 1 as const });
const LeakDetectedChar = mkChar({ LEAK_DETECTED: 1 as const, LEAK_NOT_DETECTED: 0 as const });
const CurrentTempChar = mkChar();
const CurrentHumidChar = mkChar();
const StatusLowBattChar = mkChar({
  BATTERY_LEVEL_NORMAL: 0 as const,
  BATTERY_LEVEL_LOW: 1 as const,
});
const BattLevelChar = mkChar();
const CurrentPositionChar = mkChar();
const TargetPositionChar = mkChar();
const PositionStateChar = mkChar();
const ManufacturerChar = mkChar();
const ModelChar = mkChar();
const SerialNumberChar = mkChar();

class MockAccessory {
  UUID: string;
  category: number = 1;
  private svcs: Map<unknown, MockServiceInstance> = new Map();

  constructor(_name: string, uuidStr: string) {
    this.UUID = uuidStr;
    this.svcs.set(AccessoryInfoSvc, new MockServiceInstance());
  }
  addService(SvcClass: { new (): MockServiceInstance }) {
    const svc = new SvcClass();
    this.svcs.set(SvcClass, svc);
    return svc;
  }
  getService(SvcClass: unknown): MockServiceInstance | undefined {
    return this.svcs.get(SvcClass);
  }
}

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
  async publish(_info: unknown) {
    if (publishError) throw publishError;
  }
  async unpublish() {}
}

mock.module("hap-nodejs", () => ({
  Accessory: MockAccessory,
  Bridge: MockBridge,
  HAPStorage: { setCustomStoragePath: (_p: string) => {} },
  Categories: { LIGHTBULB: 5, BRIDGE: 2, SENSOR: 10, SWITCH: 8, OTHER: 1 },
  uuid: { generate: (s: string) => `uuid-${s}` },
  Service: {
    Lightbulb: LightbulbSvc,
    MotionSensor: MotionSensorSvc,
    ContactSensor: ContactSensorSvc,
    LeakSensor: LeakSensorSvc,
    TemperatureSensor: TempSensorSvc,
    HumiditySensor: HumidSensorSvc,
    Switch: SwitchSvc,
    Outlet: OutletSvc,
    WindowCovering: WindowCoveringSvc,
    Battery: BatterySvc,
    AccessoryInformation: AccessoryInfoSvc,
  },
  Characteristic: {
    On: OnChar,
    Brightness: BrightnessChar,
    ColorTemperature: ColorTempChar,
    Hue: HueChar,
    Saturation: SatChar,
    MotionDetected: MotionDetectedChar,
    ContactSensorState: ContactStateChar,
    LeakDetected: LeakDetectedChar,
    CurrentTemperature: CurrentTempChar,
    CurrentRelativeHumidity: CurrentHumidChar,
    StatusLowBattery: StatusLowBattChar,
    BatteryLevel: BattLevelChar,
    CurrentPosition: CurrentPositionChar,
    TargetPosition: TargetPositionChar,
    PositionState: PositionStateChar,
    Manufacturer: ManufacturerChar,
    Model: ModelChar,
    SerialNumber: SerialNumberChar,
  },
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
import { StateManager } from "../src/core/state/state-manager.js";

const logger = pino({ level: "silent" });
const state = new StateManager(logger);

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
    publishError = null;
  });

  it("skips startup when no sources are available", async () => {
    const svc = new HomekitService(mqtt, logger, null, null, state, { pinCode: "031-45-154" });
    await svc.onStart(ctx);
    expect(svc.getStatus().running).toBe(false);
    expect(bridged).toHaveLength(0);
  });

  it("starts a toggles-only bridge without a registry or Shelly service", async () => {
    const svc = new HomekitService(mqtt, logger, null, null, state, {
      pinCode: "031-45-154",
      stateToggles: [{ stateKey: "night_mode", name: "Night Mode" }],
    });
    await svc.onStart(ctx);

    expect(svc.getStatus().running).toBe(true);
    expect(bridged).toHaveLength(1);
    expect(svc.getStatus().accessoryCount).toBe(1);

    await svc.onStop();
  });

  it("bridges accessories added by the Shelly source through the sink", async () => {
    const shelly = new ShellyService(createMockHttp(), logger);
    shelly.register("plug", "192.168.1.50", "switch");

    // Large poll interval so the loop never fires during the test.
    const svc = new HomekitService(mqtt, logger, null, shelly, state, {
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
    const svc = new HomekitService(mqtt, logger, null, shelly, state, {
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

  it("tears down started sources and resets state when publish() rejects", async () => {
    const shelly = new ShellyService(createMockHttp(), logger);
    shelly.register("plug", "192.168.1.50", "switch");

    const svc = new HomekitService(mqtt, logger, null, shelly, state, {
      pinCode: "031-45-154",
      pollIntervalMs: 1_000_000,
    });

    publishError = new Error("publish failed");

    // onStart must propagate the publish error.
    await expect(svc.onStart(ctx)).rejects.toThrow("publish failed");

    // State must be fully reset so no orphaned bridge/sources remain.
    const status = svc.getStatus();
    expect(status.running).toBe(false);
    expect(status.accessoryCount).toBe(0);

    // A subsequent onStop must be a safe no-op (bridge already cleared).
    await expect(svc.onStop()).resolves.toBeUndefined();
  });

  it("clears accessories and unpublishes on stop", async () => {
    const shelly = new ShellyService(createMockHttp(), logger);
    shelly.register("plug", "192.168.1.50", "switch");
    const svc = new HomekitService(mqtt, logger, null, shelly, state, {
      pinCode: "031-45-154",
      pollIntervalMs: 1_000_000,
    });
    await svc.onStart(ctx);
    await svc.onStop();
    expect(svc.getStatus().running).toBe(false);
    expect(svc.getStatus().accessoryCount).toBe(0);
  });
});
