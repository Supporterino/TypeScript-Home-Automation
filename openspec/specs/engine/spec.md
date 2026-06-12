# Engine

## Purpose

The Engine is the top-level orchestrator that wires together all services, loads automations, and manages the start/stop lifecycle of the home automation system. It is created via the `createEngine()` factory function — there is no `Engine` class.

## Requirements

### Engine Creation

The system MUST provide a `createEngine(options: EngineOptions): Engine` factory function.

`EngineOptions` fields:

| Field | Required | Description |
|-------|----------|-------------|
| `automationsDir` | **Yes** | Path to directory containing automation `.ts`/`.js` files |
| `recursive` | No | Whether to scan subdirectories recursively (default: `false`) |
| `config` | No | Partial override of environment-derived `Config` |
| `logger` | No | Pre-configured pino `Logger` instance |
| `state` | No | `StateManagerOptions` (persist/filePath) |
| `deviceRegistry` | No | Options including `names` (DeviceNiceNames), `persist`, `filePath` |
| `services` | No | Map of service key → instance or `ServiceFactory` function |

The returned `Engine` object MUST expose:

```ts
interface Engine {
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly config: Config;
  readonly logger: Logger;
  readonly mqtt: MqttService;
  readonly http: HttpClient;
  readonly state: StateManager;
  readonly notifications: NotificationService | null;
  readonly services: ServiceRegistry;
  readonly manager: AutomationManager;
  readonly deviceRegistry: DeviceRegistry | null;
}
```

### Startup Sequence (start())

The system MUST execute startup in this order:

1. Warn if `HTTP_TOKEN` is empty (unauthenticated API)
2. Set manager/log-buffer/device-registry references on `HttpServer`
3. Mount service plugin routes on the HTTP server
4. Mount Web UI if `WEB_UI_ENABLED=true`
5. Start HTTP server listening
6. Load persisted state from disk
7. Load persisted device registry from disk
8. Call `onStart()` on all registered `ServicePlugin` instances
9. Connect to MQTT broker
10. Start device registry (subscribe to bridge topics)
11. Discover and register automations from `automationsDir`
12. Mark engine as started on HTTP server

The system MUST roll back (best-effort cleanup) on any startup failure and re-throw the error.

### Shutdown Sequence (stop())

The system MUST execute shutdown in this order:

1. Unmark engine as started on HTTP server
2. Call `onStop()` on all automations (in reverse registration order)
3. Stop all cron jobs
4. Call `onStop()` on all `ServicePlugin` instances
5. Save device registry to disk (if persist enabled)
6. Stop device registry
7. Save state to disk (if persist enabled)
8. Disconnect MQTT
9. Stop HTTP server

The system MUST be idempotent — calling `stop()` when not started is a no-op.

### Service Resolution

The system MUST support three service registration patterns:

1. **Direct instance**: `services: { shelly: myShellyInstance }`
2. **Factory function**: `services: { shelly: (http, logger) => new ShellyService(http, logger) }`
3. **HomeKit-specific factory**: `services: { homekit: (http, logger, mqtt, deviceRegistry) => new HomekitService(...) }`

Factory functions receive the engine's shared `HttpClient` and a child `Logger`. HomeKit's factory additionally receives `MqttService` and `DeviceRegistry | null`.

### Custom Services

The system MUST accept arbitrary service keys beyond the well-known set (`notifications`, `weather`, `shelly`, `nanoleaf`, `homekit`, `metrics`). Custom keys are resolved identically (instance or factory) and registered in the `ServiceRegistry`.

### Configuration Merging

The system MUST merge `options.config` on top of environment-derived config, with deep merge for `options.config.mqtt`.

### Logger Creation

The system MUST create a default logger when no `options.logger` is provided:
- Production (`NODE_ENV=production`): raw JSON to stdout
- Development: pretty-printed via `pino-pretty`
- Both: multistream to stdout + `LogBuffer` (2500 entries)
