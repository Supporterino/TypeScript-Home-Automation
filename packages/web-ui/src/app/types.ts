/**
 * Web UI type surface.
 *
 * Domain and wire contracts are imported from `@ts-ha/shared` — the single
 * definition site (design.md D1, D5) — rather than mirrored locally. Only
 * genuinely client-private state (connection state, the normaliser's
 * "unknown" sentinel, the generic state-map alias) is declared here.
 */

import type { StreamEvent } from "@ts-ha/shared";

export type {
  Automation,
  AutomationRelationships,
  Capability,
  CapabilityAccess,
  CapabilityRange,
  DeviceDescriptor,
  DeviceObservation,
  ExecutionOutcome,
  ExecutionRecord,
  HomekitStatus,
  LogEntry,
  ObservationMode,
  RequiredServiceStatus,
  Room,
  RoomMember,
  RoomWithMembers,
  StatusChecks,
  StatusData,
  StreamEvent,
  TriggerContext,
  TriggerDef,
} from "@ts-ha/shared";

export type StateMap = Record<string, unknown>;

/** The connection state of the realtime data layer (design.md "Data Sources"; task 10.2). */
export type TransportState = "connecting" | "live" | "degraded";

/**
 * The normaliser's output: a server event, or its own `unknown` sentinel for
 * a malformed/unrecognised frame. The sentinel is client-private — a real
 * server event never carries it.
 */
export type NormalizedStreamEvent = StreamEvent | { category: "unknown" };
