# API Reference

Complete reference for all public exports from the `ts-home-automation` package. Organised by module.

```ts
import { createEngine, Automation, type Trigger, type TriggerContext } from "ts-home-automation";
```

---

## Engine

### `createEngine(options)`

Factory function that wires all core services together and returns an `Engine` object.

```ts
function createEngine(options: EngineOptions): Engine
```

#### `EngineOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `automationsDir` | `string` | required | Path to directory containing automation files |
| `recursive` | `boolean` | `false` | Scan subdirectories for automations |
| `config` | `Partial<Config>` | _(from env)_ | Override environment-derived configuration |
| `logger` | `Logger` | _(auto)_ | Provide a custom pino logger |
| `state` | `StateManagerOptions` | _(from env)_ | State persistence options |
| `deviceRegistry` | `object` | _(from env)_ | Device registry options (see below) |
| `services` | `object` | `{}` | Optional service instances or factories |

`deviceRegistry` sub-options:

| Field | Type | Description |
|---|---|---|
| `names` | `DeviceNiceNames` | Nice-name mapping (see [Device Registry](device-registry.md)) |
| `persist` | `boolean` | Persist device list and state to disk |
| `filePath` | `string` | Path for the persistence file |

`services` sub-options:

| Field | Type | Description |
|---|---|---|
| `notifications` | `NotificationService \| ServiceFactory<NotificationService>` | Push notification service |
| `weather` | `WeatherService \| ServiceFactory<WeatherService>` | Weather data service |
| `shelly` | `ShellyService \| ServiceFactory<ShellyService>` | Shelly device service |
| `nanoleaf` | `NanoleafService \| ServiceFactory<NanoleafService>` | Nanoleaf panel service |
| `homekit` | `HomekitServiceFactory` | HomeKit bridge factory |
| `[key: string]` | `unknown` | Any custom service |

#### `ServiceFactory<T>`

```ts
type ServiceFactory<T> = (http: HttpClient, logger: Logger) => T;
```

A factory function that receives the engine's shared HTTP client and a scoped logger, and returns a service instance.

#### `HomekitServiceFactory`

```ts
type HomekitServiceFactory = (
  http: HttpClient,
  logger: Logger,
  mqtt: MqttService,
  deviceRegistry: DeviceRegistry | null,
) => HomekitService;
```

Extended factory for the HomeKit bridge that also receives the MQTT service and device registry.

#### `Engine`

The object returned by `createEngine()`.

| Property / Method | Type | Description |
|---|---|---|
| `start()` | `Promise<void>` | Connect MQTT, discover automations, start HTTP server and services |
| `stop()` | `Promise<void>` | Gracefully stop all automations, services, MQTT, and HTTP |
| `config` | `Config` (readonly) | Resolved configuration |
| `logger` | `Logger` (readonly) | Root pino logger |
| `mqtt` | `MqttService` (readonly) | MQTT client |
| `http` | `HttpClient` (readonly) | Shared HTTP client |
| `state` | `StateManager` (readonly) | State store |
| `notifications` | `NotificationService \| null` (readonly) | Notification service (shortcut for `services.get("notifications")`) |
| `services` | `ServiceRegistry` (readonly) | All registered services |
| `manager` | `AutomationManager` (readonly) | Automation lifecycle manager |
| `deviceRegistry` | `DeviceRegistry \| null` (readonly) | Zigbee device registry (`null` when disabled) |

**Example:**

```ts
import { createEngine } from "ts-home-automation";

const engine = createEngine({
  automationsDir: new URL("./automations", import.meta.url).pathname,
  config: { mqtt: { host: "192.168.1.10" } },
  state: { persist: true },
});

process.on("SIGINT", () => engine.stop().then(() => process.exit(0)));
await engine.start();
```

---

## Automation

### `abstract class Automation`

Base class for all automations. Subclasses must implement `name`, `triggers`, and `execute()`.

```ts
import { Automation, type Trigger, type TriggerContext } from "ts-home-automation";

export default class MyAutomation extends Automation {
  readonly name = "my-automation";
  readonly triggers: Trigger[] = [/* ... */];
  async execute(context: TriggerContext): Promise<void> { /* ... */ }
}
```

#### Abstract members

| Member | Type | Description |
|---|---|---|
| `name` | `readonly string` | Unique automation identifier (kebab-case) |
| `triggers` | `readonly Trigger[]` | Array of trigger definitions |
| `execute(context)` | `(context: TriggerContext) => Promise<void>` | Main logic — called when any trigger fires |

#### Optional members

| Member | Type | Description |
|---|---|---|
| `requiredServices` | `readonly string[]` | Service keys that must be present at startup |

#### Protected fields (injected by the framework)

| Field | Type | Description |
|---|---|---|
| `mqtt` | `MqttService` | MQTT client |
| `http` | `HttpClient` | HTTP client |
| `state` | `StateManager` | State store |
| `logger` | `Logger` | Child logger scoped to this automation |
| `config` | `Config` | Application configuration |

#### Protected methods

| Method | Signature | Description |
|---|---|---|
| `notify` | `(options: NotificationOptions) => Promise<void>` | Send a push notification; no-ops with a warning if no service is configured |
| `require<T>` | `(key: string) => T` | Non-null service retrieval from the registry; throws if absent |
| `services` | `ServiceRegistry` (getter) | Access the full service registry |
| `deviceRegistry` | `DeviceRegistry \| null` (getter) | Access the device registry |

#### Lifecycle hooks

Override these for setup and teardown. Both have empty default implementations.

| Hook | When called |
|---|---|
| `onStart(): Promise<void>` | After the automation is registered and all triggers are wired |
| `onStop(): Promise<void>` | Before the automation is unregistered on shutdown |

---

### `Trigger`

A discriminated union defining when an automation fires. Seven types are supported:

#### MQTT trigger

```ts
{ type: "mqtt"; topic: string; filter?: (payload: Record<string, unknown>) => boolean }
```

| Field | Type | Description |
|---|---|---|
| `topic` | `string` | MQTT topic (supports `+` and `#` wildcards) |
| `filter` | `function` | Optional — only fire when this returns `true` |

#### Cron trigger

```ts
{ type: "cron"; expression: string }
```

| Field | Type | Description |
|---|---|---|
| `expression` | `string` | Standard cron expression (5 or 6 fields). Timezone from `TZ` env var. |

#### State trigger

```ts
{ type: "state"; key: string; filter?: (newValue: unknown, oldValue: unknown) => boolean }
```

| Field | Type | Description |
|---|---|---|
| `key` | `string` | State key to watch |
| `filter` | `function` | Optional — both new and old values are available |

#### Webhook trigger

```ts
{ type: "webhook"; path: string; methods?: ("GET" | "POST" | "PUT" | "DELETE")[] }
```

| Field | Type | Description |
|---|---|---|
| `path` | `string` | Path segment — accessible at `/webhook/<path>` |
| `methods` | `string[]` | Allowed HTTP methods (default: `["POST"]`) |

#### Device state trigger

```ts
{ type: "device_state"; friendlyName: string; filter?: (state: Record<string, unknown>, device: ZigbeeDevice) => boolean }
```

Requires `DEVICE_REGISTRY_ENABLED=true`.

#### Device joined trigger

```ts
{ type: "device_joined"; friendlyName?: string }
```

Requires `DEVICE_REGISTRY_ENABLED=true`. Omit `friendlyName` to fire for any device.

#### Device left trigger

```ts
{ type: "device_left"; friendlyName?: string }
```

Requires `DEVICE_REGISTRY_ENABLED=true`. Omit `friendlyName` to fire for any device.

---

### `TriggerContext`

A discriminated union matching each trigger type. Use `context.type` to narrow:

| `context.type` | Fields |
|---|---|
| `"mqtt"` | `topic: string`, `payload: Record<string, unknown>` |
| `"cron"` | `expression: string`, `firedAt: Date` |
| `"state"` | `key: string`, `newValue: unknown`, `oldValue: unknown` |
| `"webhook"` | `path: string`, `method: string`, `headers: Record<string, string>`, `query: Record<string, string>`, `body: unknown` |
| `"device_state"` | `friendlyName: string`, `state: Record<string, unknown>`, `device: ZigbeeDevice` |
| `"device_joined"` | `device: ZigbeeDevice` |
| `"device_left"` | `device: ZigbeeDevice` |

---

## AutomationManager

Manages discovery, registration, and lifecycle of automations. Available as `engine.manager`.

| Method | Signature | Description |
|---|---|---|
| `discoverAndRegister` | `(automationsDir: string, recursive?: boolean) => Promise<void>` | Scan directory for automation files, instantiate, and register each |
| `register` | `(automation: Automation) => Promise<void>` | Register a single automation instance |
| `stopAll` | `() => Promise<void>` | Unregister all automations and clean up triggers |
| `listAutomations` | `() => { name: string; triggers: object[] }[]` | Serialised list of all automations |
| `getAutomation` | `(name: string) => object \| null` | Look up a single automation by name |
| `triggerAutomation` | `(name: string, context: TriggerContext) => Promise<boolean>` | Manually trigger an automation; returns `false` if not found |

---

## MqttService

Manages the MQTT connection and multiplexes subscriptions across automations.

```ts
import type { MqttService, MqttMessageHandler } from "ts-home-automation";
```

### `MqttMessageHandler`

```ts
type MqttMessageHandler = (topic: string, payload: Record<string, unknown>) => void | Promise<void>;
```

### Properties

| Property | Type | Description |
|---|---|---|
| `isConnected` | `boolean` (getter) | Whether the MQTT client is currently connected |

### Methods

| Method | Signature | Description |
|---|---|---|
| `connect` | `() => Promise<void>` | Connect to the broker; resolves on first successful connection |
| `subscribe` | `(topic: string, handler: MqttMessageHandler) => void` | Subscribe to a topic. Supports `+` and `#` wildcards. |
| `unsubscribe` | `(topic: string, handler: MqttMessageHandler) => void` | Remove a handler. Unsubscribes from broker when last handler for a topic is removed. |
| `publish` | `(topic: string, payload: Record<string, unknown>) => void` | Publish JSON payload to any topic |
| `publishToDevice` | `(friendlyName: string, payload: Record<string, unknown>) => void` | Publish to `{prefix}/{friendlyName}/set` |
| `deviceTopic` | `(friendlyName: string) => string` | Returns `{prefix}/{friendlyName}` |
| `disconnect` | `() => Promise<void>` | Disconnect from the broker |

**Subscription dispatch internals:**

- Exact-match topics use `Map` lookup (O(1))
- Wildcard topics use pre-split pattern matching (linear scan)
- JSON payload is parsed lazily — only when at least one handler matches
- Each handler is called independently; errors in one handler do not affect others

---

## HttpClient

General-purpose HTTP client with structured logging, timeouts, and retry support.

```ts
import type { HttpClient, HttpRequestOptions, HttpResponse } from "ts-home-automation";
```

### `HttpRequestOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `method` | `"GET" \| "POST" \| "PUT" \| "PATCH" \| "DELETE"` | `"GET"` | HTTP method |
| `headers` | `Record<string, string>` | `{}` | Request headers |
| `body` | `unknown` | _(none)_ | Request body (auto-serialised to JSON) |
| `timeout` | `number` | `30000` | Timeout in milliseconds |
| `retries` | `number` | `0` | Retry count on network errors or 5xx responses |

### `HttpResponse<T>`

| Field | Type | Description |
|---|---|---|
| `status` | `number` | HTTP status code |
| `ok` | `boolean` | `true` when status is 2xx |
| `headers` | `Headers` | Response headers |
| `data` | `T` | Parsed response body (JSON or text) |

### Methods

| Method | Signature | Description |
|---|---|---|
| `request<T>` | `(url: string, options?: HttpRequestOptions) => Promise<HttpResponse<T>>` | Core request method |
| `get<T>` | `(url: string, headers?) => Promise<HttpResponse<T>>` | Convenience GET |
| `post<T>` | `(url: string, body?, headers?) => Promise<HttpResponse<T>>` | Convenience POST |
| `put<T>` | `(url: string, body?, headers?) => Promise<HttpResponse<T>>` | Convenience PUT |
| `patch<T>` | `(url: string, body?, headers?) => Promise<HttpResponse<T>>` | Convenience PATCH |
| `del<T>` | `(url: string, headers?) => Promise<HttpResponse<T>>` | Convenience DELETE |

**Retry behaviour:** On network errors or 5xx responses, retries use exponential backoff starting at 500ms, doubling each attempt, capped at 10s. 4xx responses are never retried.

**URL sanitisation:** Sensitive query parameters (`appid`, `apikey`, `api_key`, `token`, `key`, `secret`) are masked with `***` in log output.

---

## HttpServer

HTTP server for health probes, webhooks, debug API, and web UI.

### `WebhookHandler`

```ts
type WebhookHandler = (context: {
  method: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
}) => Promise<void>;
```

### Route structure

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/healthz` | No | Liveness probe — always returns `{ status: "ok" }` |
| `GET` | `/readyz` | No | Readiness probe — checks MQTT and engine status |
| `ALL` | `/webhook/*` | No | Dispatches to registered webhook handlers |
| `GET` | `/api/status` | Yes | Engine + MQTT readiness |
| `GET` | `/api/automations` | Yes | List all automations |
| `GET` | `/api/automations/:name` | Yes | Single automation details |
| `POST` | `/api/automations/:name/trigger` | Yes | Manually trigger an automation |
| `GET` | `/api/state` | Yes | All state keys and values |
| `GET` | `/api/state/:key` | Yes | Single state value |
| `PUT` | `/api/state/:key` | Yes | Set a state value |
| `DELETE` | `/api/state/:key` | Yes | Delete a state key |
| `GET` | `/api/logs` | Yes | Query log buffer (`?automation=&level=&limit=`) |
| `GET` | `/api/devices` | Yes | List all tracked Zigbee devices |
| `GET` | `/api/devices/:friendlyName` | Yes | Single device with merged state |

Authentication uses `Authorization: Bearer <token>` header or a session cookie. Set `HTTP_TOKEN` to enable; leave empty for no authentication.

---

## StateManager

In-memory key-value store with typed access, change listeners, and optional file persistence.

```ts
import type { StateManager, StateManagerOptions, StateChangeHandler } from "ts-home-automation";
```

### `StateManagerOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `persist` | `boolean` | `false` | Save state to disk on shutdown, restore on startup |
| `filePath` | `string` | `"./state.json"` | Path to the persistence file |

### `StateChangeHandler<T>`

```ts
type StateChangeHandler<T> = (key: string, newValue: T | undefined, oldValue: T | undefined) => void;
```

### Methods

| Method | Signature | Description |
|---|---|---|
| `get<T>` | `(key: string, defaultValue?: T) => T \| undefined` | Read a value with optional default |
| `set<T>` | `(key: string, value: T) => void` | Write a value; fires listeners only if the value changed |
| `delete` | `(key: string) => boolean` | Remove a key; fires listeners with `newValue = undefined` |
| `has` | `(key: string) => boolean` | Check if a key exists |
| `keys` | `() => string[]` | Get all keys |
| `onChange<T>` | `(key: string, handler: StateChangeHandler<T>) => void` | Subscribe to a specific key |
| `offChange<T>` | `(key: string, handler: StateChangeHandler<T>) => void` | Unsubscribe from a key |
| `onAnyChange` | `(handler: StateChangeHandler) => void` | Subscribe to all key changes |
| `offAnyChange` | `(handler: StateChangeHandler) => void` | Unsubscribe from global listener |
| `load` | `() => Promise<void>` | Load state from disk (called by engine on startup) |
| `save` | `() => Promise<void>` | Save state to disk (called by engine on shutdown) |

**Equality check:** `set()` compares the new value against the current value before firing listeners. Primitives use strict equality (`===`); objects use `JSON.stringify` comparison. If values are equal, no listeners fire.

**Listener warning:** A warning is logged when more than 10 listeners are registered for a single key, to help detect leaks.

---

## CronScheduler

Wraps the `cron` package for scheduled job management. Internal to the engine — automations interact with it via cron triggers.

| Method | Signature | Description |
|---|---|---|
| `schedule` | `(id: string, expression: string, callback: () => void) => void` | Create and start a cron job |
| `remove` | `(id: string) => void` | Stop and remove a single job |
| `removeByPrefix` | `(prefix: string) => void` | Stop and remove all jobs with matching prefix |
| `stopAll` | `() => void` | Stop all jobs |

Timezone is read from the `TZ` environment variable.

---

## ServiceRegistry

Type-safe key-value registry for optional services. Services implementing `ServicePlugin` receive lifecycle hooks.

```ts
import type { ServiceRegistry } from "ts-home-automation";
```

| Method | Signature | Description |
|---|---|---|
| `register<T>` | `(key: string, service: T) => void` | Register a service under a key |
| `get<T>` | `(key: string) => T \| null` | Nullable lookup |
| `getOrThrow<T>` | `(key: string) => T` | Asserted lookup — throws if missing |
| `use<T, R>` | `(key: string, fn: (service: T) => R) => R \| undefined` | Callback wrapper — no-ops when absent |
| `has` | `(key: string) => boolean` | Check if a service is registered |
| `keys` | `() => string[]` | Get all registered keys |
| `startAll` | `(context: CoreContext) => Promise<void>` | Call `onStart()` on all `ServicePlugin` instances |
| `stopAll` | `() => Promise<void>` | Call `onStop()` on all `ServicePlugin` instances |

---

## ServicePlugin

Interface for services that need lifecycle hooks and HTTP route registration. See [Custom Service Plugins](service-plugins.md) for a full guide.

```ts
import type { ServicePlugin, CoreContext } from "ts-home-automation";
```

### `CoreContext`

| Field | Type | Description |
|---|---|---|
| `http` | `HttpClient` | Shared HTTP client |
| `logger` | `Logger` | Plugin-scoped child logger |

### `ServicePlugin` interface

| Member | Type | Description |
|---|---|---|
| `serviceKey` (readonly) | `string` | Unique registration key |
| `onStart?(context)` | `(context: CoreContext) => Promise<void>` | Called during engine startup |
| `onStop?()` | `() => Promise<void>` | Called during engine shutdown |
| `registerRoutes?(app)` | `(app: Hono) => void` | Mount custom HTTP routes on the shared server |

---

## LogBuffer

Ring buffer for in-memory log storage. Used by the debug API and web UI.

```ts
import type { LogBuffer, LogEntry, LogQuery } from "ts-home-automation";
```

### `LogEntry`

```ts
interface LogEntry {
  level: number;    // pino numeric level (10=trace, 20=debug, 30=info, 40=warn, 50=error, 60=fatal)
  time: number;     // Unix timestamp in ms
  msg: string;      // Log message
  [key: string]: unknown;  // Additional fields (automation, service, err, etc.)
}
```

### `LogQuery`

| Field | Type | Default | Description |
|---|---|---|---|
| `automation` | `string` | _(none)_ | Filter by automation name |
| `level` | `number` | _(none)_ | Minimum log level |
| `limit` | `number` | `50` | Maximum entries returned |

---

## DeviceRegistry

Zigbee2MQTT device discovery and state tracking. Available as `engine.deviceRegistry` or `this.deviceRegistry` in automations. Returns `null` when `DEVICE_REGISTRY_ENABLED` is not `true`.

See [Device Registry](device-registry.md) for the full feature guide.

### Query methods

| Method | Signature | Description |
|---|---|---|
| `getDevices` | `() => ZigbeeDevice[]` | All tracked non-coordinator devices |
| `getDevice` | `(friendlyName: string) => ZigbeeDevice \| undefined` | Single device lookup |
| `hasDevice` | `(friendlyName: string) => boolean` | Existence check |
| `getNiceName` | `(friendlyName: string) => string` | Human-readable name via configured mapping |
| `getDeviceState` | `(friendlyName: string) => Record<string, unknown> \| undefined` | Last-known merged device state |

### Event methods

| Method | Signature | Description |
|---|---|---|
| `onDeviceStateChange` | `(friendlyName: string, handler) => void` | Register a per-device state change handler |
| `offDeviceStateChange` | `(friendlyName: string, handler) => void` | Remove a state change handler |
| `onDeviceAdded` | `(handler: DeviceAddedHandler) => void` | Register a handler for device joins |
| `offDeviceAdded` | `(handler: DeviceAddedHandler) => void` | Remove a join handler |
| `onDeviceRemoved` | `(handler: DeviceRemovedHandler) => void` | Register a handler for device departures |
| `offDeviceRemoved` | `(handler: DeviceRemovedHandler) => void` | Remove a departure handler |

### Persistence options

```ts
interface DeviceRegistryPersistenceOptions {
  persist?: boolean;    // default: false
  filePath?: string;    // default: "./device-registry.json"
}
```

---

## Device base classes

Abstract automation classes for common Zigbee remotes. See [Device Base Classes](device-classes.md) for handler details.

| Class | Device | Handlers |
|---|---|---|
| `AqaraH1Automation` | Aqara Wireless Remote Switch H1 (WXKG15LM) | 12 handlers (single/double/triple/hold for left/right/both) |
| `IkeaStyrbarAutomation` | IKEA STYRBAR (E2001/E2002/E2313) | 11 handlers (on/off, brightness, arrows) |
| `IkeaRodretAutomation` | IKEA RODRET (E2201) | 5 handlers (on/off, brightness up/down/stop) |

---

## Configuration

### `Config`

The resolved configuration object. See [Configuration](configuration.md) for all environment variables.

```ts
import type { Config } from "ts-home-automation";
```

### `loadConfig(overrides?)`

```ts
function loadConfig(overrides?: Partial<Config>): Config
```

Reads environment variables, applies Zod validation, merges with optional overrides. Exits the process with a formatted error on validation failure.

---

## Type exports

All Zigbee2MQTT, Shelly, Nanoleaf, Weather, and Notification types are re-exported from the package. See [Device Types](device-types.md) for a complete catalogue.

```ts
// Zigbee types
import type { OccupancyPayload, ColorLightSetCommand, ZigbeeDevice } from "ts-home-automation";

// Shelly types
import type { ShellySwitchStatus, ShellyCoverStatus } from "ts-home-automation";
// Or from the subpath:
import type { ShellySwitchStatus } from "ts-home-automation/types/shelly";

// Weather types
import type { WeatherService, CurrentWeather, DailyForecast } from "ts-home-automation";

// Notification types
import type { NotificationService, NotificationOptions } from "ts-home-automation";

// Nanoleaf types
import type { NanoleafState, NanoleafDeviceInfo } from "ts-home-automation";
```

### Subpath imports

The package provides subpath exports for each type category:

| Import path | Contents |
|---|---|
| `ts-home-automation` | Everything (main barrel) |
| `ts-home-automation/types` | All Zigbee2MQTT types |
| `ts-home-automation/types/shelly` | Shelly Gen 2 RPC types |
| `ts-home-automation/types/nanoleaf` | Nanoleaf OpenAPI types |
| `ts-home-automation/types/weather` | `WeatherService` interface and data types |
| `ts-home-automation/types/notification` | `NotificationService` interface and option types |
