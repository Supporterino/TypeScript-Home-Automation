# HomeKit Bridge

## Purpose

Runs a HAP (HomeKit Accessory Protocol) bridge inside the engine process using `hap-nodejs`. Automatically translates Zigbee2MQTT devices tracked by the `DeviceRegistry` into HomeKit accessories, enabling control via Apple's Home app and Siri.

## Requirements

### Requirement: Configuration

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

### Requirement: Accessory Source Abstraction

The HomeKit bridge MUST consume devices through the shared `device-sources`
capability rather than reading device families directly or maintaining its own
parallel source implementations. Device discovery, freshness, and command
dispatch for Zigbee, Shelly, Nanoleaf, and configured state toggles are owned by
that capability and are shared with other consumers. The bridge MUST NOT retain
any accessory source of its own.

`HomekitService` MUST own the HAP bridge lifecycle (publish/unpublish, persist
path, PIN/port/bind, status endpoint, accessory map) and MUST NOT reference
`ZigbeeDevice`, Zigbee2MQTT `exposes`, MQTT, or Shelly RPC directly.

Because the shared device descriptor is deliberately richer than the HomeKit
model, `HomekitService` MUST narrow it to HAP services and characteristics at
its own boundary. The shared descriptor MUST NOT be reduced to the HomeKit
subset for the benefit of other consumers.

Accessory identifiers MUST remain unique across sources, namespaced by source
name.

Observable HomeKit behaviour MUST be unchanged by this consolidation. In
particular, accessory UUID derivation and the bridge UUID derivation MUST be
preserved exactly, so that an existing paired bridge continues to work and no
user is required to re-pair.

#### Scenario: Bridge starts all sources

- **WHEN** `HomekitService.onStart()` runs with one or more device sources
  available
- **THEN** each source is started after the HAP bridge is created
- **AND** devices yielded by a source are bridged as accessories

#### Scenario: Bridge stops all sources

- **WHEN** `HomekitService.onStop()` runs
- **THEN** each source is stopped
- **AND** the bridge is unpublished and the accessory map is cleared

#### Scenario: Source-agnostic accessory IDs avoid collisions

- **WHEN** two sources yield devices that share a friendly name
- **THEN** the bridge keeps them as distinct accessories because IDs are
  namespaced per source

#### Scenario: Existing pairing survives the consolidation

- **WHEN** an engine with an already-paired HomeKit bridge is upgraded to consume
  the shared device sources
- **THEN** the bridge UUID and every accessory UUID are unchanged, and the Home
  app continues to control the same accessories without re-pairing

#### Scenario: HomeKit narrowing does not constrain other consumers

- **WHEN** a device declares capabilities that have no HomeKit representation
- **THEN** those capabilities are absent from the HAP accessory but remain
  present in the shared device descriptor for other consumers

#### Scenario: One device family is bridged only once

- **WHEN** both the HomeKit bridge and another consumer are reading the same
  device source
- **THEN** the source performs discovery and refresh once, and both consumers
  observe the same device state

### Requirement: Visibility-Filtered Accessory Exposure

The HomeKit bridge MUST expose only devices that are visible. A hidden device MUST
NOT be bridged as an accessory.

The bridge MUST obtain its devices through the visible enumeration offered by the
shared device model, rather than enumerating everything and filtering itself.
Reproducing the filter here would give the system two independently maintained
definitions of what "hidden" means, which would eventually disagree.

Visibility MUST be honoured both at startup and while running. A device hidden
while the bridge is published MUST have its accessory removed, and a device
unhidden MUST have its accessory added, without restarting the engine or
re-pairing.

A visibility change produces no device state event, so the bridge MUST observe
visibility changes directly. Relying on the device notifications it already
receives would leave a hidden device in the Home app until that device happened to
report something unrelated — indefinitely, for a device that has just been switched
off.

Removing an accessory because its device was hidden MUST be indistinguishable, to
the bridge's own bookkeeping, from removing it because the device disappeared: the
accessory is removed and its identifier freed, so unhiding recreates it cleanly.

Hiding a device MUST NOT change the bridge's identity or the derivation of any
accessory's identity, so an existing pairing survives and an unhidden device
returns as the same accessory rather than a new one.

#### Scenario: A hidden device is never bridged

- **WHEN** the bridge starts and one device is already hidden
- **THEN** no accessory is created for it, and every visible device is bridged

#### Scenario: Hiding removes the accessory promptly

- **WHEN** a bridged device is hidden and reports no further state
- **THEN** its accessory is removed from the bridge without waiting for device
  activity and without a restart

#### Scenario: Unhiding restores the same accessory

- **WHEN** a hidden device is unhidden
- **THEN** an accessory is added back with the same derived identity it had before,
  and the Home app controls it without re-pairing

#### Scenario: Pairing is unaffected

- **WHEN** devices are hidden and unhidden repeatedly
- **THEN** the bridge identity is unchanged and no re-pairing is required

### Requirement: Zigbee Groups Are Bridged Like Any Other Device

A discovered Zigbee group MUST be eligible for exposure as a HomeKit accessory on
the same terms as any other device: it is bridged when its capabilities map onto a
supported HomeKit service, and skipped when they do not.

Commanding a group accessory MUST dispatch a command to the group, which the bridge
issues through the shared device model exactly as it does for any other device. The
bridge MUST NOT command the group's members individually.

Because a group's capabilities are the intersection of its members', a group whose
members share no HomeKit-mappable capability MUST be skipped rather than bridged as
an accessory with no controls.

#### Scenario: A lamp group becomes one accessory

- **WHEN** a group of three bulbs is discovered and its members are hidden
- **THEN** the Home app shows one accessory for the group and none for the bulbs

#### Scenario: Commanding the group accessory commands the group

- **WHEN** a user turns the group accessory on
- **THEN** one command is dispatched to the group, not one per member

#### Scenario: A group with no mappable capability is skipped

- **WHEN** a group's intersected capabilities map onto no supported HomeKit service
- **THEN** no accessory is created for it, and the omission is logged

### Requirement: State Toggle Configuration

State toggles MUST be configured at engine level rather than as an option of the
HomeKit service, because they are consumed by every device source consumer and
not only by the HomeKit bridge.

Configuring a state toggle MUST NOT require the HomeKit bridge to be enabled, and
disabling the bridge MUST NOT remove a toggle from any other consumer.

The bridge MUST continue to present configured toggles as HomeKit switches with
the same accessory identifiers as before the relocation, so that an existing
pairing is unaffected.

#### Scenario: Toggles survive HomeKit being disabled

- **WHEN** state toggles are configured and the HomeKit bridge is disabled
- **THEN** the toggles remain enumerable and controllable through the shared
  device sources

#### Scenario: Relocation does not disturb existing accessories

- **WHEN** an engine with an already-paired bridge is upgraded and its state
  toggles are moved to engine-level configuration
- **THEN** the corresponding switch accessories keep their identifiers and the
  Home app continues to control them without re-pairing

### Requirement: Zigbee Accessory Source

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

### Requirement: Shelly Accessory Source

Shelly bridging MUST be provided by a `ShellySource` implementing
`AccessorySource`. On `start(sink)` it MUST replay `ShellyService.getDevices()`,
subscribe to `ShellyService.onDeviceRegistered`, build accessories via the Shelly
accessory factory, start a global HTTP polling loop scoped to HTTP-transport
devices, and subscribe to per-device MQTT topics for each MQTT-transport
device (see "Shelly MQTT Push Status" and "Shelly MQTT Presence"). HomeKit
write-back MUST route to `ShellyService` methods (`turnOn` / `turnOff` for
switches/outlets; `coverGoToPosition` / `coverStop` for covers) regardless of
the device's transport. On `stop()` it MUST clear the poll interval, detach
the registration listener, and unsubscribe any per-device MQTT topic
subscriptions for MQTT-transport devices.

Because Shelly devices are registered by automations after the service lifecycle
starts, `ShellySource` MUST react to registration events rather than relying on a
start-time snapshot, so devices registered at any time are bridged.

#### Scenario: Shelly device registered after bridge start is bridged

- **WHEN** an automation calls `shelly.register(name, host, { type })` after the
  HomeKit bridge has started
- **THEN** `onDeviceRegistered` fires and `ShellySource` builds and adds the
  corresponding accessory through the sink

#### Scenario: MQTT-transport device registered after bridge start is bridged

- **WHEN** an automation registers an MQTT-transport device after the HomeKit
  bridge has started
- **THEN** `onDeviceRegistered` fires, `ShellySource` builds and adds the
  accessory through the sink, and subscribes to that device's MQTT status and
  presence topics instead of adding it to the poll loop

#### Scenario: Write-back to a Shelly switch

- **WHEN** the Home app toggles a Shelly switch or outlet accessory
- **THEN** `ShellySource` calls `ShellyService.turnOn` or `turnOff` for that
  device, regardless of whether that device is HTTP- or MQTT-transport

#### Scenario: Write-back to a Shelly cover

- **WHEN** the Home app sets a target position on a Shelly cover accessory
- **THEN** `ShellySource` calls `ShellyService.coverGoToPosition` with the
  requested position, regardless of transport

#### Scenario: Stopping detaches MQTT subscriptions

- **WHEN** `ShellySource.stop()` runs while one or more MQTT-transport devices
  are bridged
- **THEN** their per-device MQTT status and presence subscriptions are removed
  in addition to clearing the HTTP poll interval

### Requirement: Shelly State Polling

`ShellySource` MUST keep HTTP-transport devices' HomeKit characteristics fresh
via a single global polling loop over HTTP. The interval MUST be configurable
via a global `pollIntervalMs` option (default 10000 ms). Each tick MUST
iterate the current list of HTTP-transport Shelly devices only, call
`Switch.GetStatus` or `Cover.GetStatus` as appropriate, normalize the result,
and push it to the accessory's `updateState`. A failed status call for one
device MUST NOT abort the tick for other devices; it MUST be caught, logged,
and skipped. MQTT-transport devices MUST NOT be included in the poll loop.

#### Scenario: Physical change appears in HomeKit within one interval

- **WHEN** an HTTP-transport Shelly device changes state outside HomeKit (e.g.
  a physical switch press)
- **THEN** the next poll tick reads the new status and updates the
  corresponding HomeKit characteristic

#### Scenario: Unreachable device does not break the loop

- **WHEN** one HTTP-transport Shelly device is unreachable during a poll tick
- **THEN** the error is caught and logged, and other devices are still polled

#### Scenario: Device registered later joins the poll loop

- **WHEN** an HTTP-transport Shelly device is registered after the loop has
  started
- **THEN** subsequent ticks include it because the loop iterates the live
  device list

#### Scenario: MQTT-transport devices are excluded from polling

- **WHEN** the poll loop ticks and both HTTP- and MQTT-transport devices are
  registered
- **THEN** only the HTTP-transport devices are queried over HTTP; MQTT-transport
  devices are not polled

### Requirement: Shelly MQTT Push Status

For each MQTT-transport Shelly device, `ShellySource` MUST subscribe to that
device's `<topicPrefix>/events/rpc` topic and, on receiving a `NotifyStatus`
notification frame, normalize the relevant component status from its
`params` and push it to the accessory's `updateState` — mirroring the shape
of data pushed by the HTTP poll loop for HTTP-transport devices, but
event-driven instead of interval-driven.

#### Scenario: Push update reflected in HomeKit

- **WHEN** an MQTT-transport device publishes a `NotifyStatus` notification
  reporting a switch or cover state change
- **THEN** the corresponding HomeKit characteristic is updated without waiting
  for any polling interval

#### Scenario: Malformed notification is skipped safely

- **WHEN** a `NotifyStatus` notification is received with an unexpected or
  missing component payload
- **THEN** the notification is logged and skipped without affecting other
  devices or crashing the source

### Requirement: Shelly MQTT Presence

For each MQTT-transport Shelly device, `ShellySource` MUST subscribe to that
device's `<topicPrefix>/online` topic (the device's LWT-backed presence
topic) and mark the corresponding accessory reachable or unreachable based on
its `true`/`false` payload.

#### Scenario: Device going offline is reflected

- **WHEN** an MQTT-transport device publishes `false` (directly, or via its
  LWT after an abrupt disconnect) on its `online` topic
- **THEN** `ShellySource` marks the corresponding accessory as unreachable

#### Scenario: Device coming back online is reflected

- **WHEN** an MQTT-transport device publishes `true` on its `online` topic
  after having been marked unreachable
- **THEN** `ShellySource` marks the corresponding accessory as reachable again

### Requirement: Shelly Accessory Factory

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

### Requirement: WindowCovering Support

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

### Requirement: Requirements

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

### Requirement: ServicePlugin Implementation

The service MUST implement `ServicePlugin`:
- `readonly serviceKey = "homekit"`
- `onStart(ctx: CoreContext)` — Lazy-load hap-nodejs, create bridge, register accessories
- `onStop()` — Unpublish bridge, detach listeners, clear accessories
- `registerRoutes(app: Hono)` — Mount `GET /api/homekit/status`

### Requirement: Startup Behavior

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

### Requirement: Accessory Creation

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

### Requirement: Dynamic Device Management

When a new device joins the network:
- `onDeviceAdded` fires → `addAccessory(device)` creates and bridges the accessory

When a device leaves the network:
- `onDeviceRemoved` fires → `removeAccessory(device)` removes the accessory and detaches listeners

### Requirement: Shutdown

`onStop()` MUST:

1. Call `stop()` on every accessory source (detaching listeners, clearing poll
   intervals)
2. Clear the accessory map
3. Call `bridge.unpublish()`
4. Set `published = false` and `bridge = null`

#### Scenario: Poll loop cleared on shutdown

- **WHEN** `onStop()` runs while a Shelly poll loop is active
- **THEN** the poll interval is cleared and no further HTTP polls occur

### Requirement: Status API

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

### Requirement: Crypto Polyfill

The system MUST load a crypto polyfill for Bun compatibility before importing `hap-nodejs`, because Bun does not support the `chacha20-poly1305` cipher used by HAP.

### Requirement: Color Conversion

The factory MUST convert CIE xy color space (used by HomeKit) to hue/saturation (used by Zigbee2MQTT) and vice versa, enabling color light control through the Home app.
