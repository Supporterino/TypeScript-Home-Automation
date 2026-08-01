/**
 * Unit tests for homekit-state-factory.
 *
 * hap-nodejs checks for the `chacha20-poly1305` cipher at import-time, which is
 * not available under Bun's crypto layer.  We replace the entire module with a
 * lightweight in-process mock before loading the factory.
 */
import { beforeAll, describe, expect, it } from "bun:test";

// ---------------------------------------------------------------------------
// Lightweight HAP mock
// ---------------------------------------------------------------------------

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
const SwitchSvc = mkSvc();
const AccessoryInfoSvc = mkSvc();

const mkChar = () => class {};
const OnChar = mkChar();

class MockAccessory {
  UUID: string;
  category = 1;
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

const { mock } = await import("bun:test");

mock.module("hap-nodejs", () => ({
  Accessory: MockAccessory,
  Bridge: class MockBridge extends MockAccessory {
    async publish(_info: unknown) {}
    async unpublish() {}
    addBridgedAccessory(_acc: unknown) {}
    removeBridgedAccessory(_acc: unknown) {}
  },
  HAPStorage: { setCustomStoragePath: (_p: string) => {} },
  Categories: { LIGHTBULB: 5, BRIDGE: 2, SENSOR: 10, SWITCH: 8, OTHER: 1 },
  uuid: { generate: (s: string) => `uuid-${s}` },
  Service: {
    Switch: SwitchSvc,
    AccessoryInformation: AccessoryInfoSvc,
  },
  Characteristic: {
    On: OnChar,
  },
}));

// ---------------------------------------------------------------------------
// Import factory after mock is installed
// ---------------------------------------------------------------------------

type FactoryModule = typeof import("../src/core/services/homekit-state-factory.js");
let factory: FactoryModule;

beforeAll(async () => {
  factory = await import("../src/core/services/homekit-state-factory.js");
});

describe("buildStateToggleAccessory", () => {
  it("generates a stable UUID per state key", () => {
    const first = factory.buildStateToggleAccessory("Night Mode", "night_mode", () => {});
    const second = factory.buildStateToggleAccessory("Renamed", "night_mode", () => {});
    expect(first.accessory.UUID).toBe("uuid-state:night_mode");
    expect(second.accessory.UUID).toBe(first.accessory.UUID);
  });

  it("uses a Switch service with SWITCH category", () => {
    const created = factory.buildStateToggleAccessory("Night Mode", "night_mode", () => {});
    expect(created.accessory.category).toBe(8);
    const svc = created.accessory.getService(SwitchSvc) as unknown as MockServiceInstance;
    expect(svc).toBeDefined();
  });

  it("maps an ON/OFF state payload to the On characteristic", () => {
    const created = factory.buildStateToggleAccessory("Night Mode", "night_mode", () => {});
    const svc = created.accessory.getService(SwitchSvc) as unknown as MockServiceInstance;
    created.updateState({ state: "ON" });
    expect(svc.getCharacteristic(OnChar).value).toBe(true);
    created.updateState({ state: "OFF" });
    expect(svc.getCharacteristic(OnChar).value).toBe(false);
  });

  it("forwards the raw HomeKit boolean to onSet", () => {
    const values: unknown[] = [];
    const created = factory.buildStateToggleAccessory("Night Mode", "night_mode", (v) =>
      values.push(v),
    );
    const svc = created.accessory.getService(SwitchSvc) as unknown as MockServiceInstance;
    svc.getCharacteristic(OnChar).setValue(true);
    svc.getCharacteristic(OnChar).setValue(false);
    expect(values).toEqual([true, false]);
  });
});
