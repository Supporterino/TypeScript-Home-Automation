/**
 * Shared types for dashboard components.
 *
 * Wire-response DTOs (`LogEntry`, `HomekitStatus`, `AutomationInfo`,
 * `DeviceInfo`) come from `@ts-ha/shared`; only dashboard aggregation shapes
 * are declared here (design.md D1).
 */

import type { AutomationInfo, DeviceInfo, HomekitStatus, LogEntry } from "@ts-ha/shared";

export interface ReadinessData {
  status: string;
  checks: { mqtt: boolean; engine: boolean };
  startedAt: number | null;
  tz: string | null;
}

export interface AutomationsData {
  automations: AutomationInfo[];
  count: number;
}

export interface StateData {
  state: Record<string, unknown>;
  count: number;
}

export interface LogsData {
  entries: LogEntry[];
  count: number;
}

export interface DevicesData {
  devices: DeviceInfo[];
  count: number;
  /** `false` when the device registry is disabled (503 response from engine). */
  available: boolean;
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
