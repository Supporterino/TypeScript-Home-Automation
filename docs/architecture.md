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
  │  │ /status (Hono)  │  ← path is configurable via WEB_UI_PATH    │
│  └─────────────────┘                                           │
└──────┬────────────────────────────────────────────────────────┘
       │
  ┌────▼──────┐      ┌───────────────┐
  │ Mosquitto │◄────►│ Zigbee2MQTT   │
  │  Broker   │      └───────────────┘
  └───────────┘
```

---

## Core structure

The repository is a Bun workspace of four packages; `@ts-ha/core` is organised
into subfolders by responsibility:

| Folder | Contents |
|---|---|
| `packages/core/src/` (flat) | `engine.ts`, `automation.ts`, `automation-manager.ts` — the glue layer |
| `packages/core/src/mqtt/` | `mqtt-service.ts`, `mqtt-utils.ts` |
| `packages/core/src/http/` | `http-server.ts`, `http-client.ts` |
| `packages/core/src/scheduling/` | `cron-scheduler.ts` |
| `packages/core/src/state/` | `state-manager.ts` |
| `packages/core/src/logging/` | `log-buffer.ts` |
| `packages/core/src/services/` | `shelly-service.ts`, `nanoleaf-service.ts`, `ntfy-notification-service.ts`, `open-meteo-service.ts`, `openweathermap-service.ts`, `homekit-service.ts`, `homekit-accessory-factory.ts`, `service-plugin.ts`, `service-registry.ts` |
| `packages/core/src/devices/` | `aqara-h1-automation.ts`, `ikea-styrbar-automation.ts`, `ikea-rodret-automation.ts` |
| `packages/core/src/zigbee/` | `device-registry.ts` — Zigbee2MQTT device discovery and state tracking |
| `packages/shared/src/` | `@ts-ha/shared` contracts, constants, and pure helpers |
| `packages/web-ui/src/` | `@ts-ha/web-ui` Hono routes, `WebUiService` plugin, React + Mantine frontend, compiled asset constants |

---

## Core components

### `createEngine()`

A factory function (not a class) that wires all services together and returns an `Engine` object with:

- **Lifecycle:** `start()`, `stop()`
- **Services:** `mqtt`, `http`, `state`, `deviceRegistry`, plus any services registered via the `services` map (e.g. `shelly`, `nanoleaf`, `notifications`, `weather`, or custom services)
- **Internals (advanced):** `config`, `logger`, `manager`

The `start()` call loads automation files, registers triggers, connects to MQTT, and starts the HTTP server.

### `AutomationManager`

Discovers and loads automation files from `automationsDir` at startup. For each automation it:

1. Creates a child pino logger scoped with `{ automation: name }`
2. Calls `_inject()` to provide services (mqtt, state, http, logger, config, services registry, deviceRegistry)
3. Calls `onStart()`
4. Registers all triggers with the appropriate service

On shutdown, calls `onStop()` on every automation in reverse registration order.

### `MqttService`

A thin wrapper around the `mqtt` package. Maintains a single connection to the broker and multiplexes subscriptions across automations. Uses the `mqtt-utils.ts` wildcard matching implementation to route messages to the correct automation handlers.

### `CronScheduler`

Wraps the [`cron`](https://www.npmjs.com/package/cron) package. Each `{ type: "cron" }` trigger registers a job that fires `execute()` on schedule. All jobs are stopped on engine shutdown.

### `StateManager`

An in-memory `Map<string, unknown>` protected by a typed API. When `set()` is called, it notifies all registered state-trigger listeners synchronously before returning. Optionally persists to a JSON file on shutdown and restores on startup.

### `LogBuffer`

A circular ring buffer (default 1000 entries) that receives every pino log line as a newline-delimited JSON string via pino's multistream. Each entry is parsed and stored as a `LogEntry` object. `query()` serves the `GET /api/logs` endpoint and the CLI; `subscribe(listener)` additionally feeds the realtime event stream's log category (design.md D32).

Notification is deferred off the synchronous `write()` call via `setImmediate` — `write()` is reached by every `logger.*` call in the engine through pino's sink, so running fan-out (including network writes to connected SSE clients) synchronously inside it would put stream delivery on the hot logging path (design.md D32, R9, mirroring the automation execution context's own async-context requirement). Deferring only the *stack* is not sufficient on its own: a log entry produced by the delivery path's own failure would otherwise re-enter the same cycle across turns rather than the same call stack. The event stream's delivery path (fan-out, per-connection buffering, the fell-behind signal, payload serialisation, failing-client isolation) therefore logs through a **second, stdout-only pino instance** rather than the primary logger, cutting the cycle rather than merely deferring it. Stream *lifecycle* events (a connection accepted or closed, a subscription registered) are not part of the delivery path and remain on the primary logger, visible in the log view — narrowing the stdout-only logger to exactly the delivery path is what keeps that narrower scope honest, since a wider one would make the log view blind to the one subsystem whose failure also breaks the log view. This means **an SSE delivery failure is intentionally absent from the log view** (it is on stdout only); a stream lifecycle event is not.

### `HttpServer`

A `Bun.serve()`-based HTTP server handling:

- `/healthz`, `/readyz` — health probes (always unauthenticated)
- `/webhook/*` — webhook trigger dispatch (optionally authenticated)
- `/api/*` — automations, state, logs, device catalog, rooms, and the realtime event stream — authenticated when `HTTP_TOKEN` is set (see [API Reference](api-reference.md#httpserver) for the full route table)
- `{WEB_UI_PATH}/*` (default: `/status/*`) — routes registered by the `@ts-ha/web-ui` package's `WebUiService` (`ServicePlugin`) when the web UI is enabled: the HTML shell, compiled assets, and login/logout. The `/api/*` routes above are **not** nested under this path — see [Web UI](http/web-ui.md#data-api)

### `ShellyService`

Maintains a `Map<string, ShellyDevice>` of device name → registration (transport, host/topicPrefix, type). Each method routes to `httpRpc()` (HTTP GET against the device's `/rpc/<Method>` endpoint via the shared `HttpClient`) or `mqttRpc()` (JSON-RPC published to `<topicPrefix>/rpc`, correlated by request id on a single shared `<src>/rpc` subscription) based on the target device's fixed-at-registration `transport` field — no fallback between transports. Typed response interfaces are provided for switch and cover status.

### `NanoleafService`

Maintains a `Map<string, NanoleafDevice>` of registered panels. Makes HTTP requests to the Nanoleaf OpenAPI (local API, no cloud). Pairing is handled separately by the CLI `nanoleaf pair` command.

### `DeviceRegistry`

Subscribes to `{prefix}/bridge/devices` (a retained Zigbee2MQTT topic) to build a device list, and to `{prefix}/bridge/event` to react to joins and departures in real time. Maintains a per-device MQTT subscription for each tracked device to track live state — incoming payloads are **merged** on top of the last-known state. Exposes device metadata, merged state snapshots, human-readable nice names, and change/join/leave listeners to automations. Enabled via `DEVICE_REGISTRY_ENABLED=true`; exposed as `engine.deviceRegistry` (`null` when disabled).

### `HttpClient`

A simple wrapper around the global `fetch` with structured pino logging of every request and response. Shared across all services that need HTTP.

### `HomekitService`

Runs a HAP-NodeJS bridge inside the engine process. On `onStart()` it iterates all devices already known to the `DeviceRegistry` and creates a HAP accessory for each one (via `homekit-accessory-factory.ts`), then subscribes to device-added, device-removed, and per-device state-change events to keep accessories in sync at runtime. Implements `registerRoutes()` to expose `GET /api/homekit/status` on the shared Hono app. Requires `DEVICE_REGISTRY_ENABLED=true`; logs a warning and skips startup when the registry is absent.

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

The framework is split into four independently published workspace packages:

| Package | Contents | Published |
|---|---|---|
| `@ts-ha/shared` | Domain/wire contracts, contract constants, pure helpers | Yes |
| `@ts-ha/core` | Engine, services, device sources, HTTP server, MQTT, state, scheduling | Yes |
| `@ts-ha/web-ui` | Hono routes, `WebUiService` plugin, React app, compiled assets | Yes |
| `@ts-ha/cli` | `DebugClient`, `ts-ha` binary, OpenTUI dashboard, `ts-ha run` | Yes |

Dependency direction is one-way: `shared` ← `core`, `shared` ← `web-ui`,
`cli` → {`core`, `shared`}. `web-ui` imports nothing from `core` (it satisfies
the service-plugin contract structurally); `core` never references `web-ui`.
See `AGENTS.md` (Workspace Layout) and `scripts/guard-deps.ts`, which enforce
this boundary.
