# HTTP Server

## Purpose

A `Bun.serve()`-backed HTTP server built on the Hono web framework. Provides health probes, webhook trigger endpoints, a debug API, and the web UI dashboard. Supports optional Bearer token / session cookie authentication on API routes.

## Requirements

### Server Lifecycle

`start()` MUST begin listening on the configured port.

`stop()` MUST stop the server (using `server.stop(true)` for immediate shutdown).

The system MUST be creatable with `HTTP_PORT=0` — in this case, no server is started and the engine logs an info message.

### Endpoints

#### Unauthenticated Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/healthz` | Liveness probe. Returns `{ status: "ok" }` with 200. |
| `GET` | `/readyz` | Readiness probe. Returns MQTT + engine status. 200 if ready, 503 if not. |
| `ALL` | `/webhook/*` | Webhook trigger dispatch. Routed to registered handlers by path. |

`/readyz` response:
```json
{
  "status": "ready" | "not ready",
  "checks": { "mqtt": true, "engine": true },
  "startedAt": 1718123456789,
  "tz": "Europe/Berlin"
}
```

#### Webhook Dispatch

The system MUST:
- Extract the path portion after `/webhook/`
- Look up the registered `WebhookRoute` by path
- Return 404 if no route is registered
- Return 405 if the HTTP method is not in the route's allowed set
- Parse body: JSON if `Content-Type: application/json`, otherwise text
- Extract all headers and query parameters
- Call the registered handler with `{ method, headers, query, body }`
- Return `{ status: "ok" }` on success, `{ error: "Internal error" }` with 500 on failure

#### Authenticated Endpoints (prefix: `/api/*`)

All `/api/*` routes MUST check authorization when `HTTP_TOKEN` is set:
- Accept `Authorization: Bearer <token>` header
- Accept session cookie (`session=<token>`)
- Return 401 `{ error: "Unauthorized" }` on failure
- Allow all requests when `HTTP_TOKEN` is empty

##### Status

`GET /api/status` — Same response as `/readyz`

##### Automations

`GET /api/automations` — List all automations with trigger summaries and count

`GET /api/automations/:name` — Get details for a single automation. 404 if not found.

`POST /api/automations/:name/trigger` — Manually trigger an automation. Request body:
```json
{
  "type": "mqtt" | "cron" | "state" | "webhook",
  // ... type-specific fields (topic, payload, expression, key, etc.)
}
```
Returns `{ status: "triggered", automation, type }` on success. 404 if automation not found. 400 for invalid body. 500 on execution failure.

##### State

`GET /api/state` — All state keys and values. Returns `{ state: Record<string, unknown>, count }`.

`GET /api/state/:key` — Single state value. Returns `{ key, value, exists }`.

`PUT /api/state/:key` — Set a state value. Body is the raw value (any JSON). Returns `{ key, value, previous }`.

`DELETE /api/state/:key` — Delete a state key. Returns `{ key, deleted: boolean }`.

All state endpoints return 503 if `StateManager` is not yet available.

##### Logs

`GET /api/logs` — Query the log buffer. Query parameters:
- `automation` — Filter by automation name
- `level` — Filter by minimum log level (by name: "trace" through "fatal")
- `limit` — Max entries (default: 50, clamped to 1–1000)

Returns `{ entries: LogEntry[], count }`.

Returns 503 if `LogBuffer` is not yet available.

##### Devices

`GET /api/devices` — List all tracked Zigbee devices with their current state. Returns `{ devices: DeviceSummary[], count }`.

`GET /api/devices/:friendlyName` — Get a single device by friendly name. 404 if not found.

Returns 503 if `DeviceRegistry` is disabled or not available.

### Web UI Mounting

The system MUST support lazy mounting of the web UI on a configurable path (default: `/status`). The web UI is only mounted when `WEB_UI_ENABLED=true`. The Hono sub-app is served under the configured path prefix.

### Service Plugin Routes

The system MUST call `registerRoutes(app)` on every `ServicePlugin` before the server starts listening, allowing plugins to mount custom API routes.

### Authentication Warning

The system MUST log a warning at startup when `HTTP_TOKEN` is empty, reminding the operator to secure the API.

### Internal API

The `HttpServer` exposes:
- `fetch: (req: Request) => Response | Promise<Response>` — The Hono app's fetch handler (for testing without starting a real server)
- `setManagers(state, automations, logs)` — Set references after construction
- `setDeviceRegistry(registry)` — Set the device registry reference
- `setEngineStarted(started)` — Mark engine as started for readiness checks
- `mountWebUi(path, token)` — Lazy-load and mount the web UI
- `mountServiceRoutes(registry)` — Mount routes from all service plugins
- `registerWebhook(path, methods, handler)` / `removeWebhook(path)` — Webhook route management
