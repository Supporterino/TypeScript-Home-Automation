# HTTP Server

## Purpose

A `Bun.serve()`-backed HTTP server built on the Hono web framework. Provides health probes, webhook trigger endpoints, a debug API, and the web UI dashboard. Supports optional Bearer token / session cookie authentication on API routes.

## Requirements

### Requirement: Server Lifecycle

`start()` MUST begin listening on the configured port.

`stop()` MUST stop the server (using `server.stop(true)` for immediate shutdown).

The system MUST be creatable with `HTTP_PORT=0` — in this case, no server is started and the engine logs an info message.

### Requirement: Endpoints

The system MUST serve the endpoint inventory below. Health probes and webhook
dispatch MUST remain unauthenticated; everything under `/api/*` MUST be subject
to the authorisation rules described here. Endpoints whose detailed behaviour is
specified elsewhere in this capability are listed here by route and
cross-referenced rather than restated.

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

Compiled web UI assets are also served unauthenticated, from content-addressed
routes beneath the UI path — see **Static Asset Routes**.

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
- Accept session cookie (`ts-ha-session=<token>`)
- Return 401 `{ error: "Unauthorized" }` on failure
- Allow all requests when `HTTP_TOKEN` is empty

The cookie MUST remain a supported credential in its own right, because the
event stream is opened by a browser `EventSource`, which cannot set a request
header.

##### Status

`GET /api/status` — Same response as `/readyz`

##### Automations

`GET /api/automations` — List all automations with trigger summaries and count.
Each entry reports its enabled state.

`GET /api/automations/:name` — Get details for a single automation. 404 if not found.

`POST /api/automations/:name/trigger` — Manually trigger an automation. Request body:
```json
{
  "type": "mqtt" | "cron" | "state" | "webhook",
  // ... type-specific fields (topic, payload, expression, key, etc.)
}
```
Returns `{ status: "triggered", automation, type }` on success. 404 if automation not found. 400 for invalid body. 500 on execution failure.

A disabled automation MUST NOT execute through this endpoint. The request MUST be
rejected with 409 and a descriptive error, and the automation MUST NOT run. A
disabled automation is fully stopped — its triggers are deregistered and
`onStop()` has run — so executing it on demand would act on the house through an
automation the system reports as off, which is the same dishonesty that
disabling exists to prevent.

Enabled-state changes and source retrieval are described under **Automation
Control Endpoints**; execution history and relationships under **Automation
Observability Endpoints**.

##### State

`GET /api/state` — All state keys and values. Returns `{ state: Record<string, unknown>, count }`.

`GET /api/state/:key` — Single state value. Returns `{ key, value, exists }`.

`PUT /api/state/:key` — Set a state value. Body is the raw value (any JSON). Returns `{ key, value, previous }`.

`DELETE /api/state/:key` — Delete a state key. Returns `{ key, deleted: boolean }`.

All state endpoints return 503 if `StateManager` is not yet available.

Keys in the state store's reserved internal namespace are excluded from the
listing and rejected by the write and delete endpoints — see **State Endpoints
Exclude Reserved Keys**.

##### Logs

`GET /api/logs` — Query the log buffer. Query parameters:
- `automation` — Filter by automation name
- `level` — Filter by minimum log level (by name: "trace" through "fatal")
- `limit` — Max entries (default: 50, clamped to 1–1000)

Returns `{ entries: LogEntry[], count }`.

Returns 503 if `LogBuffer` is not yet available.

##### Devices

The Zigbee-only device endpoints `GET /api/devices` and
`GET /api/devices/:friendlyName` are **removed**. Devices are served from the
unified, source-spanning endpoints described under **Unified Device Endpoints**,
addressed by qualified identifier, and actuated through the endpoint described
under **Device Command Endpoint**.

##### Rooms

Room listing, creation, renaming, deletion, and device assignment — see **Room
Endpoints**.

##### Events

A single long-lived server-sent event stream — see **Event Stream Endpoint**.

#### Scenario: Removed Zigbee device paths are gone

- **WHEN** a client requests `/api/devices` or `/api/devices/:friendlyName`
- **THEN** the response is an error carrying no device payload, and the unified
  device endpoints are served from different paths

#### Scenario: Manual trigger of a disabled automation is refused

- **WHEN** a client posts to the manual trigger endpoint for an automation that
  is disabled
- **THEN** the response is 409 with a descriptive error and the automation does
  not execute

#### Scenario: Manual trigger of an enabled automation is unaffected

- **WHEN** a client posts a valid trigger body for an enabled automation
- **THEN** the automation executes and the response reports it as triggered

#### Scenario: The stream authorises from the cookie alone

- **WHEN** a token is configured and a browser opens the event stream carrying
  only the session cookie
- **THEN** the connection is authorised, because `EventSource` cannot set an
  `Authorization` header

### Requirement: Device Capability Passthrough

The unified device endpoints MUST include each device's capability schema in
their responses. The capability schema MUST NOT be stripped, because clients
depend on it to render controls for devices the server has no specific knowledge
of.

Where a device publishes no capability schema, the field MUST be present and
empty rather than absent, so clients need not distinguish "no capabilities" from
"not supplied".

This applies to the unified endpoints only. The removed Zigbee-only endpoints
are not modified to carry the schema on their way out: no client renders
controls from it before those endpoints are gone, so doing so would add a
passthrough and its tests to two endpoints that are deleted in the same change.

#### Scenario: Capability schema is returned

- **WHEN** a client reads the device list
- **THEN** each device's response includes its published capability schema

#### Scenario: Device without a schema is well-formed

- **WHEN** a tracked device publishes no capability schema
- **THEN** its response carries an empty capability schema rather than omitting
  the field

### Requirement: Unified Device Endpoints

The system MUST expose device endpoints spanning every available device source,
not Zigbee alone. Each device MUST be addressed by an identifier qualified by
its source, so devices from different sources that share a name remain distinct.

The system MUST provide:

- a list of all devices across all available sources, with a count
- retrieval of a single device by qualified identifier, returning 404 when
  unknown

A source that is unavailable because its backing service is disabled or
unconfigured MUST be omitted from the results rather than causing the request to
fail. The response MUST indicate which sources are available, so a client can
distinguish "no devices" from "source disabled".

The previous Zigbee-only device endpoints, `GET /api/devices` and
`GET /api/devices/:name`, MUST be removed rather than changed in place, and the
unified endpoints MUST be served from different paths. Both existing clients —
the CLI dashboard and the current web UI — already handle a failed device fetch
by reporting devices unavailable, and that handling only engages on an error
response. Serving a source-qualified payload from the previous paths would return
success with a shape those clients cannot read, so each would report itself
healthy while rendering entries with no name. Removal converts a silent
misrender into the degradation both clients already implement.

Requesting a removed path MUST produce an error response rather than any device
payload.

Path naming MUST NOT restate information the identifier already carries: a
qualified identifier names its own source, so an endpoint addressing one device
by qualified identifier MUST NOT also carry the source in its path.

A qualified identifier MUST occupy exactly one path segment, and MUST be
percent-encoded by the client and decoded by the server as a whole. It MUST NOT
be split across segments. A device identifier may itself contain the delimiter —
a state toggle's identifier is a state key, which is already colon-scoped — so
the identifier MUST be parsed by splitting on the first delimiter only, with
everything after it belonging to the device identifier.

#### Scenario: An identifier containing the delimiter round-trips

- **WHEN** a client addresses a state toggle whose device identifier is itself
  colon-scoped, such as an automation-scoped state key
- **THEN** the server resolves the same device, because the identifier is
  carried in one percent-encoded segment and split on its first delimiter only

#### Scenario: Removed device paths no longer serve devices

- **WHEN** a client requests a previously supported Zigbee-only device path
- **THEN** the response is an error and carries no device payload

#### Scenario: An existing client degrades rather than misrenders

- **WHEN** a client written against the previous device endpoints requests them
- **THEN** it receives an error it already handles and reports devices as
  unavailable

#### Scenario: Devices from all sources are listed

- **WHEN** Zigbee, Shelly, and Nanoleaf sources are all available and a client
  reads the device list
- **THEN** devices from all three are returned, each carrying its source

#### Scenario: Disabled source is reported, not fatal

- **WHEN** the device registry is disabled and a client reads the device list
- **THEN** the request succeeds, returns devices from the remaining sources, and
  reports the Zigbee source as unavailable

#### Scenario: Same name in two sources stays distinct

- **WHEN** a Zigbee device and a Shelly device share a friendly name
- **THEN** each is retrievable by its own qualified identifier

### Requirement: Device Command Endpoint

The system MUST expose an endpoint that issues a command to a single device,
addressed by qualified identifier.

The request MUST be validated against the target device's declared capabilities
before dispatch. A command naming an unknown property, or carrying a value
outside a declared range or permitted set, MUST be rejected with 400 and a
descriptive error, and MUST NOT reach the device. An unknown device MUST return
404. A device whose source is unavailable MUST return 503.

The endpoint MUST NOT forward an arbitrary payload to a device transport
unvalidated.

#### Scenario: Valid command is dispatched

- **WHEN** a client posts a command within the device's declared constraints
- **THEN** the command is dispatched to the device and a success response is
  returned

#### Scenario: Out-of-range value is rejected

- **WHEN** a client posts a numeric value above the device's declared maximum
- **THEN** the response is 400 with a descriptive error and nothing is sent to
  the device

#### Scenario: Unknown property is rejected

- **WHEN** a client posts a command naming a property the device does not declare
- **THEN** the response is 400 with a descriptive error and nothing is sent to
  the device

#### Scenario: Unknown device returns not found

- **WHEN** a client posts a command for an unrecognised device identifier
- **THEN** the response is 404

### Requirement: Automation Control Endpoints

The system MUST expose endpoints to read and change an automation's enabled
state, and to read its source.

- Reading an automation MUST include its current enabled state.
- Setting the enabled state MUST apply to exactly one automation, MUST return
  the resulting state, and MUST return 404 for an unknown automation.
- A state change that fails — for example because enabling triggers a failing
  `onStart()` or a webhook path conflict — MUST return an error response
  carrying a descriptive message, and the automation MUST be left in a
  consistent state rather than half-registered.
- Reading source MUST return the current contents of the file the automation was
  loaded from, addressed by automation name, and MUST return 404 for an unknown
  automation.

Source MUST be addressable only by automation name. The system MUST NOT accept a
file path from the client.

#### Scenario: Automation listing carries enabled state

- **WHEN** a client reads the automation list
- **THEN** each entry reports whether it is enabled

#### Scenario: Disabling returns the resulting state

- **WHEN** a client disables an automation
- **THEN** the response reports the automation as disabled

#### Scenario: Failed enable reports the reason

- **WHEN** enabling an automation fails because a required service is
  unavailable
- **THEN** the response carries a descriptive error and the automation remains
  disabled

#### Scenario: Source is returned by name

- **WHEN** a client requests an automation's source by name
- **THEN** the current file contents are returned

#### Scenario: Unknown automation source returns not found

- **WHEN** a client requests source for an unregistered name
- **THEN** the response is 404

### Requirement: Room Endpoints

The system MUST expose endpoints to list rooms with their membership, create a
room, rename a room, delete a room, and assign a device to a room or clear its
assignment.

- Creating or renaming a room to a name already in use MUST return 409 or 400
  with a descriptive error.
- Deleting a room MUST succeed and MUST NOT delete any device.
- Assigning a device MUST remove any previous assignment as one operation.
- Assignment MUST be recorded against the device's stable identity, not its
  display name.
- Room reads MUST include members that are currently unavailable, marked as
  such, and MUST NOT fail when an assignment refers to a device that has never
  been observed.
- An unknown room MUST return 404.

The system MUST also expose the set of devices belonging to no room.

#### Scenario: Rooms list includes unavailable members

- **WHEN** a room contains one present and one unpaired device and the room list
  is read
- **THEN** both are returned and the unpaired one is marked unavailable

#### Scenario: Duplicate room name is rejected

- **WHEN** a room is created with a name already in use
- **THEN** an error response is returned and no room is created

#### Scenario: Reassignment is atomic

- **WHEN** a device assigned to one room is assigned to another
- **THEN** it is reported only in the new room

#### Scenario: Deleting a room keeps its devices

- **WHEN** a room containing devices is deleted
- **THEN** the response succeeds and those devices are reported as unassigned

#### Scenario: Unknown room returns not found

- **WHEN** a request addresses a room identifier that does not exist
- **THEN** the response is 404

### Requirement: Automation Observability Endpoints

The system MUST expose, per automation, its recent execution history and its
relationships.

- Execution history MUST return the retained records, each carrying start time,
  trigger, duration, and outcome including an error message when failed, and
  MUST return an empty history rather than an error for an automation that has
  not run.
- Relationships MUST report declared required services with their current
  registration status, referenced devices, watched state keys, and observed
  written state keys.
- The response MUST distinguish declared relationships from observed ones, so a
  client does not present partial observations as complete facts.
- An unknown automation MUST return 404.

#### Scenario: History is returned newest first

- **WHEN** an automation has executed several times and its history is read
- **THEN** the retained records are returned with the most recent first

#### Scenario: Never-run automation returns empty history

- **WHEN** history is read for an automation that has not executed
- **THEN** an empty history is returned rather than an error

#### Scenario: Relationships separate declared from observed

- **WHEN** relationships are read for an automation
- **THEN** required services, referenced devices, and watched keys are marked
  declared, and written keys are marked observed

#### Scenario: Required service status is reported

- **WHEN** an automation declares a required service that is not registered
- **THEN** the relationships response reports that service as unavailable

### Requirement: Event Stream Endpoint

The system MUST expose an endpoint that holds an open connection and streams
server-sent events, subject to the same authorisation rules as the other `/api`
endpoints.

The connection MUST be released, along with every listener registered on its
behalf, when the client disconnects. A failure writing to one connection MUST
NOT affect other connections or the engine.

Behaviour of the stream's contents is defined by the `realtime-events`
capability.

#### Scenario: Stream requires authorisation

- **WHEN** an access token is configured and a client opens the stream without
  valid credentials
- **THEN** the connection is refused as unauthorised

#### Scenario: Disconnect releases resources

- **WHEN** a streaming client disconnects
- **THEN** every listener registered for that connection is removed

### Requirement: Static Asset Routes

Compiled web UI assets MUST be served from routes beneath the UI path, addressed
by a hash of their contents, with cache directives permitting indefinite client
caching and a correct content type per asset.

Asset routes MUST be readable without authentication, and MUST serve only
compiled application code and styles — never instance data, credentials, or
device information.

Asset routes MUST be registered only when the web UI is enabled.

#### Scenario: Assets are cacheable

- **WHEN** a client requests a content-addressed asset
- **THEN** the response carries cache directives permitting indefinite caching

#### Scenario: Assets need no session

- **WHEN** an unauthenticated client requests a content-addressed asset while a
  token is configured
- **THEN** the asset is served

#### Scenario: No asset routes when the UI is disabled

- **WHEN** the web UI is disabled
- **THEN** no asset routes are registered

### Requirement: State Endpoints Exclude Reserved Keys

The state listing endpoint MUST omit keys in the state store's reserved internal
namespace, and the state write and delete endpoints MUST reject them.

The listing endpoint returns both a map of keys and a count. Both MUST be derived
from the same filtered set, so the reported count always equals the number of
keys returned. Filtering the map while counting the unfiltered store would report
a count that disagrees with the payload accompanying it.

Rejecting a reserved key MUST return a descriptive error and MUST NOT modify the
store. Room definitions, room membership, and automation enabled flags are
mutable only through their own endpoints, so that changing an automation's
enabled flag always runs its stop or start lifecycle rather than only setting a
value.

#### Scenario: Reserved keys are absent from the listing

- **WHEN** the store contains reserved keys and a client reads the state listing
- **THEN** no reserved key appears in the response

#### Scenario: Count matches the filtered payload

- **WHEN** the store contains both reserved and ordinary keys and a client reads
  the state listing
- **THEN** the reported count equals the number of keys in the returned map

#### Scenario: Writing a reserved key is rejected

- **WHEN** a client writes to a reserved key through the state endpoint
- **THEN** the response is an error and the stored value is unchanged

#### Scenario: Deleting a reserved key is rejected

- **WHEN** a client deletes a reserved key through the state endpoint
- **THEN** the response is an error and the value is retained

#### Scenario: An enabled flag cannot be set as raw state

- **WHEN** a client attempts to change an automation's enabled flag through the
  state endpoint rather than the automation control endpoint
- **THEN** the request is rejected and the automation's wiring is unchanged

### Requirement: Web UI Mounting

The system MUST support lazy mounting of the web UI on a configurable path (default: `/status`). The web UI is only mounted when `WEB_UI_ENABLED=true`. The Hono sub-app is served under the configured path prefix.

### Requirement: Service Plugin Routes

The system MUST call `registerRoutes(app)` on every `ServicePlugin` before the server starts listening, allowing plugins to mount custom API routes.

### Requirement: Authentication Warning

The system MUST log a warning at startup when `HTTP_TOKEN` is empty, reminding the operator to secure the API.

### Requirement: Internal API

The `HttpServer` exposes:
- `fetch: (req: Request) => Response | Promise<Response>` — The Hono app's fetch handler (for testing without starting a real server)
- `setManagers(state, automations, logs)` — Set references after construction
- `setDeviceRegistry(registry)` — Set the device registry reference
- `setEngineStarted(started)` — Mark engine as started for readiness checks
- `mountWebUi(path, token)` — Lazy-load and mount the web UI
- `mountServiceRoutes(registry)` — Mount routes from all service plugins
- `registerWebhook(path, methods, handler)` / `removeWebhook(path)` — Webhook route management
