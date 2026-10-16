import { Characteristic, type Service } from "hap-nodejs";

// ---------------------------------------------------------------------------
// HAP category constants
// (Categories is a const enum in hap-nodejs so it cannot be used with
//  isolatedModules; numeric values are inlined here with documentation.)
// ---------------------------------------------------------------------------

/** @see https://github.com/homebridge/HAP-NodeJS/blob/master/src/lib/Accessory.ts */
export const HAP_CATEGORY_OTHER = 1;
export const HAP_CATEGORY_LIGHTBULB = 5;
export const HAP_CATEGORY_SWITCH = 8;
export const HAP_CATEGORY_SENSOR = 10;

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
