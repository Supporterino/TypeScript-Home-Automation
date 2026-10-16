/**
 * Web UI type surface: re-exports the shared contracts and declares only the
 * genuinely client-private types.
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
  WallProfile,
  WallProfileConfig,
} from "@ts-ha/shared";

export type StateMap = Record<string, unknown>;

/** The connection state of the realtime data layer. */
export type TransportState = "connecting" | "live" | "degraded";

/**
 * The normaliser's output: a server event, or its own `unknown` sentinel for a
 * malformed or unrecognised frame.
 */
export type NormalizedStreamEvent = StreamEvent | { category: "unknown" };
