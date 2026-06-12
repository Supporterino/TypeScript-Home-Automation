# CLI Tool

## Purpose

A command-line tool (`ts-ha`) for managing running engine instances. Provides commands for querying automations, devices, state, and logs; interactive terminal dashboard; Nanoleaf device pairing; and multi-target configuration management.

## Requirements

### Target Configuration

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

### Remote Communication

The CLI MUST communicate with engine instances via HTTP to the configured target's host/port. All API requests include `Authorization: Bearer <token>` when a token is configured.

The `DebugClient` MUST provide methods matching the engine's API:
- `getStatus()` → `GET /api/status`
- `getAutomations()` / `getAutomation(name)` / `triggerAutomation(name, body)` → `/api/automations/*`
- `getState()` / `getStateKey(key)` / `setState(key, value)` / `deleteState(key)` → `/api/state/*`
- `getLogs(query)` → `GET /api/logs`
- `getDevices()` / `getDevice(name)` → `GET /api/devices/*`
- `getHomekitStatus()` → `GET /api/homekit/status`

### Commands

#### `ts-ha automations`

Lists all registered automations on the target engine with their trigger summaries.

#### `ts-ha devices`

Lists all tracked Zigbee devices with their friendly names, nice names, types, and current states.

#### `ts-ha state`

Shows all state keys and values. Supports subcommands for get/set/delete on individual keys.

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

### Error Handling

The CLI MUST:
- Report connection failures clearly (host unreachable, auth failed)
- Show HTTP error responses from the engine
- Exit with non-zero code on failures
- Never print stack traces by default
