/**
 * Shared types for dashboard components.
 *
 * Wire-response DTOs (`LogEntry`, `HomekitStatus`, `Automation`,
 * `DeviceDescriptor`) come from `@ts-ha/shared`; only dashboard aggregation
 * shapes are declared here (design.md D1).
 */

import type {
  Automation,
  DeviceDescriptor,
  EnergyData,
  HomekitStatus,
  LogEntry,
  RoomWithMembers,
  WeatherData,
  WeatherUnavailable,
} from "@ts-ha/shared";

interface ReadinessData {
  status: string;
  checks: { mqtt: boolean; engine: boolean };
  startedAt: number | null;
  tz: string | null;
}

export interface AutomationsData {
  automations: Automation[];
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
  devices: DeviceDescriptor[];
  count: number;
  /** Identifiers of the sources that contributed devices. */
  sources: string[];
}

export interface RoomsData {
  rooms: RoomWithMembers[];
  count: number;
}

export interface DashboardData {
  readiness: ReadinessData;
  automations: AutomationsData;
  devices: DevicesData;
  rooms: RoomsData;
  state: StateData;
  logs: LogsData;
  /** `null` when the HomeKit service is not configured. */
  homekit: HomekitStatus | null;
  /** `null` until the first (slow) poll resolves; energy is not streamed. */
  energy: EnergyData | null;
  /** `null` until the first poll resolves; weather is not streamed. */
  weather: WeatherData | WeatherUnavailable | null;
  error: string | null;
  lastRefresh: number;
}
