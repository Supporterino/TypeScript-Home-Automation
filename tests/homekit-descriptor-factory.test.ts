/**
 * Unit tests for the unified, descriptor-driven HAP factory (task 6.16).
 *
 * Mirrors `homekit-accessory-factory.test.ts`'s lightweight hap-nodejs mock
 * pattern (chacha20-poly1305 is unavailable under Bun), extended with the
 * Outlet/WindowCovering services and characteristics this factory also
 * projects.
 */
import { beforeAll, describe, expect, it, mock } from "bun:test";
import type { DeviceDescriptor } from "../src/core/device-sources/device-source.js";
import type { Capability } from "../src/types/capabilities.js";

// ---------------------------------------------------------------------------
// 1. Lightweight hap-nodejs mock
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
const ManufacturerChar = mkChar();
const SerialNumberChar = mkChar();
const CurrentPositionChar = mkChar();
const TargetPositionChar = mkChar();
const PositionStateChar = mkChar();

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

mock.module("hap-nodejs", () => ({
  Accessory: MockAccessory,
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
    Manufacturer: ManufacturerChar,
    SerialNumber: SerialNumberChar,
    CurrentPosition: CurrentPositionChar,
    TargetPosition: TargetPositionChar,
    PositionState: PositionStateChar,
  },
}));

type FactoryModule = typeof import("../src/core/services/homekit-descriptor-factory.js");
let factory: FactoryModule;

beforeAll(async () => {
  factory = await import("../src/core/services/homekit-descriptor-factory.js");
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const rw = { readable: true, writable: true };
const ro = { readable: true, writable: false };

function descriptor(overrides: Partial<DeviceDescriptor> = {}): DeviceDescriptor {
  return {
    source: "zigbee",
    id: "0xaaa",
    qualifiedId: "zigbee:0xaaa",
    displayName: "office_lamp",
    state: {},
    capabilities: [],
    reachable: true,
    observation: { mode: "push", observedAt: Date.now() },
    hidden: false,
    ...overrides,
  };
}

describe("createAccessoryFromDescriptor", () => {
  it("returns null when no supported capability is detected", () => {
    const created = factory.createAccessoryFromDescriptor(descriptor(), () => {});
    expect(created).toBeNull();
  });

  describe("Zigbee light", () => {
    const lightCaps: Capability[] = [
      {
        kind: "light",
        access: rw,
        valueType: "composite",
        features: [
          { kind: "binary", property: "state", access: rw, valueType: "boolean" },
          { kind: "numeric", property: "brightness", access: rw, valueType: "numeric" },
        ],
      },
    ];

    it("builds a Lightbulb with on/off and brightness write-back in Zigbee's own encoding", () => {
      const onSetCalls: Record<string, unknown>[] = [];
      const created = factory.createAccessoryFromDescriptor(
        descriptor({ capabilities: lightCaps }),
        (props) => onSetCalls.push(props),
      );
      expect(created).not.toBeNull();

      const svc = (created?.accessory as unknown as MockAccessory | undefined)?.getService(
        LightbulbSvc,
      );
      svc.getCharacteristic(OnChar).setValue(true);
      expect(onSetCalls).toContainEqual({ state: "ON" });

      svc.getCharacteristic(BrightnessChar).setValue(100);
      expect(onSetCalls).toContainEqual({ brightness: 254 });
    });

    it("reads Zigbee's ON/OFF string state via updateState", () => {
      const created = factory.createAccessoryFromDescriptor(
        descriptor({ capabilities: lightCaps }),
        () => {},
      );
      created?.updateState({ state: "ON", brightness: 127 });
      const svc = (created?.accessory as unknown as MockAccessory | undefined)?.getService(
        LightbulbSvc,
      );
      expect(svc.getCharacteristic(OnChar).value).toBe(true);
      expect(svc.getCharacteristic(BrightnessChar).value).toBe(50);
    });
  });

  describe("Zigbee sensors", () => {
    it("builds a MotionSensor from an occupancy capability", () => {
      const created = factory.createAccessoryFromDescriptor(
        descriptor({
          capabilities: [
            { kind: "binary", property: "occupancy", access: ro, valueType: "boolean" },
          ],
        }),
        () => {},
      );
      expect(created).not.toBeNull();
      created?.updateState({ occupancy: true });
      const svc = (created?.accessory as unknown as MockAccessory | undefined)?.getService(
        MotionSensorSvc,
      );
      expect(svc.getCharacteristic(MotionDetectedChar).value).toBe(true);
    });

    it("builds a battery service alongside a sensor when hasBattery", () => {
      const created = factory.createAccessoryFromDescriptor(
        descriptor({
          capabilities: [
            { kind: "binary", property: "contact", access: ro, valueType: "boolean" },
            { kind: "numeric", property: "battery", access: ro, valueType: "numeric" },
          ],
        }),
        () => {},
      );
      created?.updateState({ contact: true, battery: 55 });
      const bat = (created?.accessory as unknown as MockAccessory | undefined)?.getService(
        BatterySvc,
      );
      expect(bat.getCharacteristic(BattLevelChar).value).toBe(55);
    });
  });

  describe("Switch / Outlet (Zigbee, Shelly, state toggle)", () => {
    it("builds a Switch for a Zigbee switch container, writing back ON/OFF strings on 'state'", () => {
      const onSetCalls: Record<string, unknown>[] = [];
      const created = factory.createAccessoryFromDescriptor(
        descriptor({
          source: "zigbee",
          capabilities: [{ kind: "switch", access: rw, valueType: "composite" }],
        }),
        (props) => onSetCalls.push(props),
      );
      const svc = (created?.accessory as unknown as MockAccessory | undefined)?.getService(
        SwitchSvc,
      );
      svc.getCharacteristic(OnChar).setValue(true);
      expect(onSetCalls).toEqual([{ state: "ON" }]);

      created?.updateState({ state: "OFF" });
      expect(svc.getCharacteristic(OnChar).value).toBe(false);
    });

    it("builds a Switch for a Shelly switch, writing back a real boolean on 'on'", () => {
      const onSetCalls: Record<string, unknown>[] = [];
      const created = factory.createAccessoryFromDescriptor(
        descriptor({
          source: "shelly",
          id: "plug",
          qualifiedId: "shelly:plug",
          capabilities: [{ kind: "switch", property: "on", access: rw, valueType: "boolean" }],
        }),
        (props) => onSetCalls.push(props),
      );
      const svc = (created?.accessory as unknown as MockAccessory | undefined)?.getService(
        SwitchSvc,
      );
      svc.getCharacteristic(OnChar).setValue(true);
      expect(onSetCalls).toEqual([{ on: true }]);

      created?.updateState({ on: true });
      expect(svc.getCharacteristic(OnChar).value).toBe(true);
    });

    it("builds an Outlet, not a Switch, for a Shelly outlet", () => {
      const created = factory.createAccessoryFromDescriptor(
        descriptor({
          source: "shelly",
          id: "outlet1",
          qualifiedId: "shelly:outlet1",
          capabilities: [{ kind: "outlet", property: "on", access: rw, valueType: "boolean" }],
        }),
        () => {},
      );
      expect((created?.accessory as unknown as MockAccessory).getService(OutletSvc)).toBeDefined();
      expect(
        (created?.accessory as unknown as MockAccessory).getService(SwitchSvc),
      ).toBeUndefined();
    });

    it("builds a Switch for a state toggle, writing back a real boolean on 'on'", () => {
      const onSetCalls: Record<string, unknown>[] = [];
      const created = factory.createAccessoryFromDescriptor(
        descriptor({
          source: "state",
          id: "night_mode",
          qualifiedId: "state:night_mode",
          capabilities: [{ kind: "switch", property: "on", access: rw, valueType: "boolean" }],
        }),
        (props) => onSetCalls.push(props),
      );
      const svc = (created?.accessory as unknown as MockAccessory | undefined)?.getService(
        SwitchSvc,
      );
      svc.getCharacteristic(OnChar).setValue(false);
      expect(onSetCalls).toEqual([{ on: false }]);
    });
  });

  describe("Cover (Shelly)", () => {
    const coverCaps: Capability[] = [
      {
        kind: "numeric",
        property: "position",
        access: rw,
        valueType: "numeric",
        range: { min: 0, max: 100 },
      },
      { kind: "enum", property: "state", access: ro, valueType: "enum" },
    ];

    it("builds a WindowCovering and routes TargetPosition write-back to 'position'", () => {
      const onSetCalls: Record<string, unknown>[] = [];
      const created = factory.createAccessoryFromDescriptor(
        descriptor({
          source: "shelly",
          id: "blinds",
          qualifiedId: "shelly:blinds",
          capabilities: coverCaps,
        }),
        (props) => onSetCalls.push(props),
      );
      expect(created).not.toBeNull();
      const svc = (created?.accessory as unknown as MockAccessory | undefined)?.getService(
        WindowCoveringSvc,
      );
      svc.getCharacteristic(TargetPositionChar).setValue(40);
      expect(onSetCalls).toEqual([{ position: 40 }]);
    });

    it("reflects position and movement state via updateState", () => {
      const created = factory.createAccessoryFromDescriptor(
        descriptor({
          source: "shelly",
          id: "blinds",
          qualifiedId: "shelly:blinds",
          capabilities: coverCaps,
        }),
        () => {},
      );
      created?.updateState({ position: 60, state: "opening" });
      const svc = (created?.accessory as unknown as MockAccessory | undefined)?.getService(
        WindowCoveringSvc,
      );
      expect(svc.getCharacteristic(CurrentPositionChar).value).toBe(60);
      expect(svc.getCharacteristic(PositionStateChar).value).toBe(1); // INCREASING
    });

    it("reports position 0 and warns when uncalibrated (position is null)", () => {
      const warnings: [string, Record<string, unknown>][] = [];
      const created = factory.createAccessoryFromDescriptor(
        descriptor({
          source: "shelly",
          id: "blinds",
          qualifiedId: "shelly:blinds",
          capabilities: coverCaps,
        }),
        () => {},
        (message, context) => warnings.push([message, context]),
      );
      created?.updateState({ position: null, state: "stopped" });
      const svc = (created?.accessory as unknown as MockAccessory | undefined)?.getService(
        WindowCoveringSvc,
      );
      expect(svc.getCharacteristic(CurrentPositionChar).value).toBe(0);
      expect(warnings).toHaveLength(1);
    });
  });

  describe("UUID seeding (frozen per source, task 6.15)", () => {
    it("seeds a Zigbee accessory from the IEEE address alone", () => {
      const created = factory.createAccessoryFromDescriptor(
        descriptor({
          source: "zigbee",
          id: "0x00124b0022a1b2c3",
          qualifiedId: "zigbee:0x00124b0022a1b2c3",
          capabilities: [{ kind: "switch", access: rw, valueType: "composite" }],
        }),
        () => {},
      );
      expect(created?.accessory.UUID).toBe("uuid-0x00124b0022a1b2c3");
    });

    it("seeds a Shelly accessory from 'shelly:<name>'", () => {
      const created = factory.createAccessoryFromDescriptor(
        descriptor({
          source: "shelly",
          id: "office_plug",
          qualifiedId: "shelly:office_plug",
          capabilities: [{ kind: "switch", property: "on", access: rw, valueType: "boolean" }],
        }),
        () => {},
      );
      expect(created?.accessory.UUID).toBe("uuid-shelly:office_plug");
    });

    it("seeds a state toggle accessory from 'state:<key>'", () => {
      const created = factory.createAccessoryFromDescriptor(
        descriptor({
          source: "state",
          id: "night_mode",
          qualifiedId: "state:night_mode",
          capabilities: [{ kind: "switch", property: "on", access: rw, valueType: "boolean" }],
        }),
        () => {},
      );
      expect(created?.accessory.UUID).toBe("uuid-state:night_mode");
    });
  });
});
