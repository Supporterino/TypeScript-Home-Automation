/** Shared TypeScript types for the web UI React app. */

export interface StatusChecks {
  mqtt: boolean;
  engine: boolean;
}

export interface StatusData {
  status: "ready" | "not ready";
  checks: StatusChecks;
  startedAt: number | null;
  tz: string | null;
}

export interface TriggerDef {
  type: "mqtt" | "cron" | "state" | "webhook";
  [key: string]: unknown;
}

export interface Automation {
  name: string;
  triggers: TriggerDef[];
}

export interface LogEntry {
  level: number;
  time: number;
  msg: string;
  automation?: string;
  [key: string]: unknown;
}

export type StateMap = Record<string, unknown>;

export interface DeviceDefinition {
  model: string;
  vendor: string;
  description: string;
}

export interface DeviceInfo {
  friendly_name: string;
  nice_name: string;
  ieee_address: string;
  type: string;
  supported: boolean;
  interview_state: string;
  power_source?: string | null;
  state: Record<string, unknown> | null;
  definition: DeviceDefinition | null;
}

export interface DashboardData {
  status: StatusData | null;
  automations: Automation[];
  state: StateMap;
  logs: LogEntry[];
  /** All tracked Zigbee devices. Empty array when registry is disabled. */
  devices: DeviceInfo[];
  /** `false` when the device registry is disabled (503 from /api/devices). */
  devicesAvailable: boolean;
}
