/**
 * Shelly Gen 2 device types.
 *
 * Types for the Shelly Gen 2 HTTP RPC API, covering the Switch component
 * (used by Shelly Plus Plug S and similar relay/plug devices) and
 * system-level device info.
 *
 * Supported devices:
 * - Shelly Plus Plug S (SNPL-00112EU)
 * - Other Shelly Gen 2 devices with Switch components
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
export type ShellySwitchError =
  | "overtemp"
  | "overpower"
  | "overvoltage"
  | "undervoltage";

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
