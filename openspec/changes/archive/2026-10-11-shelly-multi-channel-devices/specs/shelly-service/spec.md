# Shelly Service

## MODIFIED Requirements

### Requirement: Device Registration

`register(name, host, type?)` MUST:
- Store the device in an internal `Map<string, ShellyDevice>`
- Normalize the host: strip scheme (`http://`, `https://`), strip trailing slashes
- Accept IPs, hostnames, mDNS names, URLs, custom ports (`host:port`)
- Accept an optional device `type` of `"switch" | "outlet" | "cover"`, defaulting
  to `"switch"` when omitted (existing 2-argument calls remain valid)
- Store the `type` on the `ShellyDevice` record
- Store `transport: "http"` on the `ShellyDevice` record
- Fire all registered `onDeviceRegistered` listeners with the stored device
- Log device registration

`register(name, options)` where `options` is an object with
`transport: "mqtt"` MUST:
- Accept `{ type?: ShellyDeviceType; transport: "mqtt"; topicPrefix: string }`
- Store the device with `transport: "mqtt"` and the given `topicPrefix`, and
  no `host`
- Otherwise behave identically to the string-based overload (default `type`
  to `"switch"`, fire `onDeviceRegistered` listeners, log registration)

Registration MUST support materializing a multi-component device into one
logical device record per discovered component channel, through an internal
(non-public) mechanism used by the device source. The public `register()`
overloads and their signatures MUST remain unchanged. The source enumerates
components and registers each channel-scoped record; that record carries the
component channel it addresses.

Channel-scoped records MUST be held in a separate internal map and MUST NOT
appear in the public `getDevices()` view, which continues to return
registrations only. A channel-scoped record's `type` MUST be set to its
effective component kind — `cover` for a cover component, otherwise
`switch`/`outlet` inherited from the registration — so command dispatch and
status normalization read the right kind.

`registerMany(devices)` MUST:
- Accept `ShellyDevice[]` (mixed HTTP/MQTT entries) or a `Record<string, string>`
  (HTTP-only shorthand, unchanged)
- Call `register()` for each entry, dispatching to the string-based or
  object-based overload per entry's `transport`

#### Scenario: Register a device with an explicit type

- **WHEN** `register("blind", "192.168.1.5", "cover")` is called
- **THEN** the stored `ShellyDevice` has `type: "cover"` and `transport: "http"`

#### Scenario: Register defaults to switch

- **WHEN** `register("plug", "192.168.1.6")` is called with no type
- **THEN** the stored `ShellyDevice` has `type: "switch"` and `transport: "http"`

#### Scenario: Register an MQTT-transport device

- **WHEN** `register("garage_plug", { transport: "mqtt", topicPrefix: "shellyplus1-a8032abe54dc" })` is called
- **THEN** the stored `ShellyDevice` has `transport: "mqtt"`,
  `topicPrefix: "shellyplus1-a8032abe54dc"`, `type: "switch"` (defaulted), and no `host`

#### Scenario: Registration notifies listeners

- **WHEN** a device is registered (HTTP or MQTT) and a listener was added via
  `onDeviceRegistered`
- **THEN** the listener is invoked with the newly registered device

#### Scenario: Multi-component registration is materialized internally

- **WHEN** the device source discovers multiple components of a registered device
- **THEN** it materializes one channel-scoped device record per component, each
  carrying its component channel, without changing the public `register()` API

#### Scenario: Channel records stay out of the public inventory

- **WHEN** a multi-component device has been expanded into channel-scoped records
- **THEN** `getDevices()` still returns only the registrations, not the internal
  channel records

#### Scenario: Channel record carries its effective kind

- **WHEN** a channel-scoped record represents a cover component
- **THEN** its `type` is `"cover"`, and a switch component of an
  `outlet`-registered device yields `type: "outlet"`

### Requirement: Device Type Definition

The type `ShellyDeviceType = "switch" | "outlet" | "cover"` MUST be defined in
`src/types/shelly.ts`, and `ShellyDevice` MUST include a `type: ShellyDeviceType`
field.

`ShellyDevice` MUST additionally carry a component channel identifier, read by
the command methods to address the right component. A registration without an
explicit channel defaults to `0` for command purposes; channel-scoped records
materialized by the source carry their component's channel and are held in a
separate internal map (never in the public `getDevices()` view).

#### Scenario: Type is part of the device record

- **WHEN** a `ShellyDevice` is constructed
- **THEN** it carries a `type` field of `ShellyDeviceType`

#### Scenario: Channel is part of the device record

- **WHEN** a logical device representing channel 2 of a multi-component device
  is constructed
- **THEN** it carries a channel identifier distinguishing it from channels 0,
  1, and 3 of the same physical device

### Requirement: Switch Control

All switch methods MUST operate on a specific component channel rather than a
hardcoded `id: 0`. The channel MUST default to `0` when the device has only one
switch component, preserving existing behavior.

**`turnOn(name, toggleAfter?)`** — Turn switch on. Optional `toggleAfter` seconds auto-reverts.

**`turnOff(name, toggleAfter?)`** — Turn switch off. Optional `toggleAfter` seconds auto-reverts.

**`toggle(name)`** — Toggle the switch state.

All switch methods return `ShellySwitchSetResult` (contains the state BEFORE the command).

#### Scenario: Switch command targets the requested channel

- **WHEN** a switch command is issued for a logical device bound to channel 2
- **THEN** the RPC request carries `id: 2` and does not affect channels 0, 1, or 3

#### Scenario: Single-component switch defaults to channel zero

- **WHEN** a switch command is issued for a device with a single switch
  component and no explicit channel
- **THEN** the RPC request carries `id: 0`

### Requirement: Cover/Shutter Control

All cover methods MUST operate on a specific component channel rather than a
hardcoded `id: 0`. The channel MUST default to `0` when the device has only one
cover component.

**`coverOpen(name, duration?)`** — Open the cover. Optional `duration` (seconds) for partial open.

**`coverClose(name, duration?)`** — Close the cover. Optional `duration` for partial close.

**`coverStop(name)`** — Stop cover movement.

**`coverGoToPosition(name, position)`** — Move to absolute position 0–100. Clamped to valid range. Logs warning if clamping occurs.

**`coverMoveRelative(name, offset)`** — Move by relative offset (-100 to 100). Clamped. Logs warning if clamping occurs.

**`getCoverStatus(name)`** — Get current cover status (position, state, power).

**`getCoverConfig(name)`** — Get cover configuration.

**`coverCalibrate(name)`** — Start calibration. Logs warning.

**`getCoverPosition(name)`** — Get position 0–100 (null if uncalibrated).

**`getCoverState(name)`** — Get current state enum.

#### Scenario: Cover command targets the requested channel

- **WHEN** a cover command is issued for a logical device bound to a non-zero
  cover channel
- **THEN** the RPC request carries that channel's `id`

### Requirement: Status and Info

**`getStatus(name)`** — Get switch status including power metering (W, V, A, energy counters).

**`getConfig(name)`** — Get switch configuration.

**`getDeviceInfo(name)`** — Get device identification (model, firmware, MAC).

**`getSysStatus(name)`** — Get system status (uptime, RAM, available updates).

**`isOn(name)`** — Returns `true` if the switch output is on.

**`getPower(name)`** — Returns current power draw in Watts.

**`reboot(name, delayMs?)`** — Reboot the device. Optional delay in ms. Logs warning.

Switch status/config queries MUST target the logical device's own component
channel; multi-component devices MUST support querying each channel
independently. Device-level queries (`getDeviceInfo`, `getSysStatus`, `reboot`)
MUST remain device-scoped and unaffected by channel.

#### Scenario: Status is read from the logical channel

- **WHEN** `getStatus` is called for a logical device bound to channel 3
- **THEN** the returned status reflects channel 3's output, power, and energy,
  not channel 0's

#### Scenario: Device-level query is channel-independent

- **WHEN** `getDeviceInfo` is called for any channel of a device
- **THEN** the same device-level information is returned regardless of channel

### Requirement: Transport-Aware RPC Dispatch

Every command/status method on `ShellyService` (`turnOn`, `turnOff`, `toggle`,
`coverOpen`, `coverClose`, `coverStop`, `coverGoToPosition`,
`coverMoveRelative`, `getStatus`, `getCoverStatus`, `getConfig`,
`getCoverConfig`, `getDeviceInfo`, `getSysStatus`, `reboot`, etc.) MUST route
the underlying RPC call based on the target device's `transport` field:
- `transport: "http"` → the existing HTTP RPC path (`GET
  http://{host}/rpc/{method}?{params}`) — see "RPC Communication (HTTP
  Transport)"
- `transport: "mqtt"` → the MQTT RPC path — see "MQTT RPC Command Protocol"

No method signature changes based on transport — callers use the same public
API regardless of how a given device is registered. There is no automatic
fallback between transports: a call against an MQTT-transport device that
fails or times out MUST NOT be retried over HTTP, and vice versa.

The channel of the logical device MUST be threaded into the RPC params (`id`)
on both transports.

#### Scenario: Command routes to HTTP for an HTTP-transport device

- **WHEN** `turnOn("living_room_plug")` is called and that device was
  registered with `transport: "http"`
- **THEN** the command is sent via HTTP RPC exactly as before this change

#### Scenario: Command routes to MQTT for an MQTT-transport device

- **WHEN** `turnOn("garage_plug")` is called and that device was registered
  with `transport: "mqtt"`
- **THEN** the command is sent via the MQTT RPC channel and no HTTP request is made

#### Scenario: No fallback on MQTT failure

- **WHEN** an MQTT RPC command to an MQTT-transport device fails or times out
- **THEN** the call rejects with a descriptive error and is NOT retried over HTTP

#### Scenario: Channel travels over MQTT

- **WHEN** a command is issued for channel 1 of an MQTT-transport
  multi-component device
- **THEN** the published MQTT RPC request carries `id: 1` in its params

### Requirement: Types

The service uses typed response interfaces from `src/types/shelly.ts`:
- `ShellySwitchStatus` — output, apower, voltage, current, energy counters
- `ShellySwitchConfig` — name, initial state, auto-on/off timers
- `ShellySwitchSetResult` — state before command
- `ShellyCoverStatus` — state, current_pos, power, source
- `ShellyCoverConfig` — name, obverse/reverse limits, positioning
- `ShellyCoverState` — enum: "open", "closed", "opening", "closing", "stopped", "calibrating"
- `ShellyDeviceInfo` — model, fw_id, mac, gen
- `ShellySysStatus` — uptime, ram, fs, available_updates
- `ShellyTemperature` — tC, tF
- `ShellyMqttRpcRequest` — JSON-RPC 2.0 request frame (`id`, `src`, `method`, `params`)
- `ShellyMqttRpcResponse` — JSON-RPC 2.0 response frame (`id`, `src`, `result` or `error`)
- `ShellyMqttNotification` — MQTT status notification frame (e.g. `NotifyStatus`)
- `ShellyComponentsStatus` — a component-inventory response describing the
  switch/cover components a device exposes, including each component's key,
  kind (`switch` vs `cover`), channel identifier, configured name, and (when
  requested) status

The `ShellyDevice` record type MUST include a component channel identifier.

#### Scenario: Component inventory is typed

- **WHEN** a device's components are queried
- **THEN** the response is parsed into a typed inventory of switch and cover
  components with their channel identifiers
