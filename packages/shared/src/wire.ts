/**
 * HTTP wire-response DTOs.
 *
 * These shapes are produced by the engine's HTTP API and consumed by the web
 * UI app and the CLI. They are HTTP response contracts, not private
 * view-models, so they live here rather than being re-declared per consumer
 * (design.md D1; specs/packaging "Shared Owns The Contracts").
 */

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
