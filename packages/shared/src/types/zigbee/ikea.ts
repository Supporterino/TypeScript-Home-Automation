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

/** Light effects for IKEA TRADFRI bulbs and LED drivers. */
export type IkeaLightEffect =
  | "blink"
  | "breathe"
  | "okay"
  | "channel_change"
  | "finish_effect"
  | "stop_effect";

/** Set command for IKEA TRADFRI dimmable-only lights. */
export interface IkeaDimmableLightSetCommand extends Omit<DimmableLightSetCommand, "effect"> {
  effect?: IkeaLightEffect;
}

/** Set command for IKEA TRADFRI white-spectrum lights. */
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

/** State payload for IKEA STARKVIND air purifier. */
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

/** Set command for IKEA STARKVIND air purifier. */
export interface IkeaStarkvindSetCommand {
  fan_state?: DeviceState;
  fan_mode?: IkeaFanMode;
  led_enable?: boolean;
  child_lock?: "LOCK" | "UNLOCK";
}

// ---------------------------------------------------------------------------
// IKEA — VINDSTYRKA air quality sensor
// ---------------------------------------------------------------------------

/** State payload for IKEA VINDSTYRKA air quality sensor. */
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

/** Action values for IKEA STYRBAR remote. */
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

/** State payload for IKEA STYRBAR remote. */
export interface IkeaStyrbarPayload {
  action: IkeaStyrbarAction;
  battery?: number;
  linkquality?: number;
}

/** Action values for IKEA TRADFRI shortcut button. */
export type IkeaShortcutButtonAction = "on" | "off" | "brightness_move_up" | "brightness_stop";

/** State payload for IKEA TRADFRI shortcut button. */
export interface IkeaShortcutButtonPayload {
  action: IkeaShortcutButtonAction;
  battery?: number;
  linkquality?: number;
}

/** Action values for IKEA RODRET dimmer. */
export type IkeaRodretAction =
  | "on"
  | "off"
  | "brightness_move_up"
  | "brightness_move_down"
  | "brightness_stop";

/** State payload for IKEA RODRET dimmer. */
export interface IkeaRodretPayload {
  action: IkeaRodretAction;
  battery?: number;
  linkquality?: number;
}
