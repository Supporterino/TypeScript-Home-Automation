# Configuration

All configuration is driven by environment variables. Use a `.env` file in development (Bun loads it automatically) or set variables directly in your shell / container environment.

An annotated `.env.example` is included in the repository.

---

## Breaking changes for upgrading operators

> **`STATE_PERSIST` and `DEVICE_REGISTRY_PERSIST` now default to `true`.**
> Previously both defaulted to `false`. The state store now holds room
> definitions and automation enabled flags, which must survive a restart, so
> persistence is on by default rather than opt-in (design.md D6, R14). The
> direction of the surprise is benign — an upgraded instance now keeps data it
> previously lost — but it does mean a default deployment writes `state.json`
> and `device-registry.json` to disk where it previously did not.
> **Migration:** set `STATE_PERSIST=false` and/or `DEVICE_REGISTRY_PERSIST=false`
> explicitly if you rely on the old ephemeral-by-default behaviour.

> **`GET /api/devices` and `GET /api/devices/:name` are removed**, not
> repurposed. They return `410 Gone`. Both the CLI dashboard's and the old web
> UI's device views degrade to reporting devices unavailable rather than
> crashing or rendering garbage. **Migration:** use `GET /api/device-catalog`
> and `GET /api/device-catalog/:qualifiedId` instead — they span every device
> source (Zigbee, Shelly, Nanoleaf, and state toggles), not just Zigbee. See
> [API Reference](api-reference.md#httpserver) for the qualified identifier
> format.

> **`stateToggles` moves from `HomekitServiceOptions` to `EngineOptions`.** A
> source consumed by both HomeKit and the web UI cannot be configured inside
> one of them — state toggles would disappear from the web UI whenever
> HomeKit is disabled (design.md D19). Passing `stateToggles` under
> `services.homekit`'s options now throws, naming the new location.
> **Migration:**
> ```diff
>  const engine = createEngine({
>    automationsDir: "./automations",
> +  stateToggles: [{ stateKey: "night_mode", name: "Night Mode" }],
>    services: {
>      homekit: ({ logger, devices }) =>
>        new HomekitService(logger, devices, {
>          pinCode: "031-45-154",
> -        stateToggles: [{ stateKey: "night_mode", name: "Night Mode" }],
>        }),
>    },
>  });
> ```

> **`HomekitServiceContext` is narrower.** The context object passed to a
> `homekit` service factory previously carried `mqtt`, `deviceRegistry`,
> `shelly`, and `state` directly. It now carries `devices` (the engine's
> aggregate device accessor) instead, since `HomekitService` reads every
> device family through the shared device-source layer rather than talking to
> Zigbee2MQTT, MQTT, or Shelly RPC itself (design.md D2, task 6.16b).
> **Migration:**
> ```diff
>  services: {
> -   homekit: ({ http, logger, mqtt, deviceRegistry, shelly }) =>
> -     new HomekitService(mqtt, logger, deviceRegistry, shelly, state, options),
> +   homekit: ({ http, logger, devices }) =>
> +     new HomekitService(logger, devices, options),
>  }
> ```

> **Importing from `packages/core/src/services/homekit-sources/` is no longer
> supported.** The per-family accessory source implementations that used to
> live there (`state-source.ts` and friends) were promoted to source-neutral
> device sources under `packages/core/src/device-sources/` (design.md D2, D19).
> **Migration:** import the aggregate accessor (`Engine.devices`) or the
> individual sources from `packages/core/src/device-sources/` instead; there is no
> drop-in rename, since the module boundary itself changed.

See [Web UI](http/web-ui.md#breaking-changes) for the phase-⑥ frontend
cutover, which is a separate, additive-until-that-point change.

---

## Security note: automation source is readable without authentication

> **`HTTP_TOKEN`** (not `WEB_UI_TOKEN` — there is only one shared secret,
> gating both the `Authorization: Bearer` header and the web UI's session
> cookie) **may be left empty, which is a supported deployment.** When it is
> empty, `GET /api/automations/:name/source` — along with every other
> `/api/*` route — requires no authentication. Automation source routinely
> contains device names, hostnames, notification topics, and API keys. This
> is a deliberate acceptance (design.md D10, R4), not an oversight: the
> source endpoint carries the same trust level as the rest of the dashboard.
> If your automations contain anything you would not want an unauthenticated
> LAN client to read, set `HTTP_TOKEN`.

---

## Core

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | _(unset)_ | Set to `production` to use raw JSON logging; otherwise logs are pretty-printed |
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

State is written through a debounced, coalesced write-behind: mutations
within one `STATE_FLUSH_MS` window are coalesced into a single save shortly
after the last one, rather than writing through on every `set()` (design.md
D6). This trades an explicit bounded loss window on abrupt termination for
avoiding an fsync-backed full-map rewrite on routine sensor traffic.

| Variable | Default | Description |
|---|---|---|
| `STATE_PERSIST` | `true` | Save state (write-behind) and restore on startup. Defaults on because the store holds room definitions and automation enabled flags, which must survive a restart. |
| `STATE_FILE_PATH` | `./state.json` | Path to the state persistence JSON file |
| `STATE_FLUSH_MS` | `1000` | Milliseconds between coalesced saves. `0` saves on every mutation instead of scheduling — raise this on SD-card-backed hosts, lower it on fast storage. |

The reserved internal namespace (`$internal:` prefix — rooms, automation
enabled flags) lives in the same store and is subject to the same
persistence and flush interval, but is hidden from every public read and
rejects every public write. See [State Management](state.md#reserved-internal-namespace).

---

## HTTP server

The HTTP server serves health probes, the debug API, webhook endpoints, and optionally the web UI. Set `HTTP_PORT=0` to disable it entirely (also disables webhooks and the web UI).

| Variable | Default | Description |
|---|---|---|
| `HTTP_PORT` | `8080` | Port for the HTTP server. Set to `0` to disable. |
| `HTTP_TOKEN` | _(empty)_ | Bearer token / session secret for `/api/*` and the web UI. Empty = no authentication — see the security note above. |

---

## Web UI

The web UI is a separate package (`@ts-ha/web-ui`). It — not the core engine —
parses these variables into its plugin options; `ts-ha run` reads
`WEB_UI_ENABLED` only as a raw string gate before importing the package, and
supplies the core config's resolved `HTTP_TOKEN` as the plugin's auth token.
The core config schema contains no web UI section, regardless of these values.

| Variable | Default | Description |
|---|---|---|
| `WEB_UI_ENABLED` | `false` | Enable the browser-based web UI dashboard |
| `WEB_UI_PATH` | `/status` | URL path prefix for the web UI (must start with `/`) |

See [Web UI](http/web-ui.md) for full details.

---

## Device Registry

Automatically discovers all Zigbee2MQTT devices and tracks their live state. Required for `device_state`, `device_joined`, and `device_left` trigger types, as well as the Devices tab in the CLI dashboard and web UI.

| Variable | Default | Description |
|---|---|---|
| `DEVICE_REGISTRY_ENABLED` | `false` | Enable automatic Zigbee2MQTT device discovery and state tracking |
| `DEVICE_REGISTRY_PERSIST` | `true` | Persist the device list, last-known device states, and mapped capability schema to disk on shutdown and restore them on startup. Defaults on, alongside `STATE_PERSIST`, so the device list is available immediately on boot rather than after Zigbee2MQTT republishes. |
| `DEVICE_REGISTRY_FILE_PATH` | `./device-registry.json` | Path to the device registry JSON persistence file |

See [Device Registry](../device-registry.md) for full details including nice names, device triggers, persistence, and the capability vocabulary.

---

## Unified device layer (web UI / HomeKit)

Two device sources in the shared device layer (`Engine.devices`, consumed by
both the web UI and HomeKit) have no push transport and are refreshed on a
timer instead:

| Variable | Default | Description |
|---|---|---|
| `SHELLY_POLL_MS` | `10000` | Refresh interval, in milliseconds, for HTTP-transport Shelly devices. MQTT-transport Shelly devices are push-backed and excluded from this poll. |
| `NANOLEAF_POLL_MS` | `10000` | Refresh interval, in milliseconds, for the Nanoleaf device source (no push transport at all). |

These intervals also govern how long the web UI's optimistic-actuation
revert deadline waits before reverting an unconfirmed command against a
device of that source (design.md D21) — the client reads the descriptor's
own `refreshIntervalMs`, it does not hardcode either constant.

---

## Energy monitoring

The engine samples the aggregate device source on a fixed interval and keeps a
bounded, rolling history of the home's instantaneous power so the dashboard can
render a recent trend. History is held in memory only and does **not** survive a
restart (design.md D6/D7).

| Variable | Default | Description |
|---|---|---|
| `ENERGY_SAMPLE_MS` | `60000` | Interval, in milliseconds, between power-history samples. Must be a positive integer; `0` is normalized to the default so history can never be sampled at a zero interval. |
| `ENERGY_HISTORY_MINUTES` | `1440` | Rolling history window, in minutes. The retained sample count is bounded by `historyMinutes / sampleIntervalMs`. `0` disables history while current totals remain available. |

---

## Weather

`GET /api/weather` returns the registered weather service's current conditions
and forecast. Because the service takes a location per call, the engine uses a
configured default location when a client supplies none, and a client may
override it per request (design.md D8).

| Variable | Default | Description |
|---|---|---|
| `WEATHER_LATITUDE` | _(unset)_ | Default latitude, `-90`..`90`. Must be set together with `WEATHER_LONGITUDE` for a default location to be configured. |
| `WEATHER_LONGITUDE` | _(unset)_ | Default longitude, `-180`..`180`. Must be set together with `WEATHER_LATITUDE`. |
| `WEATHER_FORECAST_DAYS` | `3` | Requested forecast horizon in days, clamped to a maximum of `7`. |

Out-of-range coordinates fail startup validation with a descriptive error. When
neither a configured default nor a client-supplied location is available, the
endpoint rejects the request as a client error.

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
STATE_FLUSH_MS=1000

HTTP_PORT=8080
HTTP_TOKEN=my-secret-token

WEB_UI_ENABLED=true
WEB_UI_PATH=/status

DEVICE_REGISTRY_ENABLED=true
DEVICE_REGISTRY_PERSIST=true
DEVICE_REGISTRY_FILE_PATH=./data/device-registry.json

SHELLY_POLL_MS=10000
NANOLEAF_POLL_MS=10000

ENERGY_SAMPLE_MS=60000
ENERGY_HISTORY_MINUTES=1440

WEATHER_LATITUDE=52.52
WEATHER_LONGITUDE=13.405
WEATHER_FORECAST_DAYS=3
```
