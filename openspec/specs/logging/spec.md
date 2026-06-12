# Logging

## Purpose

Structured logging via pino with dual output: console (pretty-printed in dev, raw JSON in prod) and an in-memory ring buffer for API querying.

## Requirements

### Logger Configuration

The system MUST create a pino logger with log level from `config.logLevel`.

The system MUST use a pino multistream with two streams:
1. **stdout**: Pretty-printed via `pino-pretty` in development (`NODE_ENV !== "production"`), raw newline-delimited JSON in production
2. **LogBuffer**: Receives identical JSON lines for in-memory storage and API queries

### Child Loggers

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

### LogBuffer

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

The `LogQuery` interface:
```ts
interface LogQuery {
  automation?: string;  // Filter by automation name
  level?: number;       // Filter by minimum log level
  limit?: number;       // Max entries to return (default: 50, max: 1000)
}
```

Results MUST be returned newest-first.

### Log Content Conventions

All log messages MUST use structured context:
```ts
logger.error({ err, topic, device }, "message");
logger.info({ key, oldValue, newValue }, "State changed");
logger.warn({ dir }, "No automation files found");
```

Errors MUST be logged with the `err` key for pino error serialization.
