/**
 * Philips Hue — brand-specific Zigbee2MQTT payload types.
 */

import type {
  ColorLightSetCommand,
  DimmableLightSetCommand,
  OccupancyPayload,
  WhiteSpectrumLightSetCommand,
} from "./common.js";

// ---------------------------------------------------------------------------
// Philips Hue — lights
// ---------------------------------------------------------------------------

/** Light effects for Philips Hue dimmable and white-spectrum bulbs. */
export type PhilipsLightEffect =
  | "blink"
  | "breathe"
  | "okay"
  | "channel_change"
  | "candle"
  | "finish_effect"
  | "stop_effect"
  | "stop_hue_effect";

/** Light effects for Philips Hue color bulbs (superset of PhilipsLightEffect). */
export type PhilipsColorLightEffect = PhilipsLightEffect | "fireplace" | "colorloop";

/** Set command for Philips Hue dimmable-only bulbs. */
export interface PhilipsDimmableLightSetCommand extends Omit<DimmableLightSetCommand, "effect"> {
  effect?: PhilipsLightEffect;
}

/** Set command for Philips Hue white-spectrum bulbs. */
export interface PhilipsWhiteSpectrumLightSetCommand
  extends Omit<WhiteSpectrumLightSetCommand, "effect"> {
  effect?: PhilipsLightEffect;
}

/** Set command for Philips Hue color bulbs. */
export interface PhilipsColorLightSetCommand extends Omit<ColorLightSetCommand, "effect"> {
  effect?: PhilipsColorLightEffect;
}

// ---------------------------------------------------------------------------
// Philips Hue — motion sensors
// ---------------------------------------------------------------------------

/** Motion sensitivity levels for Philips Hue motion sensors. */
export type PhilipsMotionSensitivity = "low" | "medium" | "high" | "very_high" | "max";

/** State payload for Philips Hue motion sensors. */
export interface PhilipsHueMotionSensorPayload extends OccupancyPayload {
  motion_sensitivity?: PhilipsMotionSensitivity;
  led_indication?: boolean;
  /** Occupancy timeout in seconds (0–65535). */
  occupancy_timeout?: number;
}

/** Set command for Philips Hue motion sensors. */
export interface PhilipsHueMotionSensorSetCommand {
  motion_sensitivity?: PhilipsMotionSensitivity;
  led_indication?: boolean;
  /** Occupancy timeout in seconds (0–65535). */
  occupancy_timeout?: number;
}
