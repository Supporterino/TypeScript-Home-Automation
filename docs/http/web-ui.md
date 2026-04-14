# Web UI

The engine includes an optional browser-based dashboard served on the same port as the HTTP server. It provides a real-time view of the engine state, automations, logs, and state store — with full read-write capabilities.

---

## Enabling

```bash
WEB_UI_ENABLED=true
WEB_UI_PATH=/status   # optional, this is the default
```

Navigate to `http://your-host:8080/status`.

The web UI is disabled by default and adds zero overhead when disabled — the module is imported lazily at startup.

---

## Features

The dashboard auto-refreshes every 5 seconds and has four tabs:

### Overview

- Engine and MQTT status badges (ready / not ready)
- Uptime counter, timezone, automation count, state key count
- Last 10 log lines

### Automations

- Table of all registered automations with trigger-type badges
- Click any row to expand the full trigger definition (JSON)
- **Trigger** button — opens a modal to fire any automation manually with a custom JSON context payload

### State

- Table of all state keys and values
- Click any value to edit it inline (Enter to save, Esc to cancel)
- **New Key** button
- Per-row **Delete** button

### Logs

- Full scrollable log list (last 150 entries)
- Client-side filters: log level, automation name, free text
- Click any log row to expand extra JSON fields (topic, device, err, etc.)
- **Pause / Resume** toggle to freeze auto-refresh while reading

---

## Authentication

When `HTTP_TOKEN` is set the web UI requires authentication. On first visit the browser redirects to `/status/login`:

1. Enter the same token as `HTTP_TOKEN`
2. A session cookie (`ts-ha-session`, `HttpOnly`, `SameSite=Strict`) is set for the duration of the browser session
3. Navigate to `/status/logout` to clear the session

API calls made by the page send `Authorization: Bearer <token>` — the page also works from a reverse proxy that injects the header.

When `HTTP_TOKEN` is empty the dashboard is publicly accessible with no login.

---

## Color scheme

The dashboard follows the browser/OS light or dark mode preference automatically via `prefers-color-scheme`. A toggle button in the sidebar switches between light and dark manually; the choice is persisted in `localStorage`.

---

## Web UI API

The page is backed by a Hono sub-app that exposes its own `/api` group. All endpoints return JSON and require the bearer token when `HTTP_TOKEN` is set.

| Method | Path | Description |
|---|---|---|
| `GET` | `/status/api/status` | Engine + MQTT readiness and uptime |
| `GET` | `/status/api/automations` | List all automations |
| `GET` | `/status/api/automations/:name` | Get a single automation |
| `POST` | `/status/api/automations/:name/trigger` | Manually trigger an automation |
| `GET` | `/status/api/state` | List all state keys and values |
| `GET` | `/status/api/state/:key` | Get a single state value |
| `PUT` | `/status/api/state/:key` | Set a state value (JSON body) |
| `DELETE` | `/status/api/state/:key` | Delete a state key |
| `GET` | `/status/api/logs` | Query logs (`?level=&automation=&limit=`) |

### Trigger request body

```json
{
  "type": "mqtt",
  "topic": "manual/test",
  "payload": { "occupancy": true }
}
```

Supported types: `"mqtt"`, `"cron"`, `"state"`, `"webhook"`.

---

## Implementation notes

- Served by a [Hono](https://hono.dev/) sub-app mounted inside the existing `Bun.serve()` instance — no extra port or process
- The entire frontend (React + Mantine) is compiled by `Bun.build` and inlined into the HTML response — no external network requests required to load the page
- Works in air-gapped environments
