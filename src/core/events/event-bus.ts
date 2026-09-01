import type { TriggerContext } from "../automation.js";
import type { DeviceDescriptor, DeviceObservation } from "../device-sources/device-source.js";
import type { LogEntry } from "../logging/log-buffer.js";
import type { ExecutionOutcome } from "../observability/execution-recorder.js";
import type { Room } from "../room-manager.js";

/**
 * A raw, non-reserved state key changed (design.md D20; task 5.7).
 *
 * Reserved internal keys (room definitions, membership, automation enabled
 * flags) are deliberately excluded from this category and delivered only
 * through their own typed category, so a mutation is never emitted twice.
 */
export interface StateChangedEvent {
  category: "state";
  key: string;
  value: unknown;
  previous: unknown;
}

/** A new log entry was stored (design.md D32; consumes the 5.0 subscription). */
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

/**
 * Delivered to a connection that fell behind (design.md D28; task 5.6b).
 *
 * Not a real-world category produced by any subsystem — synthesised by the
 * event stream's delivery path itself when it has to discard undelivered
 * events for a slow connection.
 */
export interface FellBehindEvent {
  category: "fell_behind";
}

/**
 * A device reported changed properties (design.md D1; task 7.4).
 *
 * Carries only the properties that changed, not the device's full state, so
 * a single device change never resends the inventory (specs/realtime-events
 * "Incremental Delivery"). `observation` reports the freshness of the
 * observation that produced this change, in the same terms as the device
 * read endpoints.
 */
export interface DeviceStateChangedEvent {
  category: "device_state";
  qualifiedId: string;
  properties: Record<string, unknown>;
  observation: DeviceObservation;
}

/** A device's reachability changed (design.md D1; task 7.4). */
export interface DeviceReachabilityChangedEvent {
  category: "device_reachability";
  qualifiedId: string;
  reachable: boolean;
}

/**
 * A device became known to a source for the first time since the bridge
 * started tracking it (design.md D1; task 7.4). Carries the full descriptor
 * — unlike the other device categories — since a client cannot have seen
 * this device in any prior snapshot or event.
 */
export interface DeviceAppearedEvent {
  category: "device_appeared";
  device: DeviceDescriptor;
}

/** A previously-known device dropped out of its source's enumeration (design.md D1; task 7.4). */
export interface DeviceDisappearedEvent {
  category: "device_disappeared";
  qualifiedId: string;
}

/**
 * An automation run completed, successfully or not (design.md D11, D18;
 * task 8.7). Derived from the same `ExecutionRecorder.run()` call that
 * populates the automation's execution history, so the two can never
 * disagree.
 */
export interface AutomationExecutionCompletedEvent {
  category: "automation_execution";
  automation: string;
  trigger: TriggerContext;
  durationMs: number;
  outcome: ExecutionOutcome;
}

/**
 * A room was created, renamed, or deleted (design.md D14; task 9.7).
 *
 * `room` is the room's current definition, or `null` when it has been
 * deleted. Derived from a single reserved-namespace key's change event, so
 * this is always a delta for one room — never a resend of the full room
 * list.
 */
export interface RoomChangedEvent {
  category: "room";
  id: string;
  room: Room | null;
}

/**
 * A device's room assignment changed (design.md D14; task 9.7).
 *
 * `roomId` is `null` when the device was unassigned. Carries only the one
 * device and its new room, not any room's full membership list — the delta
 * this category exists to provide, rather than requiring a client to
 * re-fetch every room to learn who moved.
 */
export interface RoomMembershipChangedEvent {
  category: "room_membership";
  qualifiedId: string;
  roomId: string | null;
}

/**
 * A device's hidden flag changed (design.md D11; task 5.3).
 *
 * Its own category rather than `device_appeared`/`device_disappeared`: a
 * hidden device has not disappeared — it is still enumerable, commandable,
 * and a member of its room. Carries only the one device and its new
 * visibility, not the device list. Not inferable from a state key change
 * either: the flag lives in the reserved state namespace, which is
 * deliberately excluded from the `state` category (design.md D20).
 */
export interface DeviceVisibilityChangedEvent {
  category: "device_visibility";
  qualifiedId: string;
  hidden: boolean;
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
  | DeviceVisibilityChangedEvent;

export type StreamEventListener = (event: StreamEvent) => void;

/**
 * A minimal typed publish/subscribe hub for {@link StreamEvent}s.
 *
 * Deliberately dumb: it does not know about connections, buffering, or
 * failure isolation — that belongs to whatever consumes the subscription
 * (the SSE delivery path; see `src/core/http/event-stream.ts` and design.md
 * D32/R21). It exists so every producer (state manager, log buffer,
 * automation manager, engine readiness) can emit through one shared object
 * without depending on the HTTP layer.
 */
export class EventBus {
  private readonly listeners: Set<StreamEventListener> = new Set();

  /** Subscribe to every event. Returns an unsubscribe function. */
  subscribe(listener: StreamEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Publish one event to every current subscriber. */
  emit(event: StreamEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A subscriber's own failure handling is its responsibility; a throw
        // here must not stop the remaining subscribers from being notified.
      }
    }
  }
}
