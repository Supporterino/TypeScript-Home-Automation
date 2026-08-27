# Logging

## Purpose

Structured logging via pino with dual output: console (pretty-printed in dev, raw JSON in prod) and an in-memory ring buffer for API querying.

## Requirements

### Requirement: Logger Configuration

The system MUST create a pino logger with log level from `config.logLevel`.

The system MUST use a pino multistream with two streams:
1. **stdout**: Pretty-printed via `pino-pretty` in development (`NODE_ENV !== "production"`), raw newline-delimited JSON in production
2. **LogBuffer**: Receives identical JSON lines for in-memory storage and API queries

The system MUST additionally create a second logger, at the same level, writing
to stdout only and bypassing the `LogBuffer`. This logger MUST be constructed as
an independent instance rather than derived from the primary logger: a pino child
inherits its parent's destination set, so no child of the primary logger can omit
the buffer stream.

The second logger exists solely to break the feedback cycle between the log
buffer and the realtime event stream. The stream's log category delivers every
entry as it is written, so any log emitted while delivering an event produces
another event, which produces another log. Writing those particular logs to
stdout only terminates the cycle at its source.

Use of the second logger MUST be confined to the event stream's delivery path —
fan-out to connections, per-connection buffer overflow and the fell-behind
signal, payload serialisation failures, and failing-client isolation. Stream
lifecycle logging that is not reachable from a delivery — a connection being
accepted or closed, a subscription being registered or released, the endpoint
starting — MUST continue to use the primary logger, so that an operator
diagnosing a stalled dashboard still finds stream activity in the log view.

#### Scenario: The non-buffered logger is not a child

- **WHEN** the engine constructs its loggers
- **THEN** the stdout-only logger is a separate pino instance and writing to it
  leaves the `LogBuffer` unchanged

#### Scenario: Delivery failures do not reach the buffer

- **WHEN** an event delivery fails for a connection and the failure is logged
- **THEN** the message appears on stdout and no entry is added to the `LogBuffer`

#### Scenario: Stream lifecycle stays visible in the log view

- **WHEN** a client connects to the event stream and later disconnects
- **THEN** both events are recorded in the `LogBuffer` and are retrievable
  through the log query API

### Requirement: Child Loggers

The system MUST create child loggers for every component with a scoped binding:
- `{ service: "mqtt" }` for MQTT service
- `{ service: "cron" }` for cron scheduler
- `{ service: "http" }` for HTTP client
- `{ service: "state" }` for state manager
- `{ service: "http-server" }` for HTTP server
- `{ service: "device-registry" }` for device registry
- `{ service: "services" }` for service registry
- `{ automation: "name" }` for each automation instance

Custom services receive `{ service: "<key>" }` child loggers.

### Requirement: LogBuffer

The system MUST maintain a `LogBuffer` — a circular ring buffer of 2500 log entries.

Each entry is stored as a `LogEntry`:
```ts
interface LogEntry {
  time: number;       // Unix timestamp in ms
  level: number;      // pino level number (10=trace, 20=debug, 30=info, 40=warn, 50=error, 60=fatal)
  msg: string;        // Log message
  automation?: string; // Automation name (from child logger binding), or absent
  [key: string]: unknown; // All other pino fields (err, topic, device, etc.)
}
```

The LogBuffer MUST implement:
- `_write(chunk, encoding, callback)` — pino writable stream interface
- `query(query: LogQuery): LogEntry[]` — filtered retrieval
- subscription — registration and release of listeners notified of each newly
  stored entry

When a write chunk contains multiple newline-delimited JSON objects (as pino may deliver), the LogBuffer MUST split the chunk on newlines and parse each non-empty line independently, storing every successfully parsed entry. A single malformed line MUST NOT cause other valid entries in the same chunk to be dropped.

The buffer MUST allow a consumer to subscribe to newly stored entries rather than
only to poll `query()`, so that the realtime event stream can deliver entries as
they are written. A subscription MUST be releasable, and releasing it MUST leave
no retained reference to the listener.

Notification MUST NOT occur inside the write call. Entries MUST be handed to
listeners on a later turn of the event loop, so that the writable-stream path
pino invokes on every log call performs no listener work inline. Without this,
fan-out to every connected stream client — including network writes — runs
synchronously inside every `logger.debug` in the engine.

Deferring notification bounds the *stack* but does not break the log-to-stream
feedback cycle described under Logger Configuration; a log produced while
notifying merely re-enters on the following turn, producing an unbounded loop
spread across turns rather than a stack overflow. Both the deferral and the
stdout-only logger are required, and neither substitutes for the other.

A listener that throws MUST NOT prevent the entry from being stored, MUST NOT
prevent other listeners from being notified, and MUST NOT propagate to the
logging call that produced the entry.

The `LogQuery` interface:
```ts
interface LogQuery {
  automation?: string;  // Filter by automation name
  level?: number;       // Filter by minimum log level
  limit?: number;       // Max entries to return (default: 50, max: 1000)
}
```

Results MUST be returned newest-first.

#### Scenario: Multi-object chunk captures all entries

- **WHEN** a single `write()` call delivers several newline-delimited JSON log objects
- **THEN** each object is parsed and stored independently, and none are dropped

#### Scenario: One malformed line does not drop the others

- **WHEN** a write chunk contains valid JSON lines and one unparseable line
- **THEN** the valid lines are stored and only the unparseable line is skipped

#### Scenario: Subscribers receive newly written entries

- **WHEN** a listener is subscribed and a log entry is written
- **THEN** the listener receives that entry

#### Scenario: Notification is deferred past the write call

- **WHEN** a log entry is written
- **THEN** the write call returns before any listener is invoked, and the
  listener is invoked on a later turn of the event loop

#### Scenario: Releasing a subscription stops delivery

- **WHEN** a listener is released and a further entry is written
- **THEN** the listener is not invoked and the buffer retains no reference to it

#### Scenario: A throwing listener is contained

- **WHEN** one of several listeners throws while being notified
- **THEN** the entry is still stored, the remaining listeners are still notified,
  and no error propagates to the caller that logged

#### Scenario: Nothing reachable from notification writes to the buffer

- **WHEN** an entry is written, notification runs, and every registered listener
  fails
- **THEN** no additional entry is added to the `LogBuffer` as a result of that
  notification

### Requirement: Log Content Conventions

All log messages MUST use structured context:
```ts
logger.error({ err, topic, device }, "message");
logger.info({ key, oldValue, newValue }, "State changed");
logger.warn({ dir }, "No automation files found");
```

Errors MUST be logged with the `err` key for pino error serialization.
