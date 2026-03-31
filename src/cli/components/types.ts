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

export interface DashboardData {
  readiness: ReadinessData;
  automations: AutomationsData;
  state: StateData;
  logs: LogsData;
  error: string | null;
  lastRefresh: number;
}
