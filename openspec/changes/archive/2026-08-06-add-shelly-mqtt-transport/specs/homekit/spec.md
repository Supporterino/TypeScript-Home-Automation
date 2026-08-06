## MODIFIED Requirements

### Shelly Accessory Source

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

### Shelly State Polling

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

## ADDED Requirements

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
