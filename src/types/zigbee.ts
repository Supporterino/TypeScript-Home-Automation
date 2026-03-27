/**
 * Zigbee2MQTT device payload types.
 *
 * Organized in three layers:
 *
 * 1. **Common primitives** — shared enums, color types, state types
 * 2. **Generic payloads** — category-level types (any dimmable light, any motion
 *    sensor, any remote, etc.) that work across brands
 * 3. **Brand-specific payloads** — narrowed types for specific manufacturers/models
 *    with exact action values, effects, and fields
 *
 * Use the generic types when writing automations that should work with any device
 * in a category. Use the brand-specific types when you need exact typing for a
 * particular model.
 */

// ===========================================================================
// 1. COMMON PRIMITIVES
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
// 2. GENERIC PAYLOADS — category-level types that work across brands
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

// ===========================================================================
// 3. BRAND-SPECIFIC PAYLOADS
// ===========================================================================

// ---------------------------------------------------------------------------
// Philips Hue — lights
// ---------------------------------------------------------------------------

/**
 * Light effects for Philips Hue dimmable and white-spectrum bulbs.
 *
 * Supported by: LWG004, 9290030514, 929002241201, 8718699673147, 8719514301481.
 */
export type PhilipsLightEffect =
  | "blink"
  | "breathe"
  | "okay"
  | "channel_change"
  | "candle"
  | "finish_effect"
  | "stop_effect"
  | "stop_hue_effect";

/**
 * Light effects for Philips Hue color bulbs (superset of PhilipsLightEffect).
 *
 * Adds `fireplace` and `colorloop`.
 * Supported by: 9290022166, 8718699703424.
 */
export type PhilipsColorLightEffect =
  | PhilipsLightEffect
  | "fireplace"
  | "colorloop";

/**
 * Set command for Philips Hue dimmable-only bulbs.
 *
 * Supported devices:
 * - Philips LWG004 (Hue White GU10)
 * - Philips 9290030514 (Hue Filament Standard A60)
 * - Philips 929002241201 (Hue White Filament Edison E27)
 * - Philips 8718699673147 (Hue White A60 E27)
 */
export interface PhilipsDimmableLightSetCommand extends Omit<DimmableLightSetCommand, "effect"> {
  effect?: PhilipsLightEffect;
}

/**
 * Set command for Philips Hue white-spectrum bulbs.
 *
 * Supported devices:
 * - Philips 8719514301481 (Hue Filament Globe Ambiance E27, 222–454 mired)
 */
export interface PhilipsWhiteSpectrumLightSetCommand extends Omit<WhiteSpectrumLightSetCommand, "effect"> {
  effect?: PhilipsLightEffect;
}

/**
 * Set command for Philips Hue color bulbs.
 *
 * Supported devices:
 * - Philips 9290022166 (Hue White and Color Ambiance E26/E27, 153–500 mired)
 * - Philips 8718699703424 (Hue LightStrip Plus V2, 150–500 mired)
 */
export interface PhilipsColorLightSetCommand extends Omit<ColorLightSetCommand, "effect"> {
  effect?: PhilipsColorLightEffect;
}

// ---------------------------------------------------------------------------
// Philips Hue — motion sensors
// ---------------------------------------------------------------------------

/** Motion sensitivity levels for Philips Hue motion sensors. */
export type PhilipsMotionSensitivity = "low" | "medium" | "high" | "very_high" | "max";

/**
 * State payload for Philips Hue motion sensors.
 *
 * Supported devices:
 * - Philips 9290012607 (Hue Motion Sensor, sensitivity: low/medium/high)
 * - Philips 9290030675 (Hue Motion Sensor, sensitivity: low/medium/high/very_high/max)
 */
export interface PhilipsHueMotionSensorPayload extends OccupancyPayload {
  motion_sensitivity?: PhilipsMotionSensitivity;
  led_indication?: boolean;
  /** Occupancy timeout in seconds (0–65535). */
  occupancy_timeout?: number;
}

/**
 * Set command for Philips Hue motion sensors.
 *
 * Supported devices:
 * - Philips 9290012607 (Hue Motion Sensor)
 * - Philips 9290030675 (Hue Motion Sensor)
 */
export interface PhilipsHueMotionSensorSetCommand {
  motion_sensitivity?: PhilipsMotionSensitivity;
  led_indication?: boolean;
  /** Occupancy timeout in seconds (0–65535). */
  occupancy_timeout?: number;
}

// ---------------------------------------------------------------------------
// IKEA — lights
// ---------------------------------------------------------------------------

/**
 * Light effects for IKEA TRADFRI bulbs and LED drivers.
 *
 * Supported by: LED2102G3, LED2005R5/LED2106R3, ICPSHC24.
 */
export type IkeaLightEffect =
  | "blink"
  | "breathe"
  | "okay"
  | "channel_change"
  | "finish_effect"
  | "stop_effect";

/**
 * Set command for IKEA TRADFRI dimmable-only lights.
 *
 * Supported devices:
 * - IKEA LED2102G3 (TRADFRI bulb E26/E27, warm white 440/450/470 lm)
 * - IKEA ICPSHC24-30EU-IL-1 / ICPSHC24-10EU-IL-2 (TRADFRI LED driver 10W/30W)
 */
export interface IkeaDimmableLightSetCommand extends Omit<DimmableLightSetCommand, "effect"> {
  effect?: IkeaLightEffect;
}

/**
 * Set command for IKEA TRADFRI white-spectrum lights.
 *
 * Supported devices:
 * - IKEA LED2005R5 / LED2106R3 (TRADFRI bulb GU10, white spectrum 345/380 lm, 250–454 mired)
 */
export interface IkeaWhiteSpectrumLightSetCommand extends Omit<WhiteSpectrumLightSetCommand, "effect"> {
  effect?: IkeaLightEffect;
}

// ---------------------------------------------------------------------------
// IKEA — STARKVIND air purifier
// ---------------------------------------------------------------------------

/** Air quality levels reported by IKEA STARKVIND. */
export type IkeaAirQuality =
  | "excellent"
  | "good"
  | "moderate"
  | "poor"
  | "unhealthy"
  | "hazardous"
  | "out_of_range"
  | "unknown";

/** Fan speed modes for IKEA STARKVIND. */
export type IkeaFanMode = "off" | "auto" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

/**
 * State payload for IKEA STARKVIND air purifier.
 *
 * Supported devices:
 * - IKEA E2007 (STARKVIND air purifier table/standing)
 */
export interface IkeaStarkvindPayload extends AirPurifierPayload {
  air_quality?: IkeaAirQuality;
  led_enable?: boolean;
  child_lock?: "LOCK" | "UNLOCK";
  replace_filter?: boolean;
  /** Filter usage duration in minutes. */
  filter_age?: number;
  /** Device usage duration in minutes. */
  device_age?: number;
}

/**
 * Set command for IKEA STARKVIND air purifier.
 *
 * Supported devices:
 * - IKEA E2007 (STARKVIND air purifier table/standing)
 */
export interface IkeaStarkvindSetCommand {
  fan_state?: DeviceState;
  fan_mode?: IkeaFanMode;
  led_enable?: boolean;
  child_lock?: "LOCK" | "UNLOCK";
}

// ---------------------------------------------------------------------------
// IKEA — VINDSTYRKA air quality sensor
// ---------------------------------------------------------------------------

/**
 * State payload for IKEA VINDSTYRKA air quality sensor.
 *
 * Supported devices:
 * - IKEA E2112 (VINDSTYRKA air quality/temperature/humidity sensor)
 */
export interface IkeaVindstyrkaPayload extends AirQualitySensorPayload {
  temperature: number;
  humidity: number;
  pm25: number;
  /** Sensirion VOC index (1–500, 100 = normal). */
  voc_index?: number;
}

// ---------------------------------------------------------------------------
// IKEA — remotes and buttons
// ---------------------------------------------------------------------------

/**
 * Action values for IKEA STYRBAR remote.
 *
 * Supported devices:
 * - IKEA E2001 / E2002 / E2313 (STYRBAR remote control, 4 buttons)
 */
export type IkeaStyrbarAction =
  | "on"
  | "off"
  | "brightness_move_up"
  | "brightness_move_down"
  | "brightness_stop"
  | "arrow_left_click"
  | "arrow_left_hold"
  | "arrow_left_release"
  | "arrow_right_click"
  | "arrow_right_hold"
  | "arrow_right_release";

/**
 * State payload for IKEA STYRBAR remote.
 *
 * Supported devices:
 * - IKEA E2001 / E2002 / E2313 (STYRBAR remote control, 4 buttons)
 */
export interface IkeaStyrbarPayload {
  action: IkeaStyrbarAction;
  battery?: number;
  linkquality?: number;
}

/**
 * Action values for IKEA TRADFRI shortcut button.
 *
 * Supported devices:
 * - IKEA E1812 (TRADFRI shortcut button, single button)
 */
export type IkeaShortcutButtonAction =
  | "on"
  | "off"
  | "brightness_move_up"
  | "brightness_stop";

/**
 * State payload for IKEA TRADFRI shortcut button.
 *
 * Supported devices:
 * - IKEA E1812 (TRADFRI shortcut button, single button)
 */
export interface IkeaShortcutButtonPayload {
  action: IkeaShortcutButtonAction;
  battery?: number;
  linkquality?: number;
}

/**
 * Action values for IKEA RODRET dimmer.
 *
 * Supported devices:
 * - IKEA E2201 (RODRET wireless dimmer/power switch, 2 buttons)
 */
export type IkeaRodretAction =
  | "on"
  | "off"
  | "brightness_move_up"
  | "brightness_move_down"
  | "brightness_stop";

/**
 * State payload for IKEA RODRET dimmer.
 *
 * Supported devices:
 * - IKEA E2201 (RODRET wireless dimmer/power switch, 2 buttons)
 */
export interface IkeaRodretPayload {
  action: IkeaRodretAction;
  battery?: number;
  linkquality?: number;
}

// ---------------------------------------------------------------------------
// Aqara — remotes and buttons
// ---------------------------------------------------------------------------

/**
 * Action values for Aqara Wireless Remote Switch H1 (double rocker).
 *
 * Supports single, double, triple tap and hold on left, right, or both buttons.
 *
 * Supported devices:
 * - Aqara WXKG15LM / WRS-R02 (Wireless Remote Switch H1, double rocker)
 */
export type AqaraRemoteSwitchH1Action =
  | "single_left"
  | "single_right"
  | "single_both"
  | "double_left"
  | "double_right"
  | "double_both"
  | "triple_left"
  | "triple_right"
  | "triple_both"
  | "hold_left"
  | "hold_right"
  | "hold_both";

/** Click mode for Aqara Wireless Remote Switch H1. */
export type AqaraClickMode = "fast" | "multi";

/** Operation mode for Aqara Wireless Remote Switch H1. */
export type AqaraOperationMode = "command" | "event";

/**
 * State payload for Aqara Wireless Remote Switch H1.
 *
 * Supported devices:
 * - Aqara WXKG15LM / WRS-R02 (Wireless Remote Switch H1, double rocker)
 */
export interface AqaraRemoteSwitchH1Payload {
  action: AqaraRemoteSwitchH1Action;
  battery?: number;
  voltage?: number;
  click_mode?: AqaraClickMode;
  operation_mode?: AqaraOperationMode;
  linkquality?: number;
}

/**
 * Set command for Aqara Wireless Remote Switch H1.
 *
 * Supported devices:
 * - Aqara WXKG15LM / WRS-R02 (Wireless Remote Switch H1, double rocker)
 */
export interface AqaraRemoteSwitchH1SetCommand {
  click_mode?: AqaraClickMode;
  operation_mode?: AqaraOperationMode;
}

// ---------------------------------------------------------------------------
// Aqara — sensors
// ---------------------------------------------------------------------------

/**
 * State payload for Aqara water leak sensor.
 *
 * Supported devices:
 * - Aqara SJCGQ11LM (water leak sensor)
 */
export interface AqaraWaterLeakPayload extends WaterLeakPayload {
  /** Number of power outages recorded by the device. */
  power_outage_count?: number;
  /** Number of times the sensor has been triggered. */
  trigger_count?: number;
}

/**
 * State payload for Aqara temperature, humidity, and pressure sensor.
 *
 * Supported devices:
 * - Aqara WSDCGQ11LM (temperature/humidity/pressure sensor)
 */
export interface AqaraTemperatureHumidityPayload extends TemperatureHumidityPayload {}


