# Changelog

## Current

Initial public release of the `ts-home-automation` package. All features below are available in the current npm version.

### Core engine

- `createEngine()` factory with configurable automations directory, optional logger, and service overrides
- `Automation` abstract base class with `_inject()` for service injection, `onStart()` / `onStop()` lifecycle hooks
- `AutomationManager` — file-based auto-discovery, registration, and lifecycle management
- `StateManager` — typed in-memory key/value store with optional JSON persistence
- `MqttService` — MQTT client with wildcard topic routing
- `CronScheduler` — cron-based trigger scheduling with timezone support
- `LogBuffer` — circular ring buffer (2500 entries) integrated via pino multistream

### Trigger types

- `mqtt` — MQTT topic subscriptions with optional payload filter
- `cron` — Cron expression scheduling
- `state` — React to state key changes with optional value filter
- `webhook` — HTTP webhook triggers with method filtering

### Services

- `ShellyService` — Shelly Gen 2 switch and cover control over local HTTP RPC (no cloud)
- `NanoleafService` — Nanoleaf light panel control over local HTTP API
- `OpenMeteoService` — Free weather data, no API key required
- `OpenWeatherMapService` — OpenWeatherMap integration
- `NtfyNotificationService` — Push notifications via ntfy.sh (self-hostable)

### Device base classes

- `AqaraH1Automation` — 12-handler dispatcher for the Aqara H1 double-rocker switch
- `IkeaStyrbarAutomation` — 11-handler dispatcher for IKEA STYRBAR remote
- `IkeaRodretAutomation` — 5-handler dispatcher for IKEA RODRET dimmer

### HTTP server

- `/healthz` — liveness probe
- `/readyz` — readiness probe (MQTT + engine checks)
- `/webhook/*` — webhook endpoint with optional bearer auth
- `/debug/*` — debug API (automations, state, logs, trigger)
- Web status page — React + Mantine browser dashboard served by Hono (optional, `STATUS_PAGE_ENABLED=true`)

### CLI (`ts-ha`)

- `automations list / get / trigger`
- `state list / get / set / delete`
- `logs` with follow mode (`-f`), level filter, automation filter
- `config add / use / remove / list` — saved target management
- `dashboard` — interactive OpenTUI terminal dashboard with Overview, Automations, State, Logs tabs
- `nanoleaf pair` — Nanoleaf device pairing

### Device types

Typed payloads for Philips Hue, IKEA, and Aqara devices — see [Device Types](device-types.md) for the full list.

---

Future releases will be documented here with their version numbers.
