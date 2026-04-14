/**
 * Aqara — brand-specific Zigbee2MQTT payload types.
 */

import type { TemperatureHumidityPayload, WaterLeakPayload } from "./common.js";

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
