/**
 * Shared types for dashboard components.
 */

export interface ReadinessData {
  status: string;
  checks: { mqtt: boolean; engine: boolean };
  startedAt: number | null;
  tz: string | null;
}

export interface AutomationInfo {
  name: string;
  triggers: { type: string; [key: string]: unknown }[];
}

export interface AutomationsData {
  automations: AutomationInfo[];
  count: number;
}

export interface StateData {
  state: Record<string, unknown>;
  count: number;
}

export interface LogEntry {
  level: number;
  time: number;
  msg: string;
  automation?: string;
  service?: string;
  [key: string]: unknown;
}

export interface LogsData {
  entries: LogEntry[];
  count: number;
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
  definition: { model: string; vendor: string; description: string } | null;
}

export interface DevicesData {
  devices: DeviceInfo[];
  count: number;
  /** `false` when the device registry is disabled (503 response from engine). */
  available: boolean;
}

export interface HomekitStatus {
  running: boolean;
  bridgeName: string;
  port: number;
  username: string;
  persistPath: string;
  accessoryCount: number;
  pinCode: string;
}

export interface DashboardData {
  readiness: ReadinessData;
  automations: AutomationsData;
  devices: DevicesData;
  state: StateData;
  logs: LogsData;
  /** `null` when the HomeKit service is not configured. */
  homekit: HomekitStatus | null;
  error: string | null;
  lastRefresh: number;
}
