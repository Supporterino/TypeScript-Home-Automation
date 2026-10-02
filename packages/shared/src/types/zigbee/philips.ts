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
export type PhilipsColorLightEffect = PhilipsLightEffect | "fireplace" | "colorloop";

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
export interface PhilipsWhiteSpectrumLightSetCommand
  extends Omit<WhiteSpectrumLightSetCommand, "effect"> {
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
