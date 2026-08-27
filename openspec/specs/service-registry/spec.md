# Service Registry

## Purpose

A type-safe key-value registry for optional services, with three retrieval styles and built-in `ServicePlugin` lifecycle management. Services are registered by string key and retrieved generically, enabling automations to access device services (Shelly, Nanoleaf), utility services (notifications, weather), and custom services.

## Requirements

### Requirement: Registration

`register<T>(key, service)` MUST:
- Store the service in an internal `Map<string, unknown>`
- Replace any previously registered service with the same key
- Log a debug message

### Requirement: Retrieval — Three Styles

#### 1. `get<T>(key): T | null`

Nullable lookup. Returns the service if registered, `null` otherwise. The caller handles the absent case.

```ts
const shelly = this.services.get<ShellyService>("shelly");
if (shelly) await shelly.turnOn("plug");
```

#### 2. `getOrThrow<T>(key): T`

Asserts presence. Returns the service if registered, throws `Error` with a descriptive message if not. The return type is `T` (non-nullable) — no null-check needed.

```ts
const shelly = this.services.getOrThrow<ShellyService>("shelly");
await shelly.turnOn("plug");
```

#### 3. `use<T, R>(key, fn): R | undefined`

Callback wrapper. Calls `fn(service)` if the service is registered, returns `undefined` otherwise. Best for fire-and-forget one-liners.

```ts
await this.services.use<ShellyService>("shelly", (s) => s.turnOff("tv_plug"));
```

### Requirement: Query Methods

- `has(key): boolean` — Returns whether a service is registered
- `keys(): string[]` — Returns all registered service keys

### Requirement: ServicePlugin Lifecycle

The registry MUST manage `ServicePlugin` lifecycle hooks:

#### `startAll(context: CoreContext): Promise<void>`

For every registered service that implements `ServicePlugin`:
1. Create a child logger with `{ service: service.serviceKey }`
2. Call `service.onStart(pluginContext)` if defined, subject to a per-plugin timeout — if `onStart` does not settle within the timeout, the registry MUST log a timeout error and continue with the next plugin rather than blocking startup indefinitely
3. Log `"Starting service plugin"` before and any error after
4. Errors (including timeouts) in individual plugins are caught, logged, and do NOT prevent other plugins from starting

#### `stopAll(): Promise<void>`

For every registered service that implements `ServicePlugin`, processed in reverse (LIFO) registration order:
1. Call `service.onStop()` if defined, subject to a per-plugin timeout — if `onStop` does not settle within the timeout, the registry MUST log a timeout error and continue with the next plugin rather than blocking shutdown indefinitely
2. Log `"Stopping service plugin"` before and any error after
3. Errors (including timeouts) in individual plugins are caught, logged, and do NOT prevent other plugins from stopping

#### `mountRoutes(app: Hono): void`

For every registered service that implements `ServicePlugin`:
1. Call `service.registerRoutes(app)` if defined
2. Errors in individual plugins are caught, logged, and do NOT prevent other plugins from mounting

#### Scenario: A hanging plugin does not block others

- **WHEN** one plugin's `onStart` (or `onStop`) never settles
- **THEN** after the per-plugin timeout the registry logs a timeout error and proceeds to start (or stop) the remaining plugins

#### Scenario: Plugins stop in reverse start order

- **WHEN** `stopAll()` runs after multiple plugins were started
- **THEN** plugins are stopped in the reverse of their registration order

### Requirement: Logger Injection

The engine MUST call `setLogger(logger)` on the registry after construction, providing a `{ service: "services" }` scoped child logger.

### Requirement: Well-Known Keys

The system recognizes these conventional service keys:
- `"notifications"` — `NotificationService`
- `"weather"` — `WeatherService`
- `"shelly"` — `ShellyService`
- `"nanoleaf"` — `NanoleafService`
- `"homekit"` — `HomekitService`
- `"metrics"` — `PrometheusMetricsService`

Custom keys are fully supported. Any string key not in the well-known set is treated identically.
