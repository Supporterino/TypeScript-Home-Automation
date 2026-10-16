import type { StreamEvent, StreamEventListener } from "@ts-ha/shared";

export type {
  AutomationEnabledEvent,
  AutomationExecutionCompletedEvent,
  DeviceAppearedEvent,
  DeviceDisappearedEvent,
  DeviceReachabilityChangedEvent,
  DeviceStateChangedEvent,
  FellBehindEvent,
  LogEntryEvent,
  ReadinessChangedEvent,
  RoomChangedEvent,
  RoomMembershipChangedEvent,
  StateChangedEvent,
  StreamEvent,
  StreamEventListener,
} from "@ts-ha/shared";

/**
 * A minimal typed publish/subscribe hub for {@link StreamEvent}s. It knows nothing
 * about connections, buffering, or failure isolation — those belong to the consumer
 * (`http/event-stream.ts`) — so every producer can emit through one shared object.
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
