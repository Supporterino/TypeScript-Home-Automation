/**
 * HTTP wire-response DTOs.
 *
 * These shapes are produced by the engine's HTTP API and consumed by the web
 * UI app and the CLI. They are HTTP response contracts, not private
 * view-models, so they live here rather than being re-declared per consumer
 * (design.md D1; specs/packaging "Shared Owns The Contracts").
 */

import type { CurrentWeather, DailyForecast, WeatherLocation } from "./types/weather.js";

/**
 * Readiness/mqtt/engine check flags returned by `GET /api/status` and
 * `GET /readyz`.
 */
export interface StatusChecks {
  mqtt: boolean;
  engine: boolean;
}

/** Status payload returned by `GET /api/status`. */
export interface StatusData {
  status: "ready" | "not ready";
  checks: StatusChecks;
  startedAt: number | null;
  tz: string | null;
}

/** One automation trigger definition as summarised by the HTTP API. */
export interface TriggerDef {
  type: "mqtt" | "cron" | "state" | "webhook";
  [key: string]: unknown;
}

/** Summary shape returned by `GET /api/automations` and `GET /api/automations/:name`. */
export interface Automation {
  name: string;
  enabled: boolean;
  triggers: TriggerDef[];
}

/** Automation summary as consumed by the CLI dashboard (same API, looser trigger typing). */
export interface AutomationInfo {
  name: string;
  enabled: boolean;
  triggers: { type: string; [key: string]: unknown }[];
}

/**
 * Runtime status snapshot for the HomeKit bridge, returned by
 * `GET /api/homekit/status`.
 */
export interface HomekitStatus {
  /** Whether the HAP bridge is currently published and accepting connections. */
  running: boolean;
  /** Display name advertised to the Home app. */
  bridgeName: string;
  /** TCP port the HAP server listens on. */
  port: number;
  /** HAP bridge MAC address used as the unique bridge identifier. */
  username: string;
  /** Path to the directory where HAP pairing data is persisted. */
  persistPath: string;
  /** Number of HomeKit accessories currently registered on the bridge. */
  accessoryCount: number;
  /** Network interfaces/IPs the bridge advertises mDNS on (from `bind` option). */
  bind?: string | string[];
}

/** A Zigbee device as returned by the device APIs, with its live merged state. */
export interface SerializedDevice {
  friendly_name: string;
  nice_name: string;
  ieee_address: string;
  type: string;
  supported: boolean;
  interview_state: string;
  power_source?: string | null;
  state: Record<string, unknown> | null;
  definition: { model: string; vendor: string; description: string } | null;
}

/** Alias used by the CLI dashboard for the same device wire shape. */
export type DeviceInfo = SerializedDevice;

// ---------------------------------------------------------------------------
// Energy (`GET /api/energy`)
// ---------------------------------------------------------------------------

/**
 * One device's contribution to the home-wide energy view.
 *
 * `powerWatts` and `energyWh` are absent — not zero — when the device reports
 * no such reading, so a non-metering device is distinguishable from one
 * drawing a genuine zero (specs/energy-monitoring).
 */
export interface EnergyDeviceBreakdown {
  /** The device's qualified identifier. */
  qualifiedId: string;
  /** Human-readable display name, for presenting the breakdown. */
  displayName: string;
  /** Instantaneous power in watts, when the device declares a reading. */
  powerWatts?: number;
  /** Cumulative consumption in watt-hours, when the device declares a reading. */
  energyWh?: number;
  /** Whether the device is currently reachable. Unreachable devices are not summed. */
  available: boolean;
}

/** One timestamped sample of the home's instantaneous power total. */
export interface EnergyHistorySample {
  /** Epoch milliseconds at which the sample was taken. */
  timestamp: number;
  /** Home instantaneous power in watts at that time. */
  powerWatts: number;
}

/**
 * Response body of `GET /api/energy` (specs/energy-monitoring "Energy Endpoint
 * Contract").
 */
export interface EnergyData {
  /** Home instantaneous power across reachable metering devices, in watts. */
  powerWatts: number;
  /** Home cumulative consumption across reachable metering devices, in watt-hours. */
  energyWh: number;
  /** Per-device contributions; empty when no device meters energy. */
  breakdown: EnergyDeviceBreakdown[];
  /** Rolling history, oldest first; empty when history is disabled. */
  history: EnergyHistorySample[];
}

// ---------------------------------------------------------------------------
// Weather (`GET /api/weather`)
// ---------------------------------------------------------------------------

/**
 * Response body of `GET /api/weather` for a resolvable location
 * (specs/weather-services "HTTP Exposure").
 */
export interface WeatherData {
  /** The location the data was resolved for. */
  location: WeatherLocation;
  /** Current conditions. */
  current: CurrentWeather;
  /** Daily forecast, ordered by date ascending. */
  forecast: DailyForecast[];
}

/**
 * Marker the weather surface reports when it cannot produce conditions because
 * the feature is unconfigured rather than errored — no service registered, or
 * no default and no supplied location (specs/weather-services).
 */
export interface WeatherUnavailable {
  available: false;
  /** Why no weather can be produced. */
  reason: "service_unregistered" | "no_location";
}

// ---------------------------------------------------------------------------
// Room batch command (`POST /api/rooms/:id/command`)
// ---------------------------------------------------------------------------

/** Per-device outcome of a room batch command (design.md D5). */
export type RoomCommandOutcome = "applied" | "skipped" | "failed";

/** One member's result within a room batch-command response. */
export interface RoomCommandResult {
  /** The member's qualified identifier. */
  qualifiedId: string;
  /** What happened when the command was dispatched to this member. */
  outcome: RoomCommandOutcome;
}

/**
 * Response body of `POST /api/rooms/:id/command`: one result per room member
 * (design.md D5). The batch is best-effort — the response never promises
 * atomicity across members.
 */
export type RoomBatchCommandResponse = RoomCommandResult[];
