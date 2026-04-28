/**
 * Unit tests for homekit-accessory-factory.
 *
 * hap-nodejs checks for the `chacha20-poly1305` cipher at import-time, which
 * is not available under Bun's crypto layer.  We therefore replace the entire
 * module with a lightweight in-process mock before loading the factory.
 *
 * Design:
 * - Service and Characteristic "types" are plain classes used as Map keys.
 * - Mock Characteristic instances track their value and a single `onSet` handler.
 * - Mock Service instances store characteristics keyed by their type class.
 * - Mock Accessory stores services keyed by their type class, pre-populating
 *   AccessoryInformation (as real HAP does).
 */
import { beforeAll, describe, expect, it, mock } from "bun:test";
import type { Service } from "hap-nodejs";

// ---------------------------------------------------------------------------
// 1. Build lightweight HAP mock types (defined BEFORE mock.module so they can
//    be used as keys in test assertions as well as inside mock.module).
// ---------------------------------------------------------------------------

/** A mock Characteristic instance that stores value and one SET handler. */
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

/** A mock Service instance that creates/returns MockCharInstance per type. */
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

/** Factory for distinct service type classes (used as map keys). */
const mkSvc = () => class extends MockServiceInstance {};

// Each service type is a unique constructor — mirrors Service.Lightbulb, etc.
const LightbulbSvc = mkSvc();
const MotionSensorSvc = mkSvc();
const ContactSensorSvc = mkSvc();
const LeakSensorSvc = mkSvc();
const TempSensorSvc = mkSvc();
const HumidSensorSvc = mkSvc();
const SwitchSvc = mkSvc();
const BatterySvc = mkSvc();
const AccessoryInfoSvc = mkSvc();

/** Factory for distinct characteristic type classes, with optional static constants. */
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
const ModelChar = mkChar();
const SerialNumberChar = mkChar();

/** Mock Accessory — stores services keyed by type. */
class MockAccessory {
  UUID: string;
  category: number = 1;
  private svcs: Map<unknown, MockServiceInstance> = new Map();

  constructor(_name: string, uuidStr: string) {
    this.UUID = uuidStr;
    // Real HAP accessories always have AccessoryInformation pre-installed.
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

// ---------------------------------------------------------------------------
// 2. Install the mock before anything else loads hap-nodejs.
// ---------------------------------------------------------------------------

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
    Lightbulb: LightbulbSvc,
    MotionSensor: MotionSensorSvc,
    ContactSensor: ContactSensorSvc,
    LeakSensor: LeakSensorSvc,
    TemperatureSensor: TempSensorSvc,
    HumiditySensor: HumidSensorSvc,
    Switch: SwitchSvc,
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
    Model: ModelChar,
    SerialNumber: SerialNumberChar,
  },
}));

// ---------------------------------------------------------------------------
// 3. Lazily import the factory so the mock is already in place.
// ---------------------------------------------------------------------------

type FactoryModule = typeof import("../src/core/services/homekit-accessory-factory.js");

let factory: FactoryModule;

beforeAll(async () => {
  factory = await import("../src/core/services/homekit-accessory-factory.js");
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

import type { ZigbeeDevice, ZigbeeDeviceDefinition } from "../src/types/zigbee/bridge.js";

function makeDevice(exposes: unknown[], overrides: Partial<ZigbeeDevice> = {}): ZigbeeDevice {
  return {
    ieee_address: "0x0000000000000001",
    friendly_name: "test_device",
    type: "EndDevice",
    supported: true,
    disabled: false,
    interview_state: "SUCCESSFUL",
    definition: {
      model: "TEST-01",
      vendor: "TestCo",
      description: "Test device",
      source: "native",
      exposes,
      options: [],
    } as ZigbeeDeviceDefinition,
    ...overrides,
  };
}

const lightExposes = (features: { name: string }[]) => [{ type: "light", features }];
const switchExposes = () => [{ type: "switch", features: [{ type: "binary", name: "state" }] }];
const sensorExpose = (name: string) => ({ type: "binary", name });
const numericExpose = (name: string) => ({ type: "numeric", name });

/** Casts a MockServiceInstance to Service without unsafe any. */
const asSvc = (svc: MockServiceInstance): Service => svc as unknown as Service;

// ---------------------------------------------------------------------------
// detectCapabilities
// ---------------------------------------------------------------------------

describe("detectCapabilities", () => {
  it("returns null when definition is null", () => {
    const device = makeDevice([]);
    device.definition = null;
    expect(factory.detectCapabilities(device)).toBeNull();
  });

  it("detects a basic on/off light", () => {
    const caps = factory.detectCapabilities(makeDevice(lightExposes([{ name: "state" }])));
    expect(caps?.isLight).toBe(true);
    expect(caps?.hasBrightness).toBe(false);
  });

  it("detects a dimmable light", () => {
    const caps = factory.detectCapabilities(
      makeDevice(lightExposes([{ name: "state" }, { name: "brightness" }])),
    );
    expect(caps?.isLight).toBe(true);
    expect(caps?.hasBrightness).toBe(true);
    expect(caps?.hasColorTemp).toBe(false);
  });

  it("detects a white-spectrum (color-temperature) light", () => {
    const caps = factory.detectCapabilities(
      makeDevice(lightExposes([{ name: "state" }, { name: "brightness" }, { name: "color_temp" }])),
    );
    expect(caps?.hasColorTemp).toBe(true);
    expect(caps?.hasColorXY).toBe(false);
    expect(caps?.hasColorHS).toBe(false);
  });

  it("detects a color light with xy expose", () => {
    const caps = factory.detectCapabilities(
      makeDevice(
        lightExposes([
          { name: "state" },
          { name: "brightness" },
          { name: "color_temp" },
          { name: "color_xy" },
        ]),
      ),
    );
    expect(caps?.hasColorXY).toBe(true);
    expect(caps?.hasColorHS).toBe(false);
  });

  it("detects a color light with hs expose", () => {
    const caps = factory.detectCapabilities(
      makeDevice(lightExposes([{ name: "state" }, { name: "brightness" }, { name: "color_hs" }])),
    );
    expect(caps?.hasColorHS).toBe(true);
    expect(caps?.hasColorXY).toBe(false);
  });

  it("detects a switch", () => {
    const caps = factory.detectCapabilities(makeDevice(switchExposes()));
    expect(caps?.isSwitch).toBe(true);
    expect(caps?.isLight).toBe(false);
  });

  it("detects occupancy (motion sensor)", () => {
    expect(factory.detectCapabilities(makeDevice([sensorExpose("occupancy")]))?.hasOccupancy).toBe(
      true,
    );
  });

  it("detects contact sensor", () => {
    expect(factory.detectCapabilities(makeDevice([sensorExpose("contact")]))?.hasContact).toBe(
      true,
    );
  });

  it("detects water_leak sensor", () => {
    expect(factory.detectCapabilities(makeDevice([sensorExpose("water_leak")]))?.hasWaterLeak).toBe(
      true,
    );
  });

  it("detects temperature", () => {
    expect(
      factory.detectCapabilities(makeDevice([numericExpose("temperature")]))?.hasTemperature,
    ).toBe(true);
  });

  it("detects humidity", () => {
    expect(factory.detectCapabilities(makeDevice([numericExpose("humidity")]))?.hasHumidity).toBe(
      true,
    );
  });

  it("detects battery", () => {
    expect(factory.detectCapabilities(makeDevice([numericExpose("battery")]))?.hasBattery).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// xyToHueSaturation
// ---------------------------------------------------------------------------

describe("xyToHueSaturation", () => {
  it("converts pure red (0.64, 0.33) to approximately 0° hue", () => {
    const { hue } = factory.xyToHueSaturation(0.64, 0.33);
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThanOrEqual(15);
  });

  it("converts pure blue (0.15, 0.06) to approximately 220-260° hue", () => {
    const { hue } = factory.xyToHueSaturation(0.15, 0.06);
    expect(hue).toBeGreaterThanOrEqual(200);
    expect(hue).toBeLessThanOrEqual(270);
  });

  it("converts neutral white (0.3127, 0.3290) to low saturation", () => {
    const { saturation } = factory.xyToHueSaturation(0.3127, 0.329);
    expect(saturation).toBeLessThan(20);
  });

  it("returns hue=0, saturation=0 for y=0 (degenerate input)", () => {
    const result = factory.xyToHueSaturation(0.5, 0);
    expect(result.hue).toBe(0);
    expect(result.saturation).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// hapBrightnessToZ2m
// ---------------------------------------------------------------------------

describe("hapBrightnessToZ2m", () => {
  it("converts 0 → 0", () => expect(factory.hapBrightnessToZ2m(0)).toBe(0));
  it("converts 100 → 254", () => expect(factory.hapBrightnessToZ2m(100)).toBe(254));

  it("converts 50 → approximately 127", () => {
    const v = factory.hapBrightnessToZ2m(50);
    expect(v).toBeGreaterThanOrEqual(125);
    expect(v).toBeLessThanOrEqual(129);
  });

  it("clamps values above 100 to 254", () => expect(factory.hapBrightnessToZ2m(200)).toBe(254));
  it("clamps negative values to 0", () => expect(factory.hapBrightnessToZ2m(-10)).toBe(0));
});

// ---------------------------------------------------------------------------
// Helper: create a mock service for state-apply tests
// ---------------------------------------------------------------------------

function makeMockService() {
  return new MockServiceInstance();
}

// ---------------------------------------------------------------------------
// applyLightState
// ---------------------------------------------------------------------------

describe("applyLightState", () => {
  it("sets On=true when state=ON", () => {
    const svc = makeMockService();
    factory.applyLightState(asSvc(svc), { state: "ON" }, false, false);
    expect(svc.getCharacteristic(OnChar).value).toBe(true);
  });

  it("sets On=false when state=OFF", () => {
    const svc = makeMockService();
    factory.applyLightState(asSvc(svc), { state: "OFF" }, false, false);
    expect(svc.getCharacteristic(OnChar).value).toBe(false);
  });

  it("converts z2m brightness 254 → HAP brightness 100", () => {
    const svc = makeMockService();
    factory.applyLightState(asSvc(svc), { brightness: 254 }, false, false);
    expect(svc.getCharacteristic(BrightnessChar).value).toBe(100);
  });

  it("converts z2m brightness 0 → HAP brightness 0", () => {
    const svc = makeMockService();
    factory.applyLightState(asSvc(svc), { brightness: 0 }, false, false);
    expect(svc.getCharacteristic(BrightnessChar).value).toBe(0);
  });

  it("passes color_temp through (in mired) when hasColorTemp=true", () => {
    const svc = makeMockService();
    factory.applyLightState(asSvc(svc), { color_temp: 300 }, true, false);
    expect(svc.getCharacteristic(ColorTempChar).value).toBe(300);
  });

  it("clamps color_temp below 140 to 140", () => {
    const svc = makeMockService();
    factory.applyLightState(asSvc(svc), { color_temp: 50 }, true, false);
    expect(svc.getCharacteristic(ColorTempChar).value).toBe(140);
  });

  it("clamps color_temp above 500 to 500", () => {
    const svc = makeMockService();
    factory.applyLightState(asSvc(svc), { color_temp: 650 }, true, false);
    expect(svc.getCharacteristic(ColorTempChar).value).toBe(500);
  });

  it("applies hs color from color.hue / color.saturation", () => {
    const svc = makeMockService();
    factory.applyLightState(asSvc(svc), { color: { hue: 120, saturation: 80 } }, false, true);
    expect(svc.getCharacteristic(HueChar).value).toBe(120);
    expect(svc.getCharacteristic(SatChar).value).toBe(80);
  });

  it("applies color from CIE xy coordinates (low saturation for white)", () => {
    const svc = makeMockService();
    factory.applyLightState(asSvc(svc), { color: { x: 0.3127, y: 0.329 } }, false, true);
    expect(svc.getCharacteristic(SatChar).value as number).toBeLessThan(20);
  });
});

// ---------------------------------------------------------------------------
// applyMotionState
// ---------------------------------------------------------------------------

describe("applyMotionState", () => {
  it("sets MotionDetected=true when occupancy=true", () => {
    const svc = makeMockService();
    factory.applyMotionState(asSvc(svc), { occupancy: true });
    expect(svc.getCharacteristic(MotionDetectedChar).value).toBe(true);
  });

  it("sets MotionDetected=false when occupancy=false", () => {
    const svc = makeMockService();
    factory.applyMotionState(asSvc(svc), { occupancy: false });
    expect(svc.getCharacteristic(MotionDetectedChar).value).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyContactState
// ---------------------------------------------------------------------------

describe("applyContactState", () => {
  it("sets CONTACT_DETECTED (0) when contact=true", () => {
    const svc = makeMockService();
    factory.applyContactState(asSvc(svc), { contact: true });
    expect(svc.getCharacteristic(ContactStateChar).value).toBe(ContactStateChar.CONTACT_DETECTED);
  });

  it("sets CONTACT_NOT_DETECTED (1) when contact=false", () => {
    const svc = makeMockService();
    factory.applyContactState(asSvc(svc), { contact: false });
    expect(svc.getCharacteristic(ContactStateChar).value).toBe(
      ContactStateChar.CONTACT_NOT_DETECTED,
    );
  });
});

// ---------------------------------------------------------------------------
// applyLeakState
// ---------------------------------------------------------------------------

describe("applyLeakState", () => {
  it("sets LEAK_DETECTED (1) when water_leak=true", () => {
    const svc = makeMockService();
    factory.applyLeakState(asSvc(svc), { water_leak: true });
    expect(svc.getCharacteristic(LeakDetectedChar).value).toBe(LeakDetectedChar.LEAK_DETECTED);
  });

  it("sets LEAK_NOT_DETECTED (0) when water_leak=false", () => {
    const svc = makeMockService();
    factory.applyLeakState(asSvc(svc), { water_leak: false });
    expect(svc.getCharacteristic(LeakDetectedChar).value).toBe(LeakDetectedChar.LEAK_NOT_DETECTED);
  });
});

// ---------------------------------------------------------------------------
// applyThermoState
// ---------------------------------------------------------------------------

describe("applyThermoState", () => {
  it("sets CurrentTemperature on a temperature service", () => {
    const svc = makeMockService();
    factory.applyThermoState(asSvc(svc), null, { temperature: 22.5 });
    expect(svc.getCharacteristic(CurrentTempChar).value).toBe(22.5);
  });

  it("sets CurrentRelativeHumidity on a humidity service", () => {
    const svc = makeMockService();
    factory.applyThermoState(null, asSvc(svc), { humidity: 65 });
    expect(svc.getCharacteristic(CurrentHumidChar).value).toBe(65);
  });

  it("clamps humidity above 100 to 100", () => {
    const svc = makeMockService();
    factory.applyThermoState(null, asSvc(svc), { humidity: 110 });
    expect(svc.getCharacteristic(CurrentHumidChar).value).toBe(100);
  });

  it("clamps humidity below 0 to 0", () => {
    const svc = makeMockService();
    factory.applyThermoState(null, asSvc(svc), { humidity: -5 });
    expect(svc.getCharacteristic(CurrentHumidChar).value).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// applySwitchState
// ---------------------------------------------------------------------------

describe("applySwitchState", () => {
  it("sets On=true when state=ON", () => {
    const svc = makeMockService();
    factory.applySwitchState(asSvc(svc), { state: "ON" });
    expect(svc.getCharacteristic(OnChar).value).toBe(true);
  });

  it("sets On=false when state=OFF", () => {
    const svc = makeMockService();
    factory.applySwitchState(asSvc(svc), { state: "OFF" });
    expect(svc.getCharacteristic(OnChar).value).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyBatteryState
// ---------------------------------------------------------------------------

describe("applyBatteryState", () => {
  it("sets BatteryLevel and BATTERY_LEVEL_NORMAL when battery=80", () => {
    const svc = makeMockService();
    factory.applyBatteryState(asSvc(svc), { battery: 80 });
    expect(svc.getCharacteristic(BattLevelChar).value).toBe(80);
    expect(svc.getCharacteristic(StatusLowBattChar).value).toBe(
      StatusLowBattChar.BATTERY_LEVEL_NORMAL,
    );
  });

  it("sets BATTERY_LEVEL_LOW when battery=5", () => {
    const svc = makeMockService();
    factory.applyBatteryState(asSvc(svc), { battery: 5 });
    expect(svc.getCharacteristic(StatusLowBattChar).value).toBe(
      StatusLowBattChar.BATTERY_LEVEL_LOW,
    );
  });

  it("clamps battery above 100 to 100", () => {
    const svc = makeMockService();
    factory.applyBatteryState(asSvc(svc), { battery: 200 });
    expect(svc.getCharacteristic(BattLevelChar).value).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// createAccessory — service type selection
// ---------------------------------------------------------------------------

describe("createAccessory — accessory type", () => {
  it("returns null for a device with null definition", () => {
    const device = makeDevice([]);
    device.definition = null;
    expect(factory.createAccessory(device, mock())).toBeNull();
  });

  it("returns null when no supported capability is found (e.g. cover device)", () => {
    const device = makeDevice([{ type: "cover", features: [{ name: "state" }] }]);
    expect(factory.createAccessory(device, mock())).toBeNull();
  });

  it("creates a Lightbulb accessory for a light device", () => {
    const device = makeDevice(lightExposes([{ name: "state" }, { name: "brightness" }]));
    const result = factory.createAccessory(device, mock());
    expect(result).not.toBeNull();
    expect(result?.accessory.getService(LightbulbSvc)).toBeDefined();
  });

  it("creates a MotionSensor accessory", () => {
    const device = makeDevice([sensorExpose("occupancy")]);
    expect(
      factory.createAccessory(device, mock())?.accessory.getService(MotionSensorSvc),
    ).toBeDefined();
  });

  it("creates a ContactSensor accessory", () => {
    const device = makeDevice([sensorExpose("contact")]);
    expect(
      factory.createAccessory(device, mock())?.accessory.getService(ContactSensorSvc),
    ).toBeDefined();
  });

  it("creates a LeakSensor accessory", () => {
    const device = makeDevice([sensorExpose("water_leak")]);
    expect(
      factory.createAccessory(device, mock())?.accessory.getService(LeakSensorSvc),
    ).toBeDefined();
  });

  it("creates a TemperatureSensor accessory", () => {
    const device = makeDevice([numericExpose("temperature")]);
    expect(
      factory.createAccessory(device, mock())?.accessory.getService(TempSensorSvc),
    ).toBeDefined();
  });

  it("creates a HumiditySensor accessory", () => {
    const device = makeDevice([numericExpose("humidity")]);
    expect(
      factory.createAccessory(device, mock())?.accessory.getService(HumidSensorSvc),
    ).toBeDefined();
  });

  it("creates both temperature and humidity services on a combo device", () => {
    const device = makeDevice([numericExpose("temperature"), numericExpose("humidity")]);
    const acc = factory.createAccessory(device, mock())?.accessory;
    expect(acc.getService(TempSensorSvc)).toBeDefined();
    expect(acc.getService(HumidSensorSvc)).toBeDefined();
  });

  it("creates a Switch accessory", () => {
    const device = makeDevice(switchExposes());
    expect(factory.createAccessory(device, mock())?.accessory.getService(SwitchSvc)).toBeDefined();
  });

  it("adds a Battery service when the device exposes battery", () => {
    const device = makeDevice([sensorExpose("occupancy"), numericExpose("battery")]);
    expect(factory.createAccessory(device, mock())?.accessory.getService(BatterySvc)).toBeDefined();
  });

  it("does NOT add Battery service when the device has no battery expose", () => {
    const device = makeDevice([sensorExpose("occupancy")]);
    expect(
      factory.createAccessory(device, mock())?.accessory.getService(BatterySvc),
    ).toBeUndefined();
  });

  it("generates a stable UUID derived from ieee_address", () => {
    const device = makeDevice(lightExposes([{ name: "state" }]));
    const r1 = factory.createAccessory(device, mock());
    const r2 = factory.createAccessory(device, mock());
    expect(r1?.accessory.UUID).toBe(r2?.accessory.UUID);
  });

  it("populates Manufacturer, Model, SerialNumber from device.definition", () => {
    const device = makeDevice(lightExposes([{ name: "state" }]));
    const result = factory.createAccessory(device, mock());
    expect(result).not.toBeNull();
    const info = result?.accessory.getService(AccessoryInfoSvc);
    expect(info?.getCharacteristic(ManufacturerChar).value).toBe("TestCo");
    expect(info?.getCharacteristic(ModelChar).value).toBe("TEST-01");
    expect(info?.getCharacteristic(SerialNumberChar).value).toBe("0x0000000000000001");
  });
});

// ---------------------------------------------------------------------------
// createAccessory — write-back (onSet) callbacks
// ---------------------------------------------------------------------------

describe("createAccessory — write-back", () => {
  it("calls onSet with { state: 'ON' } when HAP turns a light on", () => {
    const onSet = mock<(cmd: Record<string, unknown>) => void>();
    const device = makeDevice(lightExposes([{ name: "state" }]));
    const result = factory.createAccessory(device, onSet);
    result?.accessory.getService(LightbulbSvc)?.getCharacteristic(OnChar).setValue(true);
    expect(onSet).toHaveBeenCalledWith({ state: "ON" });
  });

  it("calls onSet with { state: 'OFF' } when HAP turns a light off", () => {
    const onSet = mock<(cmd: Record<string, unknown>) => void>();
    const device = makeDevice(lightExposes([{ name: "state" }]));
    factory
      .createAccessory(device, onSet)
      ?.accessory.getService(LightbulbSvc)
      ?.getCharacteristic(OnChar)
      .setValue(false);
    expect(onSet).toHaveBeenCalledWith({ state: "OFF" });
  });

  it("calls onSet with z2m brightness when HAP sets Brightness=100", () => {
    const onSet = mock<(cmd: Record<string, unknown>) => void>();
    const device = makeDevice(lightExposes([{ name: "state" }, { name: "brightness" }]));
    factory
      .createAccessory(device, onSet)
      ?.accessory.getService(LightbulbSvc)
      ?.getCharacteristic(BrightnessChar)
      .setValue(100);
    expect(onSet).toHaveBeenCalledWith({ brightness: 254 });
  });

  it("calls onSet with color_temp when HAP sets ColorTemperature", () => {
    const onSet = mock<(cmd: Record<string, unknown>) => void>();
    const device = makeDevice(
      lightExposes([{ name: "state" }, { name: "brightness" }, { name: "color_temp" }]),
    );
    factory
      .createAccessory(device, onSet)
      ?.accessory.getService(LightbulbSvc)
      ?.getCharacteristic(ColorTempChar)
      .setValue(300);
    expect(onSet).toHaveBeenCalledWith({ color_temp: 300 });
  });

  it("calls onSet with { state } when HAP toggles a switch", () => {
    const onSet = mock<(cmd: Record<string, unknown>) => void>();
    const device = makeDevice(switchExposes());
    factory
      .createAccessory(device, onSet)
      ?.accessory.getService(SwitchSvc)
      ?.getCharacteristic(OnChar)
      .setValue(true);
    expect(onSet).toHaveBeenCalledWith({ state: "ON" });
  });
});

// ---------------------------------------------------------------------------
// createAccessory — updateState round-trip
// ---------------------------------------------------------------------------

describe("createAccessory — updateState", () => {
  it("sets On characteristic for a light via updateState", () => {
    const device = makeDevice(lightExposes([{ name: "state" }]));
    const result = factory.createAccessory(device, mock());
    result?.updateState({ state: "ON" });
    expect(result?.accessory.getService(LightbulbSvc)?.getCharacteristic(OnChar).value).toBe(true);
  });

  it("sets MotionDetected for a motion sensor via updateState", () => {
    const device = makeDevice([sensorExpose("occupancy")]);
    const result = factory.createAccessory(device, mock());
    result?.updateState({ occupancy: true });
    expect(
      result?.accessory.getService(MotionSensorSvc)?.getCharacteristic(MotionDetectedChar).value,
    ).toBe(true);
  });

  it("updateState also updates Battery when battery is exposed", () => {
    const device = makeDevice([sensorExpose("occupancy"), numericExpose("battery")]);
    const result = factory.createAccessory(device, mock());
    result?.updateState({ occupancy: false, battery: 42 });
    expect(result?.accessory.getService(BatterySvc)?.getCharacteristic(BattLevelChar).value).toBe(
      42,
    );
  });

  it("sets ContactSensorState via updateState", () => {
    const device = makeDevice([sensorExpose("contact")]);
    const result = factory.createAccessory(device, mock());
    result?.updateState({ contact: false });
    expect(
      result?.accessory.getService(ContactSensorSvc)?.getCharacteristic(ContactStateChar).value,
    ).toBe(ContactStateChar.CONTACT_NOT_DETECTED);
  });

  it("sets LeakDetected via updateState", () => {
    const device = makeDevice([sensorExpose("water_leak")]);
    const result = factory.createAccessory(device, mock());
    result?.updateState({ water_leak: true });
    expect(
      result?.accessory.getService(LeakSensorSvc)?.getCharacteristic(LeakDetectedChar).value,
    ).toBe(LeakDetectedChar.LEAK_DETECTED);
  });

  it("sets temperature via updateState", () => {
    const device = makeDevice([numericExpose("temperature")]);
    const result = factory.createAccessory(device, mock());
    result?.updateState({ temperature: 21.0 });
    expect(
      result?.accessory.getService(TempSensorSvc)?.getCharacteristic(CurrentTempChar).value,
    ).toBe(21.0);
  });

  it("sets humidity via updateState", () => {
    const device = makeDevice([numericExpose("humidity")]);
    const result = factory.createAccessory(device, mock());
    result?.updateState({ humidity: 55 });
    expect(
      result?.accessory.getService(HumidSensorSvc)?.getCharacteristic(CurrentHumidChar).value,
    ).toBe(55);
  });

  it("sets battery via updateState for a switch with battery", () => {
    const device = makeDevice([...switchExposes(), numericExpose("battery")]);
    const result = factory.createAccessory(device, mock());
    result?.updateState({ state: "ON", battery: 72 });
    expect(result?.accessory.getService(SwitchSvc)?.getCharacteristic(OnChar).value).toBe(true);
    expect(result?.accessory.getService(BatterySvc)?.getCharacteristic(BattLevelChar).value).toBe(
      72,
    );
  });
});
