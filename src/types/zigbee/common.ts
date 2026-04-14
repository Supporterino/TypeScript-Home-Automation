/**
 * Common Zigbee2MQTT primitives and generic payloads.
 *
 * These types work across all brands and device categories. Use them when
 * writing automations that should work with any compatible device.
 */

// ===========================================================================
// Common primitives
// ===========================================================================

/** Binary on/off state reported by devices. */
export type DeviceState = "ON" | "OFF";

/** Extended state for set commands — includes TOGGLE. */
export type DeviceStateSet = DeviceState | "TOGGLE";

/** Power-on behavior supported by most IKEA and Philips devices. */
export type PowerOnBehavior = "off" | "on" | "toggle" | "previous";

// ---------------------------------------------------------------------------
// Color types
// ---------------------------------------------------------------------------

/** CIE xy color space coordinates. */
export interface ColorXY {
  x: number;
  y: number;
}

/** Hue and saturation color representation. */
export interface ColorHS {
  hue: number;
  saturation: number;
}

/** RGB color values (0–255 per channel). */
export interface ColorRGB {
  r: number;
  g: number;
  b: number;
}

/** Hex color string (e.g. "#FF0000"). */
export interface ColorHex {
  hex: string;
}

/** Any supported color format for set commands. */
export type Color = ColorXY | ColorHS | ColorRGB | ColorHex;

// ===========================================================================
// Generic payloads — category-level types that work across brands
// ===========================================================================

// ---------------------------------------------------------------------------
// Generic light payloads
// ---------------------------------------------------------------------------

/**
 * Generic state payload for any dimmable light.
 *
 * Covers all lights that support on/off and brightness control.
 * Works with: Philips Hue, IKEA TRADFRI, and other dimmable bulbs/drivers.
 */
export interface DimmableLightPayload {
  state: DeviceState;
  brightness?: number;
  power_on_behavior?: PowerOnBehavior;
  linkquality?: number;
}

/**
 * Generic state payload for any white-spectrum (color temperature) light.
 *
 * Extends dimmable with color temperature support.
 * Works with: any bulb that supports warm-to-cool white adjustment.
 */
export interface WhiteSpectrumLightPayload extends DimmableLightPayload {
  /** Color temperature in mired. Lower = cooler, higher = warmer. */
  color_temp?: number;
  color_temp_startup?: number | "previous";
}

/**
 * Generic state payload for any color light.
 *
 * Extends white-spectrum with full color support.
 * Works with: any bulb that supports RGB/XY color.
 */
export interface ColorLightPayload extends WhiteSpectrumLightPayload {
  /** Color in CIE xy coordinates (reported by device). */
  color?: ColorXY;
}

/**
 * Generic state payload covering all light types.
 *
 * Use this when you don't know or don't care about the exact light type.
 * All fields are optional except `state`.
 */
export interface LightPayload {
  state: DeviceState;
  brightness?: number;
  color_temp?: number;
  color_temp_startup?: number | "previous";
  color?: ColorXY;
  power_on_behavior?: PowerOnBehavior;
  linkquality?: number;
}

// ---------------------------------------------------------------------------
// Generic light set commands
// ---------------------------------------------------------------------------

/**
 * Generic set command for any dimmable light.
 *
 * Supports on/off, brightness, transition, and timed auto-off.
 */
export interface DimmableLightSetCommand {
  state?: DeviceStateSet;
  brightness?: number;
  /** Transition time in seconds. */
  transition?: number;
  power_on_behavior?: PowerOnBehavior;
  /** Light effect (exact values depend on the device). */
  effect?: string;
  /** Timed auto-off in seconds. */
  on_time?: number;
  /** Cooldown after timed-off in seconds. */
  off_wait_time?: number;
  /** Continuous brightness move (positive=up, negative=down, 0=stop). */
  brightness_move?: number;
  /** Increment/decrement brightness by step. */
  brightness_step?: number;
  /** Like brightness_move but turns on the light if off. */
  brightness_move_onoff?: number;
  /** Like brightness_step but turns on the light if off. */
  brightness_step_onoff?: number;
}

/**
 * Generic set command for any white-spectrum light.
 *
 * Extends dimmable with color temperature controls.
 */
export interface WhiteSpectrumLightSetCommand extends DimmableLightSetCommand {
  /** Color temperature in mired. */
  color_temp?: number;
  color_temp_startup?: number | "previous";
  /** Move color temp continuously. */
  color_temp_move?: number | "stop" | "up" | "down";
  /** Step color temp. */
  color_temp_step?: number;
}

/**
 * Generic set command for any color light.
 *
 * Extends white-spectrum with full color and hue/saturation controls.
 */
export interface ColorLightSetCommand extends WhiteSpectrumLightSetCommand {
  /** Color in CIE xy, hue/saturation, RGB, or hex. */
  color?: Color;
  /** Continuous hue rotation (-255 to 255, 0=stop). */
  hue_move?: number;
  /** Increment/decrement hue by step. */
  hue_step?: number;
  /** Continuous saturation move (-255 to 255, 0=stop). */
  saturation_move?: number;
  /** Increment/decrement saturation by step. */
  saturation_step?: number;
}

/**
 * Generic set command covering all light types.
 *
 * Use this when you don't know or don't care about the exact light type.
 */
export interface LightSetCommand {
  state?: DeviceStateSet;
  brightness?: number;
  color_temp?: number;
  color_temp_startup?: number | "previous";
  color?: Color;
  transition?: number;
  power_on_behavior?: PowerOnBehavior;
  effect?: string;
  on_time?: number;
  off_wait_time?: number;
  brightness_move?: number;
  brightness_step?: number;
  brightness_move_onoff?: number;
  brightness_step_onoff?: number;
  color_temp_move?: number | "stop" | "up" | "down";
  color_temp_step?: number;
  hue_move?: number;
  hue_step?: number;
  saturation_move?: number;
  saturation_step?: number;
}

// ---------------------------------------------------------------------------
// Generic sensor payloads
// ---------------------------------------------------------------------------

/**
 * Generic occupancy / motion sensor payload.
 *
 * Works with: any PIR motion sensor (Aqara, Philips Hue, IKEA, etc.).
 */
export interface OccupancyPayload {
  occupancy: boolean;
  illuminance?: number;
  illuminance_lux?: number;
  temperature?: number;
  battery?: number;
  linkquality?: number;
}

/**
 * Generic temperature and humidity sensor payload.
 *
 * Works with: Aqara WSDCGQ11LM, IKEA VINDSTYRKA, and similar.
 */
export interface TemperatureHumidityPayload {
  temperature: number;
  humidity: number;
  pressure?: number;
  battery?: number;
  voltage?: number;
  linkquality?: number;
}

/**
 * Generic contact (door/window) sensor payload.
 *
 * Works with: any magnetic contact sensor (Aqara, IKEA PARASOLL, etc.).
 */
export interface ContactPayload {
  contact: boolean;
  battery?: number;
  voltage?: number;
  linkquality?: number;
}

/**
 * Generic water leak sensor payload.
 *
 * Works with: any water leak sensor (Aqara SJCGQ11LM, etc.).
 */
export interface WaterLeakPayload {
  water_leak: boolean;
  battery?: number;
  battery_low?: boolean;
  voltage?: number;
  device_temperature?: number;
  linkquality?: number;
}

/**
 * Generic air quality sensor payload.
 *
 * Works with: any sensor reporting PM2.5, VOC, temperature, humidity.
 */
export interface AirQualitySensorPayload {
  temperature?: number;
  humidity?: number;
  pm25?: number;
  voc_index?: number;
  linkquality?: number;
}

// ---------------------------------------------------------------------------
// Generic remote / button payloads
// ---------------------------------------------------------------------------

/**
 * Generic button or remote payload.
 *
 * The `action` field is a plain string — use brand-specific types for
 * narrowed action values.
 * Works with: any Zigbee button, remote, or dimmer.
 */
export interface ButtonPayload {
  action: string;
  battery?: number;
  voltage?: number;
  linkquality?: number;
}

// ---------------------------------------------------------------------------
// Generic plug / switch payloads
// ---------------------------------------------------------------------------

/**
 * Generic smart plug payload with optional power monitoring.
 *
 * Works with: any on/off plug or switch with power metering.
 */
export interface PlugPayload {
  state: DeviceState;
  power?: number;
  voltage?: number;
  current?: number;
  energy?: number;
  linkquality?: number;
}

/**
 * Generic set command for any switch or plug.
 */
export interface SwitchSetCommand {
  state: DeviceStateSet;
}

// ---------------------------------------------------------------------------
// Generic air purifier payloads
// ---------------------------------------------------------------------------

/**
 * Generic air purifier payload.
 *
 * Works with: IKEA STARKVIND and similar fan/purifier combos.
 */
export interface AirPurifierPayload {
  fan_state: DeviceState;
  fan_speed?: number;
  pm25?: number;
  linkquality?: number;
}

// ---------------------------------------------------------------------------
// Bridge
// ---------------------------------------------------------------------------

/** Zigbee2MQTT bridge state published on `zigbee2mqtt/bridge/state`. */
export interface BridgeState {
  state: "online" | "offline";
}

// ---------------------------------------------------------------------------
// Generic fallback
// ---------------------------------------------------------------------------

/** Generic device payload — use when you don't know the exact type. */
export type GenericPayload = Record<string, unknown>;
