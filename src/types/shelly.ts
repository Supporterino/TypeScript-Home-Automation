/**
 * Shelly Gen 2 device types.
 *
 * Types for the Shelly Gen 2 HTTP RPC API, covering the Switch component,
 * Cover component (roller/shutter mode), and system-level device info.
 *
 * Supported devices:
 * - Shelly Plus Plug S (SNPL-00112EU) — Switch component
 * - Shelly Plus 1PM Mini (SNSW-001P8EU) — Switch component
 * - Shelly Plus 2PM (SNSW-102P16EU) — Cover component (roller/shutter mode)
 * - Other Shelly Gen 2 devices with Switch or Cover components
 *
 * API reference: https://shelly-api-docs.shelly.cloud/gen2/
 */

// ---------------------------------------------------------------------------
// Device info (Shelly.GetDeviceInfo)
// ---------------------------------------------------------------------------

/** Response from `Shelly.GetDeviceInfo`. */
export interface ShellyDeviceInfo {
  /** Device ID (e.g. "shellyplusplugs-xxxxxxxxxxxx"). */
  id: string;
  /** MAC address. */
  mac: string;
  /** Model identifier (e.g. "SNPL-00112EU" for Plus Plug S). */
  model: string;
  /** Device generation (2 for Gen 2). */
  gen: number;
  /** Full firmware build ID. */
  fw_id: string;
  /** Firmware version string. */
  ver: string;
  /** Application name (e.g. "PlusPlugS"). */
  app: string;
  /** Whether HTTP authentication is enabled. */
  auth_en: boolean;
  /** Authentication domain (null if auth disabled). */
  auth_domain: string | null;
}

// ---------------------------------------------------------------------------
// Switch component (Switch.GetStatus, Switch.Set, etc.)
// ---------------------------------------------------------------------------

/** Energy counters included in switch status. */
export interface ShellyEnergyCounters {
  /** Total energy in Wh. */
  total: number;
  /** Energy in mWh for the last 3 complete minutes. */
  by_minute: number[];
  /** Unix timestamp of the current minute. */
  minute_ts: number;
}

/** Temperature reading from device. */
export interface ShellyTemperature {
  /** Temperature in Celsius (null if unavailable). */
  tC: number | null;
  /** Temperature in Fahrenheit (null if unavailable). */
  tF: number | null;
}

/** Error conditions that can be reported by a switch. */
export type ShellySwitchError = "overtemp" | "overpower" | "overvoltage" | "undervoltage";

/**
 * Response from `Switch.GetStatus`.
 *
 * Contains the current state of the switch including power metering data.
 * The Plus Plug S always reports power metering fields.
 */
export interface ShellySwitchStatus {
  /** Switch instance ID (0 for Plus Plug S). */
  id: number;
  /** Source that last changed the state (e.g. "http", "switch", "timer"). */
  source: string;
  /** Current on/off state. */
  output: boolean;
  /** Unix timestamp when a timer was started (if active). */
  timer_started_at?: number;
  /** Duration of the active timer in seconds (if active). */
  timer_duration?: number;
  /** Instantaneous active power in Watts. */
  apower: number;
  /** Voltage in Volts. */
  voltage: number;
  /** Current in Amperes. */
  current: number;
  /** Power factor (0–1). */
  pf?: number;
  /** Network frequency in Hz. */
  freq?: number;
  /** Active energy counters. */
  aenergy: ShellyEnergyCounters;
  /** Returned energy counters (if available). */
  ret_aenergy?: ShellyEnergyCounters;
  /** Device temperature. */
  temperature: ShellyTemperature;
  /** Active error conditions. */
  errors?: ShellySwitchError[];
}

/** Response from `Switch.Set` and `Switch.Toggle`. */
export interface ShellySwitchSetResult {
  /** Whether the switch was on before the command. */
  was_on: boolean;
}

/**
 * Switch configuration from `Switch.GetConfig`.
 */
export interface ShellySwitchConfig {
  /** Switch instance ID. */
  id: number;
  /** User-defined name. */
  name: string | null;
  /** Input mode. */
  in_mode?: string;
  /** Whether the input is locked. */
  in_locked?: boolean;
  /** Initial state on power-up. */
  initial_state: string;
  /** Auto-on enabled. */
  auto_on: boolean;
  /** Auto-on delay in seconds. */
  auto_on_delay: number;
  /** Auto-off enabled. */
  auto_off: boolean;
  /** Auto-off delay in seconds. */
  auto_off_delay: number;
  /** Power limit in Watts. */
  power_limit?: number;
  /** Voltage limit in Volts. */
  voltage_limit?: number;
  /** Undervoltage limit in Volts. */
  undervoltage_limit?: number;
  /** Current limit in Amperes. */
  current_limit?: number;
}

// ---------------------------------------------------------------------------
// Cover component (Cover.GetStatus, Cover.Open, Cover.Close, etc.)
// Used by Shelly Plus 2PM in roller/shutter mode.
// ---------------------------------------------------------------------------

/** Possible states of a cover/shutter. */
export type ShellyCoverState =
  | "open"
  | "closed"
  | "opening"
  | "closing"
  | "stopped"
  | "calibrating";

/** Error conditions that can be reported by a cover. */
export type ShellyCoverError =
  | "overtemp"
  | "overpower"
  | "overvoltage"
  | "undervoltage"
  | "overcurrent"
  | "obstruction"
  | "safety_switch";

/**
 * Response from `Cover.GetStatus`.
 *
 * Contains the current state of the cover including position and power metering.
 *
 * Supported devices:
 * - Shelly Plus 2PM (SNSW-102P16EU) in roller/shutter mode
 */
export interface ShellyCoverStatus {
  /** Cover instance ID (0 for Plus 2PM). */
  id: number;
  /** Source that last changed the state (e.g. "http", "WS_in", "init"). */
  source: string;
  /** Current cover state. */
  state: ShellyCoverState;
  /** Instantaneous active power in Watts. */
  apower: number;
  /** Voltage in Volts. */
  voltage: number;
  /** Current in Amperes. */
  current: number;
  /** Power factor (0–1). */
  pf?: number;
  /** Network frequency in Hz. */
  freq?: number;
  /** Active energy counters. */
  aenergy: ShellyEnergyCounters;
  /** Current position 0–100% (null if uncalibrated or unknown). */
  current_pos: number | null;
  /** Target position while moving (null when reached or cancelled). */
  target_pos: number | null;
  /** Seconds remaining before auto-stop (only while moving). */
  move_timeout?: number;
  /** Unix timestamp of movement start (only while moving). */
  move_started_at?: number;
  /** Whether position control is available (true if calibrated). */
  pos_control: boolean;
  /** Last movement direction. */
  last_direction: "open" | "close" | null;
  /** Device temperature. */
  temperature: ShellyTemperature;
  /** Active error conditions. */
  errors?: ShellyCoverError[];
}

/**
 * Cover configuration from `Cover.GetConfig`.
 *
 * Supported devices:
 * - Shelly Plus 2PM in roller/shutter mode
 */
export interface ShellyCoverConfig {
  /** Cover instance ID. */
  id: number;
  /** User-defined name. */
  name: string | null;
  /** Motor type. */
  motor?: {
    idle_power_thr: number;
    idle_confirm_period: number;
  };
  /** Maximum time to open in seconds. */
  maxtime_open: number;
  /** Maximum time to close in seconds. */
  maxtime_close: number;
  /** Initial state on power-up. */
  initial_state: string;
  /** Whether power metering is enabled. */
  power_limit?: number;
  /** Voltage limit in Volts. */
  voltage_limit?: number;
  /** Undervoltage limit in Volts. */
  undervoltage_limit?: number;
  /** Current limit in Amperes. */
  current_limit?: number;
  /** Whether obstruction detection is enabled. */
  obstruction_detection?: {
    enable: boolean;
    direction: string;
    action: string;
    power_thr: number;
    holdoff: number;
  };
  /** Safety switch configuration. */
  safety_switch?: {
    enable: boolean;
    direction: string;
    action: string;
    allowed_move: string | null;
  };
}

// ---------------------------------------------------------------------------
// System component (Sys.GetStatus)
// ---------------------------------------------------------------------------

/** Response from `Sys.GetStatus`. */
export interface ShellySysStatus {
  /** MAC address. */
  mac: string;
  /** Whether a restart is required for config changes to take effect. */
  restart_required: boolean;
  /** Current time as HH:MM string (null if not synced). */
  time: string | null;
  /** Current Unix timestamp (null if not synced). */
  unixtime: number | null;
  /** Device uptime in seconds. */
  uptime: number;
  /** Total RAM in bytes. */
  ram_size: number;
  /** Free RAM in bytes. */
  ram_free: number;
  /** Total filesystem size in bytes. */
  fs_size: number;
  /** Free filesystem space in bytes. */
  fs_free: number;
  /** Configuration revision. */
  cfg_rev: number;
  /** Key-value store revision. */
  kvs_rev: number;
  /** Available firmware updates. */
  available_updates: {
    stable?: { version: string };
    beta?: { version: string };
  };
}
