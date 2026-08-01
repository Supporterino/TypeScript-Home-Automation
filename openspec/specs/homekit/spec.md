# HomeKit Bridge

## Purpose

Runs a HAP (HomeKit Accessory Protocol) bridge inside the engine process using `hap-nodejs`. Automatically translates Zigbee2MQTT devices tracked by the `DeviceRegistry` into HomeKit accessories, enabling control via Apple's Home app and Siri.

## Requirements

### Configuration

The `HomekitService` MUST accept `HomekitServiceOptions`:

```ts
interface StateToggleConfig {
  stateKey: string;  // StateManager key to expose
  name: string;      // Display name in the Home app
}

interface HomekitServiceOptions {
  pinCode: string;              // REQUIRED — format "XXX-XX-XXX"
  persistPath?: string;         // default: "./homekit-persist"
  bridgeName?: string;          // default: "TS-Home-Automation"
  port?: number;                // default: 47128
  username?: string;            // default: "CC:22:3D:E3:CE:F8" (MAC format)
  bind?: string | string[];     // Network interfaces/IPs to advertise on
  pollIntervalMs?: number;      // default: 10000 — global Shelly poll interval
  stateToggles?: StateToggleConfig[]; // default: [] — state keys bridged as switches
}
```

The `HomekitService` constructor MUST accept a `ShellyService | null` handle (in
addition to the existing `MqttService`, `Logger`, and `DeviceRegistry | null`) so
that Shelly bridging and write-back are available. When `shelly` is null, no
Shelly source is created. The constructor MUST also accept the shared
`StateManager` so the state-toggle source can subscribe to and write back state
keys.

The `homekit` service factory signature MUST be a single context object rather
than positional arguments:

```ts
interface HomekitServiceContext {
  http: HttpClient;
  logger: Logger;
  mqtt: MqttService;
  deviceRegistry: DeviceRegistry | null;
  shelly: ShellyService | null;
  state: StateManager;
}
type HomekitServiceFactory = (ctx: HomekitServiceContext) => HomekitService;
```

#### Scenario: Factory receives a context object

- **WHEN** the engine resolves a function-form `homekit` service
- **THEN** it invokes the factory with a single `HomekitServiceContext` object
  containing `http`, `logger`, `mqtt`, `deviceRegistry`, `shelly`, and `state`

#### Scenario: Poll interval defaults when unset

- **WHEN** `pollIntervalMs` is not provided
- **THEN** the Shelly poll loop uses 10000 ms

#### Scenario: State toggles default to empty

- **WHEN** `stateToggles` is not provided
- **THEN** the state-toggle source is created with no accessories and does not
  affect the bridge

### Accessory Source Abstraction

The HomeKit bridge MUST consume devices through a source-agnostic
`AccessorySource` interface rather than reading device families directly. Each
source is responsible for its own discovery, freshness, and write-back, and
interacts with the bridge only through an `AccessorySink`.

```ts
interface AccessorySource {
  readonly name: string;                       // e.g. "zigbee" | "shelly"
  start(sink: AccessorySink): Promise<void> | void;
  stop(): Promise<void> | void;
}

interface AccessorySink {
  add(id: string, accessory: CreatedAccessory): void;
  remove(id: string): void;
}
```

`HomekitService` MUST own the HAP bridge lifecycle (publish/unpublish, persist
path, PIN/port/bind, status endpoint, accessory map) and MUST NOT reference
`ZigbeeDevice`, Zigbee2MQTT `exposes`, MQTT, or Shelly RPC directly. Accessory
IDs passed to the sink MUST be unique across sources (e.g. prefixed by source
name).

#### Scenario: Bridge starts all sources

- **WHEN** `HomekitService.onStart()` runs with one or more registered sources
- **THEN** each source's `start(sink)` is called after the HAP bridge is created
- **AND** accessories added via `sink.add(id, accessory)` are bridged with
  `bridge.addBridgedAccessory`

#### Scenario: Bridge stops all sources

- **WHEN** `HomekitService.onStop()` runs
- **THEN** each source's `stop()` is called
- **AND** the bridge is unpublished and the accessory map is cleared

#### Scenario: Source-agnostic accessory IDs avoid collisions

- **WHEN** two sources register devices that share a friendly name
- **THEN** the bridge keeps them as distinct accessories because IDs are
  namespaced per source

### Zigbee Accessory Source

Zigbee bridging MUST be provided by a `ZigbeeSource` implementing
`AccessorySource`, preserving the previous behavior. On `start(sink)` it MUST
replay `DeviceRegistry.getDevices()`, subscribe to `onDeviceAdded` /
`onDeviceRemoved`, build accessories via the existing
`homekit-accessory-factory`, wire state via `onDeviceStateChange`, and route
write-back through `mqtt.publishToDevice`. On `stop()` it MUST detach all
listeners.

#### Scenario: Existing Zigbee devices are bridged at start

- **WHEN** `ZigbeeSource.start(sink)` runs and the registry already has devices
- **THEN** a HomeKit accessory is created for each supported device via the
  Zigbee factory and added through the sink

#### Scenario: Dynamic Zigbee join/leave still works

- **WHEN** a device joins or leaves after start
- **THEN** `onDeviceAdded` / `onDeviceRemoved` create or remove the accessory
  through the sink

### Shelly Accessory Source

Shelly bridging MUST be provided by a `ShellySource` implementing
`AccessorySource`. On `start(sink)` it MUST replay `ShellyService.getDevices()`,
subscribe to `ShellyService.onDeviceRegistered`, build accessories via the Shelly
accessory factory, and start a global HTTP polling loop. HomeKit write-back MUST
route to `ShellyService` methods (`turnOn` / `turnOff` for switches/outlets;
`coverGoToPosition` / `coverStop` for covers). On `stop()` it MUST clear the poll
interval and detach the registration listener.

Because Shelly devices are registered by automations after the service lifecycle
starts, `ShellySource` MUST react to registration events rather than relying on a
start-time snapshot, so devices registered at any time are bridged.

#### Scenario: Shelly device registered after bridge start is bridged

- **WHEN** an automation calls `shelly.register(name, host, { type })` after the
  HomeKit bridge has started
- **THEN** `onDeviceRegistered` fires and `ShellySource` builds and adds the
  corresponding accessory through the sink

#### Scenario: Write-back to a Shelly switch

- **WHEN** the Home app toggles a Shelly switch or outlet accessory
- **THEN** `ShellySource` calls `ShellyService.turnOn` or `turnOff` for that
  device

#### Scenario: Write-back to a Shelly cover

- **WHEN** the Home app sets a target position on a Shelly cover accessory
- **THEN** `ShellySource` calls `ShellyService.coverGoToPosition` with the
  requested position

### Shelly State Polling

`ShellySource` MUST keep HomeKit characteristics fresh via a single global
polling loop over HTTP (no MQTT). The interval MUST be configurable via a global
`pollIntervalMs` option (default 10000 ms). Each tick MUST iterate the current
Shelly device list, call `Switch.GetStatus` or `Cover.GetStatus` as appropriate,
normalize the result, and push it to the accessory's `updateState`. A failed
status call for one device MUST NOT abort the tick for other devices; it MUST be
caught, logged, and skipped.

#### Scenario: Physical change appears in HomeKit within one interval

- **WHEN** a Shelly device changes state outside HomeKit (e.g. a physical switch
  press)
- **THEN** the next poll tick reads the new status and updates the corresponding
  HomeKit characteristic

#### Scenario: Unreachable device does not break the loop

- **WHEN** one Shelly device is unreachable during a poll tick
- **THEN** the error is caught and logged, and other devices are still polled

#### Scenario: Device registered later joins the poll loop

- **WHEN** a Shelly device is registered after the loop has started
- **THEN** subsequent ticks include it because the loop iterates the live device
  list

### Shelly Accessory Factory

A Shelly-specific accessory factory MUST build HAP accessories from a
`ShellyDevice` and its `type`:

- `type: "switch"` → `Service.Switch`
- `type: "outlet"` → `Service.Outlet`
- `type: "cover"` → `Service.WindowCovering`

The factory MUST return the shared `CreatedAccessory { accessory, updateState }`
contract and MUST generate a stable accessory UUID per device.

#### Scenario: Switch accessory maps status to On characteristic

- **WHEN** a Shelly switch reports `output: true` via `Switch.GetStatus`
- **THEN** `updateState` sets the `On` characteristic to true

#### Scenario: Unsupported combination is skipped safely

- **WHEN** a device has no recognized Shelly type mapping
- **THEN** the factory returns null and the source skips it with a log

### WindowCovering Support

The system MUST support Shelly 2PM covers as HAP `WindowCovering` accessories.
State translation MUST be:

- `current_pos` (0–100) → `CurrentPosition` (0 = closed, 100 = open)
- `state: "opening"` → `PositionState` INCREASING
- `state: "closing"` → `PositionState` DECREASING
- `state: "open" | "closed" | "stopped"` → `PositionState` STOPPED
- `TargetPosition` write → `ShellyService.coverGoToPosition(name, position)`

The accessory MUST keep the HAP `TargetPosition` characteristic truthful so
HomeKit controllers do not wedge the tile in a perpetual "Opening"/"Closing"
state:

- When the cover is **idle** (`state` is `"open"`, `"closed"`, or `"stopped"`),
  `TargetPosition` MUST be set to the same value as `CurrentPosition`.
- When the cover is **moving** (`state` is `"opening"` or `"closing"`),
  `TargetPosition` MUST be set to the Shelly `target_pos` when present, falling
  back to `CurrentPosition` when `target_pos` is absent.

The `WindowCovering` service MUST be created with initialized characteristic
values (`CurrentPosition` = 0, `TargetPosition` = 0, `PositionState` = STOPPED)
so the first controller read is never `undefined`.

When a cover reports `current_pos: null` (uncalibrated), the system MUST report
`CurrentPosition` as 0, log a warning suggesting calibration, and still expose
the accessory.

#### Scenario: Cover position reflected in HomeKit

- **WHEN** `Cover.GetStatus` reports `current_pos: 40, state: "stopped"`
- **THEN** `CurrentPosition` is 40, `PositionState` is STOPPED, and
  `TargetPosition` is also 40

#### Scenario: Moving cover reports direction

- **WHEN** `Cover.GetStatus` reports `state: "opening"`
- **THEN** `PositionState` is INCREASING

#### Scenario: Moving cover publishes its target position

- **WHEN** `Cover.GetStatus` reports `state: "closing", target_pos: 20`
- **THEN** `PositionState` is DECREASING and `TargetPosition` is 20

#### Scenario: Idle cover settles its target position

- **WHEN** `Cover.GetStatus` reports `current_pos: 75, state: "open"`
- **THEN** `TargetPosition` equals `CurrentPosition` (75) and `PositionState` is
  STOPPED

#### Scenario: Initial characteristic values are seeded

- **WHEN** a cover accessory is created but no status has been polled yet
- **THEN** `CurrentPosition`, `TargetPosition`, and `PositionState` read as 0, 0,
  and STOPPED respectively

#### Scenario: Uncalibrated cover falls back to zero

- **WHEN** `Cover.GetStatus` reports `current_pos: null`
- **THEN** `CurrentPosition` is reported as 0 and a calibration warning is logged

### Requirements

The system MUST start the HomeKit bridge when at least one accessory source is
available. The Zigbee source requires `DEVICE_REGISTRY_ENABLED=true`; when the
registry is absent, the Zigbee source MUST be skipped (with a warning) but the
bridge MAY still start to serve the Shelly source. The state-toggle source is
available whenever `stateToggles` is configured, so the bridge MAY start with
only state toggles. If no source is available, the service MUST log a warning and
skip startup.

#### Scenario: Bridge runs with only Shelly source

- **WHEN** `DEVICE_REGISTRY_ENABLED=false` but a `ShellyService` is registered
- **THEN** the bridge starts with the Shelly source and skips the Zigbee source
  with a warning

#### Scenario: Bridge runs with only state toggles

- **WHEN** neither the device registry nor a Shelly service is available but
  `stateToggles` is configured
- **THEN** the bridge starts with the state-toggle source

#### Scenario: No sources available

- **WHEN** neither the device registry, a Shelly service, nor any state toggle is
  available
- **THEN** the service logs a warning and skips startup

### ServicePlugin Implementation

The service MUST implement `ServicePlugin`:
- `readonly serviceKey = "homekit"`
- `onStart(ctx: CoreContext)` — Lazy-load hap-nodejs, create bridge, register accessories
- `onStop()` — Unpublish bridge, detach listeners, clear accessories
- `registerRoutes(app: Hono)` — Mount `GET /api/homekit/status`

### Startup Behavior

`onStart()` MUST:

1. Lazy-load `hap-nodejs` (to avoid evaluating native modules at import time)
2. Configure HAP storage path (persists pairing data between restarts)
3. Create a `Bridge` with the configured name and UUID (generated from `username`)
4. Construct the available accessory sources (Zigbee when the registry is
   present; Shelly when a `ShellyService` is present; state toggles when
   `stateToggles` is configured)
5. Call each source's `start(sink)` so it builds its initial accessories and
   begins its own freshness mechanism (registry listeners for Zigbee; a polling
   loop for Shelly; `StateManager` listeners for state toggles)
6. Call `bridge.publish()` with pin code, port, and category (bridge = 2)
7. Mark `published = true` only after `publish()` resolves

If `bridge.publish()` fails (throws or rejects), `onStart()` MUST tear down any already-started sources by calling their `stop()` (releasing poll intervals and registry listeners), reset `published` to `false`, and clear the `bridge` reference before propagating the error — so a failed startup leaves no orphaned poll timers or registry listeners running.

#### Scenario: Sources start before publish

- **WHEN** `onStart()` runs
- **THEN** all available sources have `start(sink)` called before
  `bridge.publish()` resolves and `published` is set true

#### Scenario: Publish failure tears down started sources

- **WHEN** `bridge.publish()` throws or rejects after sources were started
- **THEN** each started source's `stop()` is called, `published` is `false`, `bridge` is cleared, and no poll interval or registry listener remains active

### Accessory Creation

For each Zigbee device, the accessory factory MUST:

1. **Detect capabilities** — Examine `device.definition.exposes` to determine what HomeKit service to create:
   - Lightbulb (on/off, brightness, color temperature, color)
   - Motion sensor
   - Contact sensor
   - Water leak sensor
   - Temperature sensor / Humidity sensor
   - Switch / Outlet
   - Battery service (added to battery-powered devices)

2. **Create the HAP accessory** — Generate a UUID from the IEEE address for stable identity

3. **Wire state updates** — Register a `DeviceStateChangeHandler` that calls `updateState(state)` to sync Zigbee state → HomeKit characteristic values

4. **Wire write-back** — Register `onSet` callbacks on controllable characteristics that publish MQTT commands to Zigbee2MQTT (e.g., `{ state: "ON" }`, `{ brightness: 128 }`)

5. **Skip unsupported devices** — If a device has no recognized capability, skip with a debug log

### Dynamic Device Management

When a new device joins the network:
- `onDeviceAdded` fires → `addAccessory(device)` creates and bridges the accessory

When a device leaves the network:
- `onDeviceRemoved` fires → `removeAccessory(device)` removes the accessory and detaches listeners

### Shutdown

`onStop()` MUST:

1. Call `stop()` on every accessory source (detaching listeners, clearing poll
   intervals)
2. Clear the accessory map
3. Call `bridge.unpublish()`
4. Set `published = false` and `bridge = null`

#### Scenario: Poll loop cleared on shutdown

- **WHEN** `onStop()` runs while a Shelly poll loop is active
- **THEN** the poll interval is cleared and no further HTTP polls occur

### Status API

`getStatus(): HomekitStatus` MUST return:
```ts
{
  running: boolean;       // Whether the bridge is published
  bridgeName: string;
  port: number;
  username: string;
  persistPath: string;
  accessoryCount: number; // Current number of bridged accessories
  bind?: string | string[];
}
```

`GET /api/homekit/status` MUST return this status (protected by `/api/*` auth middleware).

### Crypto Polyfill

The system MUST load a crypto polyfill for Bun compatibility before importing `hap-nodejs`, because Bun does not support the `chacha20-poly1305` cipher used by HAP.

### Color Conversion

The factory MUST convert CIE xy color space (used by HomeKit) to hue/saturation (used by Zigbee2MQTT) and vice versa, enabling color light control through the Home app.
