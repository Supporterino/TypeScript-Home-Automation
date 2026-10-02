/**
 * IKEA — brand-specific Zigbee2MQTT payload types.
 */

import type {
  AirPurifierPayload,
  AirQualitySensorPayload,
  DeviceState,
  DimmableLightSetCommand,
  WhiteSpectrumLightSetCommand,
} from "./common.js";

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
export interface IkeaWhiteSpectrumLightSetCommand
  extends Omit<WhiteSpectrumLightSetCommand, "effect"> {
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
export type IkeaShortcutButtonAction = "on" | "off" | "brightness_move_up" | "brightness_stop";

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
