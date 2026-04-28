import { Accessory, Characteristic, Service, uuid } from "hap-nodejs";
import type { ZigbeeDevice } from "../../types/zigbee/bridge.js";

// ---------------------------------------------------------------------------
// HAP category constants
// (Categories is a const enum in hap-nodejs so it cannot be used with
//  isolatedModules; numeric values are inlined here with documentation.)
// ---------------------------------------------------------------------------

/** @see https://github.com/homebridge/HAP-NodeJS/blob/master/src/lib/Accessory.ts */
export const HAP_CATEGORY_OTHER = 1;
export const HAP_CATEGORY_BRIDGE = 2;
export const HAP_CATEGORY_LIGHTBULB = 5;
export const HAP_CATEGORY_SWITCH = 8;
export const HAP_CATEGORY_SENSOR = 10;

// ---------------------------------------------------------------------------
// Internal Zigbee2MQTT exposes types
// ---------------------------------------------------------------------------

interface Z2MExpose {
  type: string;
  name?: string;
  property?: string;
  features?: Z2MExpose[];
}

// ---------------------------------------------------------------------------
// Device capability detection
// ---------------------------------------------------------------------------

interface DeviceCapabilities {
  /** Device has a controllable on/off state and brightness → Lightbulb */
  isLight: boolean;
  hasBrightness: boolean;
  hasColorTemp: boolean;
  /** Device exposes CIE xy color (reported as color.x / color.y) */
  hasColorXY: boolean;
  /** Device exposes hue/saturation color (reported as color.hue / color.saturation) */
  hasColorHS: boolean;
  /** Device is a switch or outlet (on/off only, no brightness) */
  isSwitch: boolean;
  hasOccupancy: boolean;
  hasContact: boolean;
  hasWaterLeak: boolean;
  hasTemperature: boolean;
  hasHumidity: boolean;
  hasBattery: boolean;
}

/**
 * Extracts device capabilities by inspecting the Zigbee2MQTT `exposes` array.
 * Returns null when the device has no `definition` (unsupported/unrecognised device).
 */
export function detectCapabilities(device: ZigbeeDevice): DeviceCapabilities | null {
  if (!device.definition) return null;

  const exposes = device.definition.exposes as Z2MExpose[];
  const caps: DeviceCapabilities = {
    isLight: false,
    hasBrightness: false,
    hasColorTemp: false,
    hasColorXY: false,
    hasColorHS: false,
    isSwitch: false,
    hasOccupancy: false,
    hasContact: false,
    hasWaterLeak: false,
    hasTemperature: false,
    hasHumidity: false,
    hasBattery: false,
  };

  for (const expose of exposes) {
    switch (expose.type) {
      case "light": {
        caps.isLight = true;
        for (const feature of expose.features ?? []) {
          if (feature.name === "brightness") caps.hasBrightness = true;
          if (feature.name === "color_temp") caps.hasColorTemp = true;
          if (feature.name === "color_xy") caps.hasColorXY = true;
          if (feature.name === "color_hs") caps.hasColorHS = true;
        }
        break;
      }
      case "switch":
      case "outlet": {
        caps.isSwitch = true;
        break;
      }
      default: {
        // Scalar/binary exposes at the top level
        switch (expose.name) {
          case "occupancy":
            caps.hasOccupancy = true;
            break;
          case "contact":
            caps.hasContact = true;
            break;
          case "water_leak":
            caps.hasWaterLeak = true;
            break;
          case "temperature":
            caps.hasTemperature = true;
            break;
          case "humidity":
            caps.hasHumidity = true;
            break;
          case "battery":
            caps.hasBattery = true;
            break;
        }
      }
    }
  }

  return caps;
}

// ---------------------------------------------------------------------------
// Color-space conversion (CIE xy → hue/saturation)
// ---------------------------------------------------------------------------

/**
 * Converts CIE 1931 xy chromaticity coordinates to HomeKit Hue (0–360) and
 * Saturation (0–100). Uses the Philips Hue–recommended wide-gamut D65 matrix.
 */
export function xyToHueSaturation(x: number, y: number): { hue: number; saturation: number } {
  // Guard against degenerate inputs
  if (y === 0) return { hue: 0, saturation: 0 };

  const z = 1 - x - y;
  // Assume Y = 1 (normalised luminance)
  const Y = 1;
  const X = (Y / y) * x;
  const Z = (Y / y) * z;

  // Wide-gamut sRGB matrix (D65 white point)
  let r = X * 1.656492 - Y * 0.354851 - Z * 0.255038;
  let g = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
  let b = X * 0.051713 - Y * 0.121364 + Z * 1.01153;

  // Clip negatives
  r = Math.max(0, r);
  g = Math.max(0, g);
  b = Math.max(0, b);

  // Apply gamma correction (sRGB)
  const applyGamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  r = applyGamma(r);
  g = applyGamma(g);
  b = applyGamma(b);

  // Normalize so the largest channel = 1
  const max = Math.max(r, g, b);
  if (max > 0) {
    r /= max;
    g /= max;
    b /= max;
  }

  // RGB → Hue/Saturation
  const cmax = Math.max(r, g, b);
  const cmin = Math.min(r, g, b);
  const delta = cmax - cmin;

  let hue = 0;
  if (delta > 0) {
    if (cmax === r) {
      hue = 60 * (((g - b) / delta) % 6);
    } else if (cmax === g) {
      hue = 60 * ((b - r) / delta + 2);
    } else {
      hue = 60 * ((r - g) / delta + 4);
    }
  }
  if (hue < 0) hue += 360;

  const saturation = cmax === 0 ? 0 : (delta / cmax) * 100;

  return {
    hue: Math.round(hue),
    saturation: Math.round(saturation),
  };
}

// ---------------------------------------------------------------------------
// State application helpers
// ---------------------------------------------------------------------------

/** Maps Zigbee2MQTT brightness (0–254) to HomeKit (0–100). */
function z2mBrightnessToHap(z2m: number): number {
  return Math.round((Math.min(254, Math.max(0, z2m)) / 254) * 100);
}

/** Maps HomeKit brightness (0–100) to Zigbee2MQTT (0–254). */
export function hapBrightnessToZ2m(hap: number): number {
  return Math.round((Math.min(100, Math.max(0, hap)) / 100) * 254);
}

/** Clamps a color temperature value to the HAP Characteristic bounds (140–500 mired). */
function clampColorTemp(mired: number): number {
  return Math.round(Math.min(500, Math.max(140, mired)));
}

/**
 * Updates a Lightbulb service from a Zigbee2MQTT state payload.
 * Handles state, brightness, color_temp, and color (xy or hs).
 */
export function applyLightState(
  service: Service,
  state: Record<string, unknown>,
  hasColorTemp: boolean,
  hasColor: boolean,
): void {
  if (typeof state.state === "string") {
    service.getCharacteristic(Characteristic.On).updateValue(state.state === "ON");
  }
  if (typeof state.brightness === "number") {
    service
      .getCharacteristic(Characteristic.Brightness)
      .updateValue(z2mBrightnessToHap(state.brightness));
  }
  if (hasColorTemp && typeof state.color_temp === "number") {
    service
      .getCharacteristic(Characteristic.ColorTemperature)
      .updateValue(clampColorTemp(state.color_temp));
  }
  if (hasColor) {
    const color = state.color as Record<string, number> | undefined;
    if (color) {
      if (typeof color.hue === "number" && typeof color.saturation === "number") {
        service.getCharacteristic(Characteristic.Hue).updateValue(Math.round(color.hue));
        service
          .getCharacteristic(Characteristic.Saturation)
          .updateValue(Math.round(color.saturation));
      } else if (typeof color.x === "number" && typeof color.y === "number") {
        const { hue, saturation } = xyToHueSaturation(color.x, color.y);
        service.getCharacteristic(Characteristic.Hue).updateValue(hue);
        service.getCharacteristic(Characteristic.Saturation).updateValue(saturation);
      }
    }
  }
}

/**
 * Updates a MotionSensor service from a Zigbee2MQTT state payload.
 */
export function applyMotionState(service: Service, state: Record<string, unknown>): void {
  if (typeof state.occupancy === "boolean") {
    service.getCharacteristic(Characteristic.MotionDetected).updateValue(state.occupancy);
  }
}

/**
 * Updates a ContactSensor service from a Zigbee2MQTT state payload.
 * In Zigbee2MQTT `contact: true` means the magnet is near (closed).
 * HAP ContactSensorState: 0 = CONTACT_DETECTED, 1 = CONTACT_NOT_DETECTED.
 */
export function applyContactState(service: Service, state: Record<string, unknown>): void {
  if (typeof state.contact === "boolean") {
    service
      .getCharacteristic(Characteristic.ContactSensorState)
      .updateValue(
        state.contact
          ? Characteristic.ContactSensorState.CONTACT_DETECTED
          : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
      );
  }
}

/**
 * Updates a LeakSensor service from a Zigbee2MQTT state payload.
 * HAP LeakDetected: 0 = LEAK_NOT_DETECTED, 1 = LEAK_DETECTED.
 */
export function applyLeakState(service: Service, state: Record<string, unknown>): void {
  if (typeof state.water_leak === "boolean") {
    service
      .getCharacteristic(Characteristic.LeakDetected)
      .updateValue(
        state.water_leak
          ? Characteristic.LeakDetected.LEAK_DETECTED
          : Characteristic.LeakDetected.LEAK_NOT_DETECTED,
      );
  }
}

/**
 * Updates temperature and/or humidity sensor services from a Zigbee2MQTT state payload.
 */
export function applyThermoState(
  tempService: Service | null,
  humidService: Service | null,
  state: Record<string, unknown>,
): void {
  if (tempService && typeof state.temperature === "number") {
    tempService.getCharacteristic(Characteristic.CurrentTemperature).updateValue(state.temperature);
  }
  if (humidService && typeof state.humidity === "number") {
    humidService
      .getCharacteristic(Characteristic.CurrentRelativeHumidity)
      .updateValue(Math.min(100, Math.max(0, state.humidity)));
  }
}

/**
 * Updates a Switch or Outlet service from a Zigbee2MQTT state payload.
 */
export function applySwitchState(service: Service, state: Record<string, unknown>): void {
  if (typeof state.state === "string") {
    service.getCharacteristic(Characteristic.On).updateValue(state.state === "ON");
  }
}

/**
 * Updates a Battery service from a Zigbee2MQTT state payload.
 * HAP StatusLowBattery: 0 = BATTERY_LEVEL_NORMAL, 1 = BATTERY_LEVEL_LOW.
 */
export function applyBatteryState(service: Service, state: Record<string, unknown>): void {
  if (typeof state.battery === "number") {
    const level = Math.min(100, Math.max(0, Math.round(state.battery)));
    service.getCharacteristic(Characteristic.BatteryLevel).updateValue(level);
    service
      .getCharacteristic(Characteristic.StatusLowBattery)
      .updateValue(
        level <= 10
          ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
          : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
      );
  }
}

// ---------------------------------------------------------------------------
// Accessory factory
// ---------------------------------------------------------------------------

/**
 * Result of `createAccessory`.
 * Contains the HAP Accessory and a function that pushes Zigbee2MQTT state
 * changes into the corresponding HAP characteristics.
 */
export interface CreatedAccessory {
  /** The HAP Accessory ready to be bridged. */
  accessory: Accessory;
  /**
   * Call this whenever the device's Zigbee2MQTT state changes.
   * It maps the raw payload onto the appropriate HAP characteristic values.
   */
  updateState: (state: Record<string, unknown>) => void;
}

/**
 * Creates a HAP Accessory for the given Zigbee2MQTT device.
 *
 * Returns `null` when the device has no definition (unsupported) or when no
 * supported capability is detected in its `exposes` list.
 *
 * @param device   - Zigbee2MQTT device metadata.
 * @param onSet    - Callback invoked with the MQTT command payload when HomeKit
 *                   changes a writable characteristic. Wire this to
 *                   `mqttService.publishToDevice(friendlyName, cmd)`.
 */
export function createAccessory(
  device: ZigbeeDevice,
  onSet: (command: Record<string, unknown>) => void,
): CreatedAccessory | null {
  const caps = detectCapabilities(device);
  if (!caps) return null;

  const { friendly_name } = device;
  const accessoryUuid = uuid.generate(device.ieee_address);

  let category: number = HAP_CATEGORY_OTHER;
  let accessory: Accessory;
  let updateState: (state: Record<string, unknown>) => void;

  // ------------------------------------------------------------------
  // Determine primary accessory type and build services
  // ------------------------------------------------------------------

  if (caps.isLight) {
    category = HAP_CATEGORY_LIGHTBULB;
    accessory = new Accessory(friendly_name, accessoryUuid);
    accessory.category = category;

    const lightService = accessory.addService(Service.Lightbulb);

    // Optional characteristics
    if (caps.hasColorTemp) {
      lightService.addOptionalCharacteristic(Characteristic.ColorTemperature);
    }
    if (caps.hasColorXY || caps.hasColorHS) {
      lightService.addOptionalCharacteristic(Characteristic.Hue);
      lightService.addOptionalCharacteristic(Characteristic.Saturation);
    }

    // Write-back: On/Off
    lightService.getCharacteristic(Characteristic.On).onSet((value) => {
      onSet({ state: value ? "ON" : "OFF" });
    });

    // Write-back: Brightness
    if (caps.hasBrightness) {
      lightService.getCharacteristic(Characteristic.Brightness).onSet((value) => {
        onSet({ brightness: hapBrightnessToZ2m(value as number) });
      });
    }

    // Write-back: ColorTemperature
    if (caps.hasColorTemp) {
      lightService.getCharacteristic(Characteristic.ColorTemperature).onSet((value) => {
        onSet({ color_temp: value as number });
      });
    }

    // Write-back: Hue / Saturation (send as hs pair)
    if (caps.hasColorXY || caps.hasColorHS) {
      let pendingHue: number | null = null;
      let pendingTimer: ReturnType<typeof setTimeout> | null = null;

      const flushColor = (hue: number, saturation: number) => {
        onSet({ color: { hue, saturation } });
        pendingHue = null;
        pendingTimer = null;
      };

      lightService.getCharacteristic(Characteristic.Hue).onSet((value) => {
        pendingHue = value as number;
        if (pendingTimer) clearTimeout(pendingTimer);
        pendingTimer = setTimeout(() => {
          const hue = pendingHue;
          if (hue === null) return;
          const sat =
            (lightService.getCharacteristic(Characteristic.Saturation).value as number) ?? 100;
          flushColor(hue, sat);
        }, 50);
      });

      lightService.getCharacteristic(Characteristic.Saturation).onSet((value) => {
        if (pendingTimer) clearTimeout(pendingTimer);
        const hue =
          pendingHue ?? (lightService.getCharacteristic(Characteristic.Hue).value as number) ?? 0;
        flushColor(hue, value as number);
      });
    }

    const hasColor = caps.hasColorXY || caps.hasColorHS;
    updateState = (state: Record<string, unknown>) => {
      applyLightState(lightService, state, caps.hasColorTemp, hasColor);
      if (caps.hasBattery) {
        const bat = accessory.getService(Service.Battery);
        if (bat) applyBatteryState(bat, state);
      }
    };
  } else if (caps.hasOccupancy) {
    category = HAP_CATEGORY_SENSOR;
    accessory = new Accessory(friendly_name, accessoryUuid);
    accessory.category = category;
    const motionService = accessory.addService(Service.MotionSensor);
    updateState = (state) => {
      applyMotionState(motionService, state);
      if (caps.hasBattery) {
        const bat = accessory.getService(Service.Battery);
        if (bat) applyBatteryState(bat, state);
      }
    };
  } else if (caps.hasContact) {
    category = HAP_CATEGORY_SENSOR;
    accessory = new Accessory(friendly_name, accessoryUuid);
    accessory.category = category;
    const contactService = accessory.addService(Service.ContactSensor);
    updateState = (state) => {
      applyContactState(contactService, state);
      if (caps.hasBattery) {
        const bat = accessory.getService(Service.Battery);
        if (bat) applyBatteryState(bat, state);
      }
    };
  } else if (caps.hasWaterLeak) {
    category = HAP_CATEGORY_SENSOR;
    accessory = new Accessory(friendly_name, accessoryUuid);
    accessory.category = category;
    const leakService = accessory.addService(Service.LeakSensor);
    updateState = (state) => {
      applyLeakState(leakService, state);
      if (caps.hasBattery) {
        const bat = accessory.getService(Service.Battery);
        if (bat) applyBatteryState(bat, state);
      }
    };
  } else if (caps.hasTemperature || caps.hasHumidity) {
    category = HAP_CATEGORY_SENSOR;
    accessory = new Accessory(friendly_name, accessoryUuid);
    accessory.category = category;
    const tempService = caps.hasTemperature
      ? accessory.addService(Service.TemperatureSensor)
      : null;
    const humidService = caps.hasHumidity ? accessory.addService(Service.HumiditySensor) : null;
    updateState = (state) => {
      applyThermoState(tempService, humidService, state);
      if (caps.hasBattery) {
        const bat = accessory.getService(Service.Battery);
        if (bat) applyBatteryState(bat, state);
      }
    };
  } else if (caps.isSwitch) {
    category = HAP_CATEGORY_SWITCH;
    accessory = new Accessory(friendly_name, accessoryUuid);
    accessory.category = category;
    const switchService = accessory.addService(Service.Switch);
    switchService.getCharacteristic(Characteristic.On).onSet((value) => {
      onSet({ state: value ? "ON" : "OFF" });
    });
    updateState = (state) => {
      applySwitchState(switchService, state);
      if (caps.hasBattery) {
        const bat = accessory.getService(Service.Battery);
        if (bat) applyBatteryState(bat, state);
      }
    };
  } else {
    // No supported capability detected
    return null;
  }

  // Battery is a secondary service added to any accessory that exposes it
  if (caps.hasBattery) {
    accessory.addService(Service.Battery);
  }

  // Populate AccessoryInformation
  const info = accessory.getService(Service.AccessoryInformation);
  if (info) {
    info
      .getCharacteristic(Characteristic.Manufacturer)
      .updateValue(device.definition?.vendor ?? "Unknown");
    info.getCharacteristic(Characteristic.Model).updateValue(device.definition?.model ?? "Unknown");
    info.getCharacteristic(Characteristic.SerialNumber).updateValue(device.ieee_address);
  }

  return { accessory, updateState };
}
