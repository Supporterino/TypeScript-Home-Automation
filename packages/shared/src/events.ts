/** Realtime event stream contracts: every event shape and the union the SSE path serialises. */

import type { TriggerContext } from "./automation.js";
import type { DeviceDescriptor, DeviceObservation } from "./device.js";
import type { ExecutionOutcome } from "./execution.js";
import type { LogEntry } from "./log-entry.js";
import type { Room } from "./room.js";
import type { WallChangeKind } from "./wall.js";

/** A raw, non-reserved state key changed; reserved keys use their own categories. */
export interface StateChangedEvent {
  category: "state";
  key: string;
  value: unknown;
  previous: unknown;
}

/** A new log entry was stored. */
export interface LogEntryEvent {
  category: "log";
  entry: LogEntry;
}

/** An automation's enabled flag changed. */
export interface AutomationEnabledEvent {
  category: "automation";
  name: string;
  enabled: boolean;
}

/** The engine's overall readiness (MQTT connected and started) changed. */
export interface ReadinessChangedEvent {
  category: "readiness";
  ready: boolean;
}

/** Delivered to a connection that fell behind; synthesised by the delivery path. */
export interface FellBehindEvent {
  category: "fell_behind";
}

/** A device reported changed properties — only the changed ones, not its full state. */
export interface DeviceStateChangedEvent {
  category: "device_state";
  qualifiedId: string;
  properties: Record<string, unknown>;
  observation: DeviceObservation;
}

/** A device's reachability changed. */
export interface DeviceReachabilityChangedEvent {
  category: "device_reachability";
  qualifiedId: string;
  reachable: boolean;
}

/** A device became known to a source; carries the full descriptor. */
export interface DeviceAppearedEvent {
  category: "device_appeared";
  device: DeviceDescriptor;
}

/** A previously-known device dropped out of its source's enumeration. */
export interface DeviceDisappearedEvent {
  category: "device_disappeared";
  qualifiedId: string;
}

/** An automation run completed, successfully or not. */
export interface AutomationExecutionCompletedEvent {
  category: "automation_execution";
  automation: string;
  trigger: TriggerContext;
  durationMs: number;
  outcome: ExecutionOutcome;
}

/** A room was created, renamed, or deleted; `room` is `null` when deleted. */
export interface RoomChangedEvent {
  category: "room";
  id: string;
  room: Room | null;
}

/** A device's room assignment changed; `roomId` is `null` when unassigned. */
export interface RoomMembershipChangedEvent {
  category: "room_membership";
  qualifiedId: string;
  roomId: string | null;
}

/** A device's hidden flag changed. */
export interface DeviceVisibilityChangedEvent {
  category: "device_visibility";
  qualifiedId: string;
  hidden: boolean;
}

/** A wall profile was created, updated, or deleted. */
export interface WallChangedEvent {
  category: "wall";
  name: string;
  kind: WallChangeKind;
}

/** Every event the stream can deliver. */
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
  | WallChangedEvent;

export type StreamEventListener = (event: StreamEvent) => void;
