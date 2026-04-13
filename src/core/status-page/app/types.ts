/** Shared TypeScript types for the status page React app. */

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

export interface DashboardData {
  status: StatusData | null;
  automations: Automation[];
  state: StateMap;
  logs: LogEntry[];
}
