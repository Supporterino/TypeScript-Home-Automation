/** HTTP wire-response DTOs produced by the engine's API, consumed by the web UI and CLI. */

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

// ---------------------------------------------------------------------------
// Energy (`GET /api/energy`)
// ---------------------------------------------------------------------------

/** One device's contribution to the home-wide energy view. */
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

/** Response body of `GET /api/energy`. */
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

/** Response body of `GET /api/weather` for a resolvable location. */
export interface WeatherData {
  /** The location the data was resolved for. */
  location: WeatherLocation;
  /** Current conditions. */
  current: CurrentWeather;
  /** Daily forecast, ordered by date ascending. */
  forecast: DailyForecast[];
}

/** Marker the weather surface reports when it cannot produce conditions. */
export interface WeatherUnavailable {
  available: false;
  /** Why no weather can be produced. */
  reason: "service_unregistered" | "no_location";
}

// ---------------------------------------------------------------------------
// Room batch command (`POST /api/rooms/:id/command`)
// ---------------------------------------------------------------------------

/** Per-device outcome of a room batch command. */
export type RoomCommandOutcome = "applied" | "skipped" | "failed";

/** One member's result within a room batch-command response. */
export interface RoomCommandResult {
  /** The member's qualified identifier. */
  qualifiedId: string;
  /** What happened when the command was dispatched to this member. */
  outcome: RoomCommandOutcome;
}

/** Response body of `POST /api/rooms/:id/command`: one result per room member. */
export type RoomBatchCommandResponse = RoomCommandResult[];
