# Configuration

All configuration is driven by environment variables. Use a `.env` file in development (Bun loads it automatically) or set variables directly in your shell / container environment.

An annotated `.env.example` is included in the repository.

---

## Core

| Variable | Default | Description |
|---|---|---|
| `TZ` | system default | Timezone for cron schedules, e.g. `Europe/Berlin` |
| `LOG_LEVEL` | `info` | Minimum log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal` |

---

## MQTT

| Variable | Default | Description |
|---|---|---|
| `MQTT_HOST` | `localhost` | Hostname or IP of the MQTT broker |
| `MQTT_PORT` | `1883` | MQTT broker port |
| `ZIGBEE2MQTT_PREFIX` | `zigbee2mqtt` | Topic prefix used by Zigbee2MQTT |

---

## Automations

| Variable | Default | Description |
|---|---|---|
| `AUTOMATIONS_RECURSIVE` | `false` | Scan subdirectories of `automationsDir` recursively |

---

## State persistence

| Variable | Default | Description |
|---|---|---|
| `STATE_PERSIST` | `false` | Save state to disk on shutdown and restore on startup |
| `STATE_FILE_PATH` | `./state.json` | Path to the state persistence JSON file |

---

## HTTP server

The HTTP server serves health probes, the debug API, webhook endpoints, and optionally the web UI. Set `HTTP_PORT=0` to disable it entirely (also disables webhooks and the web UI).

| Variable | Default | Description |
|---|---|---|
| `HTTP_PORT` | `8080` | Port for the HTTP server. Set to `0` to disable. |
| `HTTP_TOKEN` | _(empty)_ | Bearer token for debug/webhook endpoints. Empty = no authentication. |

---

## Web UI

| Variable | Default | Description |
|---|---|---|
| `WEB_UI_ENABLED` | `false` | Enable the browser-based web UI dashboard |
| `WEB_UI_PATH` | `/status` | URL path prefix for the web UI |

See [Web UI](http/web-ui.md) for full details.

---

## Example `.env`

```bash
TZ=Europe/Berlin
LOG_LEVEL=info

MQTT_HOST=192.168.1.10
MQTT_PORT=1883
ZIGBEE2MQTT_PREFIX=zigbee2mqtt

STATE_PERSIST=true
STATE_FILE_PATH=./data/state.json

HTTP_PORT=8080
HTTP_TOKEN=my-secret-token

WEB_UI_ENABLED=true
WEB_UI_PATH=/status
```
