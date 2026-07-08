/**
 * Unit tests for homekit-shelly-factory.
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
const OutletSvc = mkSvc();
const WindowCoveringSvc = mkSvc();
const AccessoryInfoSvc = mkSvc();

const mkChar = () => class {};
const OnChar = mkChar();
const CurrentPositionChar = mkChar();
const TargetPositionChar = mkChar();
const PositionStateChar = mkChar();
const ManufacturerChar = mkChar();
const ModelChar = mkChar();
const SerialNumberChar = mkChar();

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
  uuid: { generate: (s: string) => `uuid-${s}` },
  Service: {
    Switch: SwitchSvc,
    Outlet: OutletSvc,
    WindowCovering: WindowCoveringSvc,
    AccessoryInformation: AccessoryInfoSvc,
  },
  Characteristic: {
    On: OnChar,
    CurrentPosition: CurrentPositionChar,
    TargetPosition: TargetPositionChar,
    PositionState: PositionStateChar,
    Manufacturer: ManufacturerChar,
    Model: ModelChar,
    SerialNumber: SerialNumberChar,
  },
}));

// ---------------------------------------------------------------------------
// Import factory after mock is installed
// ---------------------------------------------------------------------------

type FactoryModule = typeof import("../src/core/services/homekit-shelly-factory.js");
let factory: FactoryModule;

beforeAll(async () => {
  factory = await import("../src/core/services/homekit-shelly-factory.js");
});

import type { ShellyDevice } from "../src/core/services/shelly-service.js";

const POSITION_STATE_DECREASING = 0;
const POSITION_STATE_INCREASING = 1;
const POSITION_STATE_STOPPED = 2;

describe("buildShellyAccessory", () => {
  it("returns null for an unrecognized type", () => {
    const device = { name: "x", host: "1.2.3.4", type: "mystery" } as unknown as ShellyDevice;
    expect(factory.buildShellyAccessory(device, () => {})).toBeNull();
  });

  it("generates a stable UUID per device", () => {
    const device: ShellyDevice = { name: "plug", host: "1.2.3.4", type: "switch" };
    const created = factory.buildShellyAccessory(device, () => {});
    expect(created?.accessory.UUID).toBe("uuid-shelly:plug");
  });

  describe("switch / outlet", () => {
    it("maps Switch.GetStatus output to On", () => {
      const device: ShellyDevice = { name: "plug", host: "1.2.3.4", type: "switch" };
      const created = factory.buildShellyAccessory(device, () => {});
      const svc = created?.accessory.getService(SwitchSvc) as unknown as MockServiceInstance;
      created?.updateState({ output: true } as unknown as Record<string, unknown>);
      expect(svc.getCharacteristic(OnChar).value).toBe(true);
      created?.updateState({ output: false } as unknown as Record<string, unknown>);
      expect(svc.getCharacteristic(OnChar).value).toBe(false);
    });

    it("write-back emits { on } commands", () => {
      const commands: unknown[] = [];
      const device: ShellyDevice = { name: "plug", host: "1.2.3.4", type: "switch" };
      const created = factory.buildShellyAccessory(device, (cmd) => commands.push(cmd));
      const svc = created?.accessory.getService(SwitchSvc) as unknown as MockServiceInstance;
      svc.getCharacteristic(OnChar).setValue(true);
      expect(commands).toEqual([{ on: true }]);
    });

    it("uses the Outlet service for type outlet", () => {
      const device: ShellyDevice = { name: "plug", host: "1.2.3.4", type: "outlet" };
      const created = factory.buildShellyAccessory(device, () => {});
      expect(created?.accessory.getService(OutletSvc)).toBeDefined();
      expect(created?.accessory.getService(SwitchSvc)).toBeUndefined();
    });
  });

  describe("cover", () => {
    const device: ShellyDevice = { name: "blind", host: "1.2.3.4", type: "cover" };

    it("maps current_pos + stopped state", () => {
      const created = factory.buildShellyAccessory(device, () => {});
      const svc = created?.accessory.getService(
        WindowCoveringSvc,
      ) as unknown as MockServiceInstance;
      created?.updateState({ current_pos: 40, state: "stopped" } as unknown as Record<
        string,
        unknown
      >);
      expect(svc.getCharacteristic(CurrentPositionChar).value).toBe(40);
      expect(svc.getCharacteristic(PositionStateChar).value).toBe(POSITION_STATE_STOPPED);
    });

    it("maps opening → INCREASING", () => {
      const created = factory.buildShellyAccessory(device, () => {});
      const svc = created?.accessory.getService(
        WindowCoveringSvc,
      ) as unknown as MockServiceInstance;
      created?.updateState({ current_pos: 10, state: "opening" } as unknown as Record<
        string,
        unknown
      >);
      expect(svc.getCharacteristic(PositionStateChar).value).toBe(POSITION_STATE_INCREASING);
    });

    it("maps closing → DECREASING", () => {
      const created = factory.buildShellyAccessory(device, () => {});
      const svc = created?.accessory.getService(
        WindowCoveringSvc,
      ) as unknown as MockServiceInstance;
      created?.updateState({ current_pos: 90, state: "closing" } as unknown as Record<
        string,
        unknown
      >);
      expect(svc.getCharacteristic(PositionStateChar).value).toBe(POSITION_STATE_DECREASING);
    });

    it("falls back to position 0 and warns for an uncalibrated cover", () => {
      const warnings: string[] = [];
      const created = factory.buildShellyAccessory(
        device,
        () => {},
        (msg) => warnings.push(msg),
      );
      const svc = created?.accessory.getService(
        WindowCoveringSvc,
      ) as unknown as MockServiceInstance;
      created?.updateState({ current_pos: null, state: "stopped" } as unknown as Record<
        string,
        unknown
      >);
      expect(svc.getCharacteristic(CurrentPositionChar).value).toBe(0);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("uncalibrated");
    });

    it("write-back emits { position } on TargetPosition set", () => {
      const commands: unknown[] = [];
      const created = factory.buildShellyAccessory(device, (cmd) => commands.push(cmd));
      const svc = created?.accessory.getService(
        WindowCoveringSvc,
      ) as unknown as MockServiceInstance;
      svc.getCharacteristic(TargetPositionChar).setValue(65);
      expect(commands).toEqual([{ position: 65 }]);
    });
  });
});
