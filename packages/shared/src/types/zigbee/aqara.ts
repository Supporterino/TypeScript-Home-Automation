/**
 * Aqara — brand-specific Zigbee2MQTT payload types.
 */

import type {
  PresencePayload,
  PresenceSetCommand,
  TemperatureHumidityPayload,
  WaterLeakPayload,
} from "./common.js";

// ---------------------------------------------------------------------------
// Aqara — remotes and buttons
// ---------------------------------------------------------------------------

/** Action values for Aqara Wireless Remote Switch H1 (double rocker). */
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

/** State payload for Aqara Wireless Remote Switch H1. */
export interface AqaraRemoteSwitchH1Payload {
  action: AqaraRemoteSwitchH1Action;
  battery?: number;
  voltage?: number;
  click_mode?: AqaraClickMode;
  operation_mode?: AqaraOperationMode;
  linkquality?: number;
}

/** Set command for Aqara Wireless Remote Switch H1. */
export interface AqaraRemoteSwitchH1SetCommand {
  click_mode?: AqaraClickMode;
  operation_mode?: AqaraOperationMode;
}

// ---------------------------------------------------------------------------
// Aqara — sensors
// ---------------------------------------------------------------------------

/** State payload for Aqara water leak sensor. */
export interface AqaraWaterLeakPayload extends WaterLeakPayload {
  /** Number of power outages recorded by the device. */
  power_outage_count?: number;
  /** Number of times the sensor has been triggered. */
  trigger_count?: number;
}

/** State payload for Aqara temperature, humidity, and pressure sensor. */
export interface AqaraTemperatureHumidityPayload extends TemperatureHumidityPayload {}

/** State payload for Aqara mmWave presence sensor. */
export interface AqaraPresencePayload extends PresencePayload {
  pir_detection?: boolean;
  presence_detection_options?: "both" | "mmwave" | "pir";
  motion_sensitivity?: "low" | "medium" | "high";
  ai_interference_source_selfidentification?: "ON" | "OFF";
  ai_sensitivity_adaptive?: "ON" | "OFF";
  absence_delay_timer?: number;
  pir_detection_interval?: number;
  detection_range?: number;
  detection_range_composite?: Record<string, boolean>;
  power_outage_count?: number;
}

/** Set command for Aqara mmWave presence sensor. */
export interface AqaraPresenceSetCommand extends PresenceSetCommand {
  presence_detection_options?: "both" | "mmwave" | "pir";
  ai_interference_source_selfidentification?: "ON" | "OFF";
  ai_sensitivity_adaptive?: "ON" | "OFF";
  absence_delay_timer?: number;
  pir_detection_interval?: number;
  detection_range?: number;
  detection_range_composite?: Record<string, boolean>;
  spatial_learning?: "Start Learning";
  restart_device?: "Restart Device";
  identify?: "identify";
  track_target_distance?: "start_tracking_distance";
}
