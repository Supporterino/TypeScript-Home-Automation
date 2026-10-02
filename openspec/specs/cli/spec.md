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

### Requirement: Remote Communication

The CLI MUST communicate with engine instances via HTTP to the configured target's host/port. All API requests include `Authorization: Bearer <token>` when a token is configured.

The `DebugClient` MUST provide methods matching the engine's API:
- `getStatus()` → `GET /api/status`
- `getAutomations()` / `getAutomation(name)` / `triggerAutomation(name, body)` → `/api/automations/*`
- `getState()` / `getStateKey(key)` / `setState(key, value)` / `deleteState(key)` → `/api/state/*`
- `getLogs(query)` → `GET /api/logs`
- `getHomekitStatus()` → `GET /api/homekit/status`

`getDevices()` and `getDevice(name)` address `GET /api/devices` and
`GET /api/devices/:name`, which no longer exist on an upgraded engine. Both
methods are retained and MUST continue to fail in the manner the CLI already
handles — an error response carrying no device payload — rather than being
removed, changed to the unified paths, or made to return an empty inventory.

Realigning the CLI with the unified, source-scoped device API is deliberately out
of scope for this change and is left to a follow-up, so that this change stays
scoped to the engine and the web UI. This requirement records the resulting
degradation rather than concealing it: against an upgraded engine these two
methods do not work, and the specification says so until the follow-up restores
them.

Every other `DebugClient` method is unaffected.

`triggerAutomation(name, body)` MUST additionally tolerate a conflict response,
which an upgraded engine returns when the named automation is disabled. This is a
refusal to run, distinct from an unknown automation's not-found, and MUST be
reported as such rather than as a transport failure.

#### Scenario: Device lookups fail against an upgraded engine

- **WHEN** `getDevices()` or `getDevice(name)` is called against an engine that
  has removed the Zigbee-only device endpoints
- **THEN** the call fails with an error response carrying no device payload, and
  the CLI's existing failed-fetch handling applies

#### Scenario: Other client methods are unaffected

- **WHEN** status, automations, state, logs, or HomeKit status are requested from
  an upgraded engine
- **THEN** each returns normally

#### Scenario: Triggering a disabled automation is reported as a refusal

- **WHEN** `triggerAutomation(name)` targets an automation that is disabled
- **THEN** the conflict is reported as a refusal to run, distinguishable from an
  unknown automation

### Requirement: Commands

The CLI MUST provide the commands below. Against an upgraded engine, every
command except `ts-ha devices` and the dashboard's Devices tab MUST continue to
function unchanged; those two MUST degrade explicitly rather than crash or
misrender, because the endpoints they read have been removed and realigning them
is a follow-up change.

#### `ts-ha automations`

Lists all registered automations on the target engine with their trigger summaries.

Each automation's enabled state is available in the engine's response and MAY be
displayed. Attempting to trigger a disabled automation is refused by the engine.

#### `ts-ha devices`

Lists all tracked Zigbee devices with their friendly names, nice names, types, and current states.

Against an upgraded engine this command MUST report that devices are unavailable
and exit non-zero, because the endpoint it reads has been removed. It MUST NOT
crash, print an empty list as though the engine had no devices, or render rows
with absent names. The command continues to exist and continues to work against
an engine predating this change; restoring it against the unified device API is a
follow-up change.

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
- **Devices** — Device list with states, filtering
- **State** — Key-value viewer with edit/delete
- **Logs** — Real-time log stream with filtering
- **HomeKit** — Bridge status, accessory count

Against an upgraded engine the Devices tab MUST report devices as unavailable and
the remaining tabs MUST continue to function. The dashboard already tolerates a
failed device fetch; that tolerance becomes the specified behaviour rather than an
incidental one. The dashboard MUST NOT fail to launch, and a failure on the
Devices tab MUST NOT prevent navigation to the others.

The dashboard uses `@opentui/core` and `@opentui/react` for rendering. Components are in `src/cli/components/` and use JSX with OpenTUI intrinsics (`<box>`, `<text>`, `<scrollbox>`) — not HTML.

The dashboard MUST:
- Use `renderer.destroy()` for cleanup (never `process.exit()`)
- Support keyboard navigation via `useKeyboard` hook
- Use a shared Dracula theme from `theme.ts`

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

#### Scenario: The devices command degrades explicitly

- **WHEN** `ts-ha devices` is run against an upgraded engine
- **THEN** it reports devices unavailable and exits non-zero, printing neither an
  empty list nor nameless rows

#### Scenario: The dashboard remains usable

- **WHEN** `ts-ha dashboard` is run against an upgraded engine
- **THEN** it launches, the Devices tab reports devices unavailable, and the
  Overview, Automations, State, Logs, and HomeKit tabs function normally

#### Scenario: Reserved keys are absent from the state command

- **WHEN** `ts-ha state` is run on an engine holding room assignments and
  automation enabled flags
- **THEN** none of those keys appears in the output and the reported count
  excludes them

#### Scenario: Writing a reserved key is refused and surfaced

- **WHEN** `ts-ha state set` names a reserved internal key
- **THEN** the engine refuses the write and the CLI reports the error

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
