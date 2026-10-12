# CLI Tool

## Purpose

A command-line tool (`ts-ha`) for managing running engine instances. Provides commands for querying automations, devices, state, and logs; interactive terminal dashboard; Nanoleaf device pairing; and multi-target configuration management.

## Requirements

### Requirement: Target Configuration

The CLI MUST maintain a config file at `~/.config/ts-ha/config.json` with:

```ts
interface CliConfig {
  activeTarget: string;              // Currently active target name
  targets: Record<string, CliTarget>; // Saved remote targets
}

interface CliTarget {
  name: string;   // Friendly name
  host: string;   // "host:port"
  token: string;  // Bearer token (empty for no auth)
}
```

The CLI MUST:
- Create default config with a `"local"` target (`localhost:8080`, no token) on first run
- Set file permissions to `0o600` (owner-only, since tokens are stored in plaintext)
- Support `ENOENT` gracefully (create default)

### Requirement: Engine Communication

The CLI MUST communicate with engine instances via HTTP to the configured target's host/port. All API requests include `Authorization: Bearer <token>` when a token is configured.

The `DebugClient` MUST provide methods matching the engine's API:
- `getStatus()` → `GET /api/status`
- `getAutomations()` / `getAutomation(name)` / `triggerAutomation(name, body)` → `/api/automations/*`
- `getAutomationHistory(name)` / `getAutomationRelationships(name)` → `/api/automations/:name/history` and `/api/automations/:name/relationships`
- `getState()` / `getStateKey(key)` / `setState(key, value)` / `deleteState(key)` → `/api/state/*`
- `getDeviceCatalog()` / `getDevice(qualifiedId)` / `sendDeviceCommand(qualifiedId, properties)` / `setDeviceHidden(qualifiedId, hidden)` / `assignDeviceRoom(qualifiedId, roomId)` → `/api/device-catalog/*`
- `getRooms()` / `getUnassignedDevices()` / `createRoom(name)` / `renameRoom(id, name)` / `deleteRoom(id)` / `sendRoomCommand(id, properties)` → `/api/rooms/*`
- `getEnergy()` → `GET /api/energy`
- `getWeather()` → `GET /api/weather`
- `getWalls()` / `getWall(name)` / `createWall(name, config)` / `updateWall(name, input)` / `deleteWall(name)` → `/api/walls/*`
- `getLogs(query)` → `GET /api/logs`
- `getHomekitStatus()` → `GET /api/homekit/status`

`triggerAutomation(name, body)` MUST additionally tolerate a conflict response, which an upgraded engine returns when the named automation is disabled. This is a refusal to run, distinct from an unknown automation's not-found, and MUST be reported as such rather than as a transport failure.

The client MUST decode the realtime event stream from `GET /api/events`. Because an `EventSource` cannot carry an `Authorization` header, the client MUST request the stream with a header-capable mechanism and parse its `data:`-prefixed server-sent events itself.

#### Scenario: Device catalog is retrieved from the unified API

- **WHEN** the device list is requested from an upgraded engine
- **THEN** the client calls `GET /api/device-catalog` and returns source-neutral
  device descriptors, never the removed Zigbee-only endpoints

#### Scenario: Other client methods are unaffected

- **WHEN** status, automations, state, logs, or HomeKit status are requested from
  an upgraded engine
- **THEN** each returns normally

#### Scenario: Triggering a disabled automation is reported as a refusal

- **WHEN** `triggerAutomation(name)` targets an automation that is disabled
- **THEN** the conflict is reported as a refusal to run, distinguishable from an
  unknown automation

#### Scenario: The event stream is read with an Authorization header

- **WHEN** the client opens the realtime event stream against a token-protected
  engine
- **THEN** the request carries `Authorization: Bearer <token>` and the client
  parses the stream's server-sent events

### Requirement: Command Surface

The CLI MUST provide the commands below against a running engine.

#### `ts-ha automations`

Lists all registered automations on the target engine with their trigger summaries.

Each automation's enabled state is available in the engine's response and MAY be displayed. Attempting to trigger a disabled automation is refused by the engine.

`ts-ha automations history <name>` shows the automation's retained execution
records (start time, trigger, duration, outcome, and error when failed).
`ts-ha automations relationships <name>` shows its declared required services,
related devices, and watched state keys, plus the state keys it has been observed
writing.

#### `ts-ha devices`

Lists every device known to the engine's device sources with its source, display
name, reachability, and current state. `ts-ha devices get <qualifiedId>` shows one
device's full descriptor, including its capability list.

`ts-ha devices command <qualifiedId> <property> <value>` issues a command for a
single writable property. `ts-ha devices hide|unhide <qualifiedId>` toggles the
device's visibility. `ts-ha devices assign <qualifiedId> <roomId>` and
`ts-ha devices unassign <qualifiedId>` manage room membership.

#### `ts-ha rooms`

`ts-ha rooms` lists rooms with their members. `ts-ha rooms get <id>` shows one
room's membership. `ts-ha rooms create <name>`, `ts-ha rooms rename <id> <name>`,
and `ts-ha rooms rm <id>` manage room definitions. `ts-ha rooms command <id>
<property> <value>` issues a batch command to every capable member, reporting each
member's outcome. `ts-ha rooms assign <qualifiedId> <roomId>` and
`ts-ha rooms unassign <qualifiedId>` manage membership.

#### `ts-ha energy`

Shows the home's instantaneous power, cumulative consumption, and per-device
breakdown.

#### `ts-ha weather`

Shows the resolved location's current conditions and daily forecast. When the
engine answers that weather is unconfigured, the command MUST report the feature as
unavailable rather than as an error.

#### `ts-ha walls`

`ts-ha walls` lists profiles; `ts-ha walls get <name>` prints one profile's
configuration; `ts-ha walls create <name> <config>`, `ts-ha walls update <name>
<config>`, and `ts-ha walls rm <name>` manage profiles. Wall administration is
supported; rendering a wall in the terminal is not.

#### `ts-ha state`

Shows all state keys and values. Supports subcommands for get/set/delete on individual keys.

Reserved internal keys are excluded by the engine from both the listing and its
count, and are closed to writes and deletes. The CLI therefore never displays
them, and a set or delete naming one is refused by the engine with a descriptive
error that the CLI MUST surface rather than swallow.

#### `ts-ha logs`

Queries the engine's log buffer. Supports filtering by automation name, log level, and limit.

#### `ts-ha dashboard`

Launches an interactive terminal UI (OpenTUI + React) with tabs:
- **Overview** — Engine status, MQTT connection, uptime, service health
- **Automations** — List with trigger details, manual trigger capability
- **Devices** — Source-neutral device list with inline controls
- **Rooms** — Room membership with batch control
- **State** — Key-value viewer with edit/delete
- **Logs** — Real-time log stream with filtering
- **HomeKit** — Bridge status, accessory count

The dashboard MUST remain usable when any single data source is unavailable: a
failure on one tab MUST NOT prevent navigation to the others, and the dashboard
MUST NOT fail to launch.

The dashboard uses `@opentui/core` and `@opentui/react` for rendering. Components are in `src/cli/components/` and use JSX with OpenTUI intrinsics (`<box>`, `<text>`, `<scrollbox>`) — not HTML.

The dashboard MUST:
- Use `renderer.destroy()` for cleanup (never `process.exit()`)
- Support keyboard navigation via `useKeyboard` hook
- Use a shared Dracula theme from `theme.ts`
- Reflect device and room state changes from the engine's event stream rather than
  only on a timer

#### `ts-ha nanoleaf`

Nanoleaf-specific commands:
- `ts-ha nanoleaf pair <host>` — Pair with a Nanoleaf device (hold power button, POST `/api/v1/new`)

#### `ts-ha config`

Target management subcommands:
- `ts-ha config list` — Show all saved targets
- `ts-ha config add <name> <host> [token]` — Add a new target
- `ts-ha config remove <name>` — Remove a target (cannot remove "local")
- `ts-ha config use <name>` — Set active target
- `ts-ha config path` — Show config file path

#### Scenario: The devices command lists the unified catalog

- **WHEN** `ts-ha devices` is run against an upgraded engine that knows devices
  from more than one source
- **THEN** it lists every device with its source and current state, including
  devices that are not Zigbee

#### Scenario: A device command reaches the engine

- **WHEN** `ts-ha devices command <qualifiedId> <property> <value>` is run for a
  writable property
- **THEN** the engine receives a command carrying that property and value and the
  CLI reports the outcome

#### Scenario: A room batch command reports each member

- **WHEN** `ts-ha rooms command <id> <property> <value>` is run
- **THEN** the CLI reports the per-member outcome (applied, skipped, or failed)

#### Scenario: Weather unconfigured is not an error

- **WHEN** `ts-ha weather` is run against an engine with no weather service
- **THEN** the CLI reports weather as unavailable and does not exit as though the
  request failed

#### Scenario: Reserved keys are absent from the state command

- **WHEN** `ts-ha state` is run on an engine holding room assignments and
  automation enabled flags
- **THEN** none of those keys appears in the output and the reported count
  excludes them

#### Scenario: Writing a reserved key is refused and surfaced

- **WHEN** `ts-ha state set` names a reserved internal key
- **THEN** the engine refuses the write and the CLI reports the error

#### Scenario: The dashboard remains usable

- **WHEN** `ts-ha dashboard` is run against an upgraded engine
- **THEN** it launches and every tab functions, with the Devices tab rendering the
  unified catalog

### Requirement: Device Addressing

CLI commands that address a device MUST address it by its source-qualified
identifier (`qualifiedId`). When a command accepts a device argument that does not
match a known `qualifiedId`, it MUST attempt to resolve it as a case-insensitive
substring of a device's display name, and MUST report the ambiguity or absence
rather than silently choosing a device.

#### Scenario: A device is addressed by qualified id

- **WHEN** a device command names a device's `qualifiedId`
- **THEN** the CLI acts on exactly that device

#### Scenario: A display name resolves to a device

- **WHEN** a device command names a substring matching exactly one device's
  display name and no `qualifiedId`
- **THEN** the CLI acts on that device

#### Scenario: An ambiguous name is refused

- **WHEN** a device command names a substring matching more than one device's
  display name
- **THEN** the CLI lists the candidates and does not act

### Requirement: Terminal Device Control

The dashboard's Devices tab MUST render a control for each writable capability of
the selected device, projected from the capability vocabulary rather than from any
source-specific shape:
- a boolean capability renders a toggle
- a numeric capability renders an adjustable value bounded by its declared range
  and step
- an enum capability renders a cycling or selecting control over its permitted
  values
- a text capability renders an editable value

A read-only capability MUST render a readout and MUST NOT be actuatable. A
boolean toggle MUST read and compose its value through the capability's declared
on/off encoding, so a source reporting a non-boolean encoding is interpreted and
commanded correctly. A control for an unreachable device MUST be presented as
unavailable.

#### Scenario: A boolean capability toggles through its declared encoding

- **WHEN** a device reports a boolean capability whose on/off values are strings
- **THEN** toggling the control commands the device using its declared on and off
  values, and the rendered state reflects the encoded reported value

#### Scenario: A read-only capability is not actuatable

- **WHEN** a capability declares itself read-only
- **THEN** the dashboard presents its value without offering a command

#### Scenario: An unreachable device offers no control

- **WHEN** the selected device is unreachable
- **THEN** its controls are presented as unavailable

### Requirement: Realtime Dashboard Updates

The dashboard MUST keep its displayed data live from the engine's event stream
rather than only on a periodic timer. On start it MUST take an initial snapshot of
every domain it displays, then apply stream events for the domains the stream
carries, and MUST continue to refresh — on a slower interval — the domains the
stream does not carry. When the stream signals that the client fell behind, the
dashboard MUST re-fetch its full snapshot rather than present a state it knows to
be incomplete.

#### Scenario: A streamed change appears without waiting for the timer

- **WHEN** the engine emits a state, log, readiness, automation, device, or room
  change while the dashboard is open
- **THEN** the affected tab reflects the change before the next periodic refresh

#### Scenario: Falling behind triggers a re-snapshot

- **WHEN** the stream signals that the client fell behind
- **THEN** the dashboard re-fetches its full snapshot

#### Scenario: Non-streamed domains still refresh

- **WHEN** HomeKit, energy, or weather data changes while the dashboard is open
- **THEN** it is refreshed on the slower interval

### Requirement: Error Handling

The CLI MUST:
- Report connection failures clearly (host unreachable, auth failed)
- Show HTTP error responses from the engine
- Exit with non-zero code on failures
- Never print stack traces by default

### Requirement: Run Command

The CLI MUST provide the `ts-ha` binary and a `run` command that boots a local
engine in the current process. It is the only first-party way to run an engine;
there is no separate standalone entry point.

The command MUST accept an automations directory, defaulting to `./automations`
relative to the current working directory. The directory MUST be overridable by
an explicit option; a relative option value MUST also resolve against the
current working directory. Because the engine tolerates a missing or unreadable
automations directory by logging and continuing with zero automations, the
command MUST log an explicit warning when the resolved directory does not exist,
so an operator can distinguish an empty configuration from a wrong path.

The command MUST install graceful shutdown handling for the process signals by
which a container or shell terminates it, stopping the engine before exit.

The command MUST decide whether to load `@ts-ha/web-ui` by reading
`WEB_UI_ENABLED` from the environment as a raw string gate before importing it;
the CLI MUST NOT parse that value into web-UI options. When enabled, the command
MUST dynamic-import `@ts-ha/web-ui`, let that package parse `WEB_UI_ENABLED` and
`WEB_UI_PATH` into its options, construct its plugin with those options plus the
core config's resolved `httpServer.token` as the auth token, and register it with
the engine under a service key. When the web UI is disabled, the command MUST NOT
import `@ts-ha/web-ui`.

#### Scenario: Run uses the default automations directory

- **WHEN** `ts-ha run` is executed and no automations directory is given
- **THEN** the engine loads automations from `./automations` relative to the
  working directory

#### Scenario: Run accepts an explicit directory

- **WHEN** `ts-ha run --automations /etc/automations` is executed
- **THEN** the engine loads automations from `/etc/automations`

#### Scenario: A relative directory resolves against the working directory

- **WHEN** `ts-ha run --automations ./auto` is executed from `/srv/app`
- **THEN** the engine loads automations from `/srv/app/auto`

#### Scenario: A missing automations directory is warned about

- **WHEN** `ts-ha run` resolves an automations directory that does not exist
- **THEN** the command logs an explicit warning naming the resolved path, while
  startup still proceeds

#### Scenario: Run shuts down gracefully

- **WHEN** the process receives a termination signal
- **THEN** the engine is stopped before the process exits

#### Scenario: Run mounts the web UI when enabled

- **WHEN** `ts-ha run` starts with `WEB_UI_ENABLED=true`
- **THEN** the web UI plugin is registered and its routes are served

#### Scenario: Run stays headless when disabled

- **WHEN** `ts-ha run` starts with the web UI disabled
- **THEN** `@ts-ha/web-ui` is not imported

#### Scenario: Run gates before importing

- **WHEN** `ts-ha run` starts with the web UI disabled
- **THEN** the CLI evaluates the raw `WEB_UI_ENABLED` string only and no web-UI
  option parsing runs, because the package is never loaded

#### Scenario: Run supplies the auth token

- **WHEN** `ts-ha run` starts with a non-empty `HTTP_TOKEN` and the web UI enabled
- **THEN** the web UI plugin is constructed with that token, so its login route
  and the core `/api/*` middleware agree

### Requirement: Run Requires The Core Package

The `run` command MUST depend on `@ts-ha/core`'s engine factory. The CLI package
therefore has a runtime dependency on `@ts-ha/core`. This is the only CLI command
that runs an engine; all other commands continue to communicate with a running
engine over HTTP.

#### Scenario: Run and remote commands coexist

- **WHEN** the CLI is installed
- **THEN** `run` boots a local engine while commands such as `devices` and `state`
  still address a remote target over HTTP
