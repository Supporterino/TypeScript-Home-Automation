# Architecture

## Overview

TypeScript Home Automation is a single-process engine that bridges MQTT messages, scheduled jobs, HTTP webhooks, and shared state into typed TypeScript automation classes.

```
┌───────────────────────────────────────────────────────────────┐
│                       Automation Engine                       │
│                                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ Motion   │  │ Temp     │  │ Remote   │  │ Schedule │ ...  │
│  │ Light    │  │ Alert    │  │ Control  │  │ Report   │      │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬────┘      │
│       │             │             │              │            │
│  ┌────▼─────────────▼─────────────▼──────────────▼────────┐   │
│  │                   AutomationManager                    │   │
│  └──┬──────┬──────┬──────┬──────┬──────┬──────┬───────┬───┘   │
│     │      │      │      │      │      │      │       │       │
│  ┌──▼──┐ ┌─▼──┐ ┌─▼──┐ ┌─▼────┐ ┌─▼───┐ ┌──▼──┐ ┌──▼─┐ ┌─▼──┐ │
│  │MQTT │ │Cron│ │HTTP│ │Shelly│ │Nano │ │State│ │Ntfy│ │Wthr│ │
│  └──┬──┘ └────┘ └────┘ └──────┘ │leaf │ └──┬──┘ └────┘ └────┘ │
│     │                           └─────┘    │                  │
│  ┌──▼──────────────┐        ┌──────────────▼──────────┐        │
│  │   HTTP Server   │        │   Log Buffer (ring)     │        │
│  │ /healthz        │        │   2500 entries          │        │
│  │ /readyz         │        └─────────────────────────┘        │
│  │ /webhook/*      │                                           │
│  │ /debug/*        │                                           │
│  │ /status (Hono)  │                                           │
│  └─────────────────┘                                           │
└──────┬────────────────────────────────────────────────────────┘
       │
  ┌────▼──────┐      ┌───────────────┐
  │ Mosquitto │◄────►│ Zigbee2MQTT   │
  │  Broker   │      └───────────────┘
  └───────────┘
```

---

## Core components

### `createEngine()`

A factory function (not a class) that wires all services together and returns `{ start(), stop(), mqtt, shelly, nanoleaf, weather, notifications }`. The `start()` call loads automation files, registers triggers, connects to MQTT, and starts the HTTP server.

### `AutomationManager`

Discovers and loads automation files from `automationsDir` at startup. For each automation it:

1. Creates a child pino logger scoped with `{ automation: name }`
2. Calls `_inject()` to provide services (mqtt, shelly, nanoleaf, state, notify, http, logger, config)
3. Calls `onStart()`
4. Registers all triggers with the appropriate service

On shutdown, calls `onStop()` on every automation in reverse registration order.

### `MqttService`

A thin wrapper around the `mqtt` package. Maintains a single connection to the broker and multiplexes subscriptions across automations. Uses the `mqtt-utils.ts` wildcard matching implementation to route messages to the correct automation handlers.

### `CronScheduler`

Wraps `node-cron`. Each `{ type: "cron" }` trigger registers a job that fires `execute()` on schedule. All jobs are stopped on engine shutdown.

### `StateManager`

An in-memory `Map<string, unknown>` protected by a typed API. When `set()` is called, it notifies all registered state-trigger listeners synchronously before returning. Optionally persists to a JSON file on shutdown and restores on startup.

### `LogBuffer`

A circular ring buffer (default 2500 entries) that receives every pino log line as a newline-delimited JSON string via pino's multistream. Each entry is parsed and stored as a `LogEntry` object. The buffer is queried by the debug API and status page for log display and filtering.

### `HttpServer`

A `Bun.serve()`-based HTTP server handling:

- `/healthz`, `/readyz` — health probes (always unauthenticated)
- `/webhook/*` — webhook trigger dispatch (optionally authenticated)
- `/debug/*` — debug API (automations, state, logs) — authenticated when `HTTP_TOKEN` is set
- `/status/*` — Hono sub-app for the web status page (mounted lazily when `STATUS_PAGE_ENABLED=true`)

### `ShellyService`

Maintains a `Map<string, string>` of device name → host. Each method call constructs the appropriate Shelly RPC URL and makes an HTTP POST using the shared `HttpClient`. Typed response interfaces are provided for switch and cover status.

### `NanoleafService`

Maintains a `Map<string, NanoleafDevice>` of registered panels. Makes HTTP requests to the Nanoleaf OpenAPI (local API, no cloud). Pairing is handled separately by the CLI `nanoleaf pair` command.

### `HttpClient`

A simple wrapper around the global `fetch` with structured pino logging of every request and response. Shared across all services that need HTTP.

---

## Data flow: MQTT trigger

```
Zigbee2MQTT publishes to "zigbee2mqtt/hallway_sensor"
  → MqttService.onMessage()
  → topicMatches("zigbee2mqtt/hallway_sensor", trigger.topic)
  → payload filter (if defined)
  → automation.execute({ type: "mqtt", topic, payload })
  → automation logic runs
  → may call this.mqtt.publishToDevice(), this.state.set(), etc.
  → pino logs to stdout + LogBuffer simultaneously via multistream
```

## Data flow: state trigger

```
automationA.execute() calls this.state.set("night_mode", true)
  → StateManager.set("night_mode", true)
  → notifies all registered listeners for "night_mode"
  → automationB.execute({ type: "state", key: "night_mode", newValue: true, oldValue: false })
  → (synchronous, same event loop tick)
```

---

## Logging

Pino is configured with a multistream:

- **Stream 1**: stdout — pretty-printed in development (`NODE_ENV !== "production"`), raw newline-delimited JSON in production
- **Stream 2**: `LogBuffer` — the same JSON lines stored in the ring buffer for API queries

Every service and automation uses a child logger scoped with a `service` or `automation` binding, which appears on every log line from that component.

---

## Module boundaries

The framework is split into three categories:

| Category | Path | Included in npm package |
|---|---|---|
| Core framework | `src/core/` | Yes |
| Public API / types | `src/index.ts`, `src/types/` | Yes |
| Standalone runner | `src/standalone.ts` | No |
| Example automations | `src/automations/` | No |
| CLI tool | `src/cli/` | Yes (as `ts-ha` binary) |
| Web status page source | `src/core/status-page/app/` | No (compiled to assets) |
