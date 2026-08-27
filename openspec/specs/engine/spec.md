# Engine

## Purpose

The Engine is the top-level orchestrator that wires together all services, loads automations, and manages the start/stop lifecycle of the home automation system. It is created via the `createEngine()` factory function — there is no `Engine` class.

## Requirements

### Requirement: Engine Creation

The system MUST provide a `createEngine(options: EngineOptions): Engine` factory function.

`EngineOptions` fields:

| Field | Required | Description |
|-------|----------|-------------|
| `automationsDir` | **Yes** | Path to directory containing automation `.ts`/`.js` files |
| `recursive` | No | Whether to scan subdirectories recursively (default: `false`) |
| `config` | No | Partial override of environment-derived `Config` |
| `logger` | No | Pre-configured pino `Logger` instance |
| `state` | No | `StateManagerOptions` (persist/filePath/flushIntervalMs) |
| `deviceRegistry` | No | Options including `names` (DeviceNiceNames), `persist`, `filePath` |
| `stateToggles` | No | Static list of `{ stateKey, name }` presented as toggle devices |
| `services` | No | Map of service key → instance or `ServiceFactory` function |

`stateToggles` is engine-level rather than an option of the HomeKit service.
Toggles are presented through the shared device source abstraction and consumed
by every sink, so configuring them inside one sink would withhold them from the
others. Supplying `stateToggles` under the HomeKit service options MUST fail
configuration validation with a message naming the engine-level setting.

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
  readonly devices: DeviceSourceRegistry;
}
```

`devices` is the aggregate accessor spanning every configured device source. It
is always present: a source that is not configured is reported as unavailable
rather than causing the accessor to be absent.

`deviceRegistry` is retained alongside it. It remains the Zigbee-specific
tracking surface that automations receive through `AutomationContext`, and it is
the substrate the Zigbee device source is built over.

#### Scenario: State toggles are configured at engine level

- **WHEN** `createEngine()` is called with `stateToggles` listing one entry
- **THEN** a toggle device is presented for that state key regardless of whether
  the HomeKit service is configured

#### Scenario: The HomeKit location is rejected

- **WHEN** `stateToggles` is supplied under the HomeKit service options
- **THEN** configuration validation fails with a message naming the engine-level
  setting

#### Scenario: The device accessor is always present

- **WHEN** an engine is created with no Shelly, Nanoleaf, or toggle configuration
- **THEN** `devices` is present and reports those sources as unavailable rather
  than being null

### Requirement: Startup Sequence (start())

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
11. Construct and start the device sources, then the aggregate accessor over them
12. Discover and register automations from `automationsDir`
13. Mark engine as started on HTTP server

Device sources MUST be started after the device registry and the service registry
they are built over, and before automation discovery, so that an automation's
`onStart()` never observes a partially constructed device surface.

Constructing a source whose backing service or configuration is absent MUST NOT
fail startup. The source is omitted and reported as unavailable through the
aggregate accessor. A source that fails to start MUST be logged and omitted on
the same terms, so that one misconfigured family does not prevent the engine from
running.

The system MUST roll back (best-effort cleanup) on any startup failure and re-throw the error. Rollback MUST stop any device source that was started.

#### Scenario: An unconfigured source does not fail startup

- **WHEN** the engine starts with no Nanoleaf service registered
- **THEN** startup completes and the Nanoleaf source is reported as unavailable

#### Scenario: A failing source is isolated

- **WHEN** one device source throws while starting
- **THEN** the failure is logged, that source is reported as unavailable, and the
  remaining sources and the engine still start

#### Scenario: Sources precede automation discovery

- **WHEN** an automation's `onStart()` runs during discovery
- **THEN** the aggregate device accessor is already populated

### Requirement: Shutdown Sequence (stop())

The system MUST execute shutdown in this order:

1. Unmark engine as started on HTTP server
2. Call `onStop()` on all automations (in reverse registration order)
3. Stop all cron jobs
4. Stop the device sources, releasing subscriptions and cancelling poll timers
5. Call `onStop()` on all `ServicePlugin` instances
6. Save device registry to disk (if persist enabled)
7. Stop device registry
8. Flush any pending state write and save state to disk (if persist enabled)
9. Disconnect MQTT
10. Stop HTTP server

Device sources are stopped after automations so that an automation's `onStop()`
can still issue a final command, and before the services and registry they read
from are torn down.

Stopping a source MUST cancel its poll timers and release its subscriptions, so
that no refresh cycle survives shutdown and no listener retains a reference to a
stopped engine.

Each step MUST be isolated: a failure (throw or rejection) in any one step MUST be caught and logged, and MUST NOT prevent the remaining steps from executing. In particular, a failure while saving state or the device registry MUST NOT prevent MQTT from disconnecting or the HTTP server from stopping.

After all steps have been attempted, the system MUST reset its internal `started` flag to `false` (even if one or more steps failed), so the engine does not remain in a permanently "started" state after a partial teardown.

The system MUST be idempotent — calling `stop()` when not started is a no-op.

#### Scenario: A failing teardown step does not block the rest

- **WHEN** `stop()` runs and an intermediate step (e.g. saving state) throws
- **THEN** the error is logged, MQTT is still disconnected, the HTTP server is still stopped, and `started` is reset to `false`

#### Scenario: Stop remains idempotent

- **WHEN** `stop()` is called and the engine was never started
- **THEN** it returns without side effects

#### Scenario: Poll timers do not survive shutdown

- **WHEN** the engine stops while a polled source has a refresh scheduled
- **THEN** the timer is cancelled and no further refresh occurs

#### Scenario: A final command is still deliverable

- **WHEN** an automation issues a device command from its `onStop()`
- **THEN** the source is still running and the command is dispatched

### Requirement: Service Resolution

The system MUST support three service registration patterns:

1. **Direct instance**: `services: { shelly: myShellyInstance }`
2. **Factory function**: `services: { shelly: (http, logger) => new ShellyService(http, logger) }`
3. **HomeKit-specific factory**: `services: { homekit: (ctx) => new HomekitService(...) }`

Factory functions receive the engine's shared `HttpClient` and a child `Logger`. HomeKit's factory instead receives a single `HomekitServiceContext` object.

The HomeKit context MUST NOT carry Zigbee-specific or transport-specific members
once HomeKit consumes the shared device sources. It receives the aggregate device
accessor in place of `deviceRegistry`, `mqtt`, and `shelly`, alongside `http` and
`logger`. HomeKit narrows the shared descriptors to HAP characteristics at its own
boundary and holds no accessory source of its own.

Device sources are not services and MUST NOT be registered in the
`ServiceRegistry`. They are constructed by the engine over the services and the
registry, and are reached through the aggregate accessor. Registering them as
services would make the source layer resolvable before the services it is built
over exist.

#### Scenario: HomeKit receives the shared accessor

- **WHEN** a HomeKit factory is invoked
- **THEN** its context exposes the aggregate device accessor and no
  `deviceRegistry`, `mqtt`, or `shelly` member

#### Scenario: Sources are not service keys

- **WHEN** the service registry is enumerated on a running engine
- **THEN** no device source appears among the registered services

### Requirement: Custom Services

The system MUST accept arbitrary service keys beyond the well-known set (`notifications`, `weather`, `shelly`, `nanoleaf`, `homekit`, `metrics`). Custom keys are resolved identically (instance or factory) and registered in the `ServiceRegistry`.

Custom device sources are out of scope for this change. The set of sources is
fixed at Zigbee, Shelly, Nanoleaf, and configured state toggles, and there is no
supported way for a consumer to supply an additional one. The `DeviceSource`
interface is exported so that the shape is inspectable and testable, not as a
registration point.

#### Scenario: No source registration point is offered

- **WHEN** a consumer supplies a custom object implementing `DeviceSource`
- **THEN** there is no engine option that adopts it, and the aggregate accessor
  spans only the four built-in sources

### Requirement: Configuration Merging

The system MUST merge `options.config` on top of environment-derived config, with deep merge for `options.config.mqtt`.

### Requirement: Logger Creation

The system MUST create a default logger when no `options.logger` is provided:
- Production (`NODE_ENV=production`): raw JSON to stdout
- Development: pretty-printed via `pino-pretty`
- Both: multistream to stdout + `LogBuffer` (2500 entries)

The system MUST additionally construct a second logger writing to stdout only,
bypassing the `LogBuffer`, at the same level and with the same formatting choice.
It MUST be built as an independent pino instance, since a child of the primary
logger inherits the buffer stream and cannot omit it.

This logger MUST be constructed even when `options.logger` is supplied, so that
the event stream's delivery path has a non-buffered destination regardless of how
the primary logger was obtained. When a caller supplies a logger, the engine
cannot know whether it writes to the `LogBuffer`, and must assume it does.

It MUST be injected into the realtime event stream and used only on its delivery
path, as specified under the `logging` capability.

#### Scenario: The second logger exists with a supplied logger

- **WHEN** `createEngine()` is given an `options.logger`
- **THEN** a separate stdout-only logger is still constructed and handed to the
  event stream

#### Scenario: Writing to it leaves the buffer untouched

- **WHEN** a message is written through the stdout-only logger
- **THEN** the `LogBuffer` contains no corresponding entry
