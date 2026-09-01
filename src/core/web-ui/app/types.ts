/**
 * Shared TypeScript types for the web UI React app.
 *
 * Domain shapes are `import type`-only re-exports of the server's own types
 * where one already exists (device descriptors, capabilities, rooms,
 * automation relationships, execution records) rather than parallel
 * declarations that could drift — `import type` erases completely at build
 * time, so this never pulls server-only runtime code into the browser
 * bundle (verified by `tests/web-ui-assets.test.ts`'s first-paint budget).
 */

import type { Capability, CapabilityAccess, CapabilityRange } from "../../../types/capabilities.js";
import type { TriggerContext } from "../../automation.js";
import type { AutomationRelationships, RequiredServiceStatus } from "../../automation-manager.js";
import type {
  DeviceDescriptor,
  DeviceObservation,
  ObservationMode,
} from "../../device-sources/device-source.js";
import type { ExecutionOutcome, ExecutionRecord } from "../../observability/execution-recorder.js";
import type { Room, RoomMember, RoomWithMembers } from "../../room-manager.js";

export type {
  AutomationRelationships,
  Capability,
  CapabilityAccess,
  CapabilityRange,
  DeviceDescriptor,
  DeviceObservation,
  ExecutionOutcome,
  ExecutionRecord,
  ObservationMode,
  RequiredServiceStatus,
  Room,
  RoomMember,
  RoomWithMembers,
  TriggerContext,
};

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

/** Summary shape returned by `GET /api/automations` and `GET /api/automations/:name`. */
export interface Automation {
  name: string;
  enabled: boolean;
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

export interface HomekitStatus {
  running: boolean;
  bridgeName: string;
  port: number;
  username: string;
  persistPath: string;
  accessoryCount: number;
  bind?: string | string[];
}

/** The connection state of the realtime data layer (design.md "Data Sources"; task 10.2). */
export type TransportState = "connecting" | "live" | "degraded";

// ── Realtime event stream (design.md D1, D9, D11, D14) ──────────────────────
//
// Mirrors `StreamEvent` in `src/core/events/event-bus.ts` structurally
// rather than importing it: that module's own imports reach into
// `automation.js`/`room-manager.js`, which is fine as `import type` but the
// discriminated union itself is small enough to duplicate rather than chase
// a five-file `import type` chain. `tests/web-ui-normalize.test.ts` and the
// server's own `event-bus.ts` are the two places this shape must agree.

export interface StateChangedEvent {
  category: "state";
  key: string;
  value: unknown;
  previous: unknown;
}
export interface LogEntryEvent {
  category: "log";
  entry: LogEntry;
}
export interface AutomationEnabledEvent {
  category: "automation";
  name: string;
  enabled: boolean;
}
export interface ReadinessChangedEvent {
  category: "readiness";
  ready: boolean;
}
export interface FellBehindEvent {
  category: "fell_behind";
}
export interface DeviceStateChangedEvent {
  category: "device_state";
  qualifiedId: string;
  properties: Record<string, unknown>;
  observation: DeviceObservation;
}
export interface DeviceReachabilityChangedEvent {
  category: "device_reachability";
  qualifiedId: string;
  reachable: boolean;
}
export interface DeviceAppearedEvent {
  category: "device_appeared";
  device: DeviceDescriptor;
}
export interface DeviceDisappearedEvent {
  category: "device_disappeared";
  qualifiedId: string;
}
export interface AutomationExecutionCompletedEvent {
  category: "automation_execution";
  automation: string;
  trigger: TriggerContext;
  durationMs: number;
  outcome: ExecutionOutcome;
}
export interface RoomChangedEvent {
  category: "room";
  id: string;
  room: Room | null;
}
export interface RoomMembershipChangedEvent {
  category: "room_membership";
  qualifiedId: string;
  roomId: string | null;
}
export interface DeviceVisibilityChangedEvent {
  category: "device_visibility";
  qualifiedId: string;
  hidden: boolean;
}

export type StreamEvent =
  | StateChangedEvent
  | LogEntryEvent
  | AutomationEnabledEvent
  | ReadinessChangedEvent
  | FellBehindEvent
  | DeviceStateChangedEvent
  | DeviceReachabilityChangedEvent
  | DeviceAppearedEvent
  | DeviceDisappearedEvent
  | AutomationExecutionCompletedEvent
  | RoomChangedEvent
  | RoomMembershipChangedEvent
  | DeviceVisibilityChangedEvent
  | { category: "unknown" };
