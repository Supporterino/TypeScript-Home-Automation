import type { Logger } from "pino";
import type { EventBus, StreamEvent } from "../events/event-bus.js";

/** Fixed per-connection outgoing buffer size (design.md D28; task 5.6b). */
export const DEFAULT_CONNECTION_BUFFER_CAPACITY = 100;

/** Keep-alive interval, comfortably under a typical proxy idle timeout. */
export const DEFAULT_KEEPALIVE_MS = 15_000;

const encoder = new TextEncoder();

function encodeEvent(event: StreamEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

function encodeKeepAlive(): Uint8Array {
  // An SSE comment line: ignored by EventSource, but keeps intermediaries
  // from treating the connection as idle.
  return encoder.encode(": keep-alive\n\n");
}

interface Connection {
  id: number;
  controller: ReadableStreamDefaultController<Uint8Array>;
  /** Events buffered because the connection is backed up (task 5.6b). */
  outbox: StreamEvent[];
  /** Set once this connection has had to discard events; cleared on drain. */
  fellBehind: boolean;
  keepAliveTimer: ReturnType<typeof setInterval>;
}

/**
 * Manages every open SSE connection for the realtime event stream.
 *
 * Subscribes to the shared {@link EventBus} exactly once and fans each event
 * out to every open connection, isolating a connection whose write fails
 * (design.md's Multiple Concurrent Clients requirement; task 5.6) and
 * bounding what accumulates for a connection that stops reading without
 * erroring — a genuinely different failure from a write error (design.md D28;
 * task 5.6b).
 *
 * Per design.md D32/R21, every log call reachable from delivering an event —
 * fan-out, overflow, the fell-behind signal, serialisation, failing-client
 * isolation — MUST go through `deliveryLogger` (the stdout-only instance from
 * `engine.ts`), never through `lifecycleLogger`. Only connection accepted/
 * closed logging uses `lifecycleLogger` (the primary logger), so an operator
 * diagnosing a stalled dashboard can still find stream activity in the log
 * view. This is enforced by {@link assertLogCycleIsClosed}, not by review.
 */
export class EventStreamHub {
  private nextConnectionId = 1;
  private readonly connections: Map<number, Connection> = new Map();
  private readonly unsubscribeFromBus: () => void;

  constructor(
    bus: EventBus,
    private readonly deliveryLogger: Logger,
    private readonly lifecycleLogger: Logger,
    private readonly bufferCapacity: number = DEFAULT_CONNECTION_BUFFER_CAPACITY,
    private readonly keepAliveMs: number = DEFAULT_KEEPALIVE_MS,
  ) {
    this.unsubscribeFromBus = bus.subscribe((event) => this.broadcast(event));
  }

  /** Number of currently open connections. */
  get connectionCount(): number {
    return this.connections.size;
  }

  /** Open a new SSE connection and return its Response. */
  open(): Response {
    const id = this.nextConnectionId++;

    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const connection: Connection = {
          id,
          controller,
          outbox: [],
          fellBehind: false,
          keepAliveTimer: setInterval(() => {
            try {
              controller.enqueue(encodeKeepAlive());
            } catch {
              this.closeConnection(id);
            }
          }, this.keepAliveMs),
        };
        this.connections.set(id, connection);
        this.lifecycleLogger.info({ connectionId: id }, "SSE client connected");
      },
      pull: () => {
        const connection = this.connections.get(id);
        if (connection) this.drain(connection);
      },
      cancel: () => {
        this.closeConnection(id);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  /** Release every connection and the hub's own bus subscription. */
  stop(): void {
    this.unsubscribeFromBus();
    for (const id of [...this.connections.keys()]) {
      this.closeConnection(id);
    }
  }

  // ---------------------------------------------------------------------------
  // Delivery (design.md D32/R21 boundary — deliveryLogger only, below this line)
  // ---------------------------------------------------------------------------

  private broadcast(event: StreamEvent): void {
    for (const connection of this.connections.values()) {
      this.deliver(connection, event);
    }
  }

  private isBackedUp(connection: Connection): boolean {
    const { desiredSize } = connection.controller;
    return desiredSize !== null && desiredSize <= 0;
  }

  private deliver(connection: Connection, event: StreamEvent): void {
    // Preserve order: once anything is buffered, keep buffering until a
    // drain empties it, rather than interleaving direct writes with buffered
    // ones.
    if (connection.outbox.length > 0 || this.isBackedUp(connection)) {
      this.bufferEvent(connection, event);
      return;
    }
    try {
      connection.controller.enqueue(encodeEvent(event));
    } catch (err) {
      this.deliveryLogger.warn(
        { err, connectionId: connection.id },
        "SSE write failed; closing connection",
      );
      this.closeConnection(connection.id);
    }
  }

  private bufferEvent(connection: Connection, event: StreamEvent): void {
    if (connection.outbox.length >= this.bufferCapacity) {
      connection.outbox.shift();
      if (!connection.fellBehind) {
        this.deliveryLogger.warn(
          { connectionId: connection.id, capacity: this.bufferCapacity },
          "SSE client fell behind; oldest buffered events discarded",
        );
      }
      connection.fellBehind = true;
    }
    connection.outbox.push(event);
  }

  private drain(connection: Connection): void {
    if (connection.fellBehind) {
      try {
        connection.controller.enqueue(encodeEvent({ category: "fell_behind" }));
      } catch (err) {
        this.deliveryLogger.warn(
          { err, connectionId: connection.id },
          "SSE write failed while signalling fell-behind; closing connection",
        );
        this.closeConnection(connection.id);
        return;
      }
      connection.fellBehind = false;
    }

    while (connection.outbox.length > 0) {
      if (this.isBackedUp(connection)) return;
      const next = connection.outbox.shift();
      if (next === undefined) return;
      try {
        connection.controller.enqueue(encodeEvent(next));
      } catch (err) {
        this.deliveryLogger.warn(
          { err, connectionId: connection.id },
          "SSE write failed; closing connection",
        );
        this.closeConnection(connection.id);
        return;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle (primary/lifecycleLogger only, below this line)
  // ---------------------------------------------------------------------------

  private closeConnection(id: number): void {
    const connection = this.connections.get(id);
    if (!connection) return;
    clearInterval(connection.keepAliveTimer);
    this.connections.delete(id);
    try {
      connection.controller.close();
    } catch {
      // Already closed or errored — nothing further to release.
    }
    this.lifecycleLogger.info({ connectionId: id }, "SSE client disconnected");
  }
}
