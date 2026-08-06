# Shelly Service

## Purpose

Controls Shelly Gen 2 devices (Plus, Pro series) over either their local HTTP RPC API or the Shelly Gen2 RPC-over-MQTT protocol, selected per device via a `transport` field. Supports switch control (on/off/toggle), cover/shutter control (open/close/stop/position/calibrate), and device status queries (power metering, system info).

## Requirements

### Device Registration

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

### Device Inventory Read Access

`ShellyService` MUST expose a public read view of registered devices via
`getDevices(): ShellyDevice[]`, returning all currently registered devices with
their `name`, `type`, `transport`, and either `host` (HTTP-transport) or
`topicPrefix` (MQTT-transport).

#### Scenario: Enumerate registered devices

- **WHEN** two devices have been registered and `getDevices()` is called
- **THEN** it returns both devices including their normalized host and type

### Registration Event Listeners

`ShellyService` MUST allow consumers to subscribe to device registrations so they
can react to devices registered at any time (including after service startup):

- `onDeviceRegistered(cb: (device: ShellyDevice) => void): void`
- `offDeviceRegistered(cb): void`

Listeners MUST be invoked synchronously when `register()` stores a device. Errors
thrown by a listener MUST be caught and logged without preventing other listeners
from running.

#### Scenario: Subscribe and receive future registrations

- **WHEN** a consumer adds a listener via `onDeviceRegistered`, then a device is
  registered
- **THEN** the listener receives the registered device

#### Scenario: Unsubscribe stops notifications

- **WHEN** a listener is removed via `offDeviceRegistered` and a device is then
  registered
- **THEN** the removed listener is not invoked

#### Scenario: Listener error is isolated

- **WHEN** one listener throws during a registration
- **THEN** the error is caught and logged and remaining listeners still run

### Device Type Definition

The type `ShellyDeviceType = "switch" | "outlet" | "cover"` MUST be defined in
`src/types/shelly.ts`, and `ShellyDevice` MUST include a `type: ShellyDeviceType`
field.

#### Scenario: Type is part of the device record

- **WHEN** a `ShellyDevice` is constructed
- **THEN** it carries a `type` field of `ShellyDeviceType`

### Switch Control

All switch methods operate on component `id: "0"`.

**`turnOn(name, toggleAfter?)`** — Turn switch on. Optional `toggleAfter` seconds auto-reverts.

**`turnOff(name, toggleAfter?)`** — Turn switch off. Optional `toggleAfter` seconds auto-reverts.

**`toggle(name)`** — Toggle the switch state.

All switch methods return `ShellySwitchSetResult` (contains the state BEFORE the command).

### Cover/Shutter Control

All cover methods operate on component `id: "0"`.

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

### Status and Info

**`getStatus(name)`** — Get switch status including power metering (W, V, A, energy counters).

**`getConfig(name)`** — Get switch configuration.

**`getDeviceInfo(name)`** — Get device identification (model, firmware, MAC).

**`getSysStatus(name)`** — Get system status (uptime, RAM, available updates).

**`isOn(name)`** — Returns `true` if the switch output is on.

**`getPower(name)`** — Returns current power draw in Watts.

**`reboot(name, delayMs?)`** — Reboot the device. Optional delay in ms. Logs warning.

### Service Construction Receives MQTT

`ShellyService` MUST be constructed with (or otherwise gain access to) both an
`HttpClient` and a `MqttService`, in addition to its `Logger`, so it can route
commands over either transport. When used as an engine service factory, the
factory signature MUST be a single context object:

```ts
interface ShellyServiceContext {
  http: HttpClient;
  mqtt: MqttService;
  logger: Logger;
}
type ShellyServiceFactory = (ctx: ShellyServiceContext) => ShellyService;
```

#### Scenario: Factory receives a context object

- **WHEN** the engine resolves a function-form `shelly` service
- **THEN** it invokes the factory with a single `ShellyServiceContext` object
  containing `http`, `mqtt`, and `logger`

### Transport-Aware RPC Dispatch

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

### MQTT RPC Command Protocol

For MQTT-transport devices, the system MUST implement the Shelly Gen2
RPC-over-MQTT protocol:
- Publish a JSON-RPC 2.0 request (`{ id, src, method, params }`) to
  `<topicPrefix>/rpc`
- The `src` value used in every MQTT RPC request MUST be a single value
  configurable via application configuration (env var/config), so multiple
  application instances sharing one broker can use distinct `src` values and
  avoid receiving each other's responses
- Subscribe once to `<src>/rpc` (not per-device) and correlate incoming
  response frames to pending requests by their `id`
- Requests MUST have a fixed 5-second timeout; if no response frame with a
  matching `id` arrives within that window, the pending call MUST reject with
  a descriptive `Error` identifying the device name, `topicPrefix`, method,
  and timeout duration, and the pending entry MUST be removed
- A response frame containing an `error` object MUST cause the call to reject
  with a descriptive `Error`, mirroring the existing HTTP RPC error-handling
  behavior (device name, `topicPrefix`, method, and the error payload)
- A response frame containing a `result` object MUST resolve the call with
  that `result`, typed identically to the equivalent HTTP RPC response

#### Scenario: Successful MQTT RPC round-trip

- **WHEN** an MQTT-transport device publishes a response frame with a matching
  `id` and a `result` object before the timeout elapses
- **THEN** the pending call resolves with that `result`

#### Scenario: MQTT RPC timeout

- **WHEN** no response frame with a matching `id` arrives within 5 seconds
- **THEN** the pending call rejects with a descriptive `Error` naming the
  device, `topicPrefix`, method, and timeout duration, and the pending entry
  is cleaned up

#### Scenario: MQTT RPC error response

- **WHEN** a response frame arrives with an `error` object instead of `result`
- **THEN** the pending call rejects with a descriptive `Error` including the
  device name, `topicPrefix`, method, and the error payload

#### Scenario: Shared response subscription serves multiple devices

- **WHEN** RPC requests are in flight to two different MQTT-transport devices
  concurrently
- **THEN** both responses are received on the single shared `<src>/rpc`
  subscription and are correctly routed to their respective pending calls by
  `id`

### RPC Communication (HTTP Transport)

This section applies to devices registered with `transport: "http"`. For
`transport: "mqtt"` devices, see "MQTT RPC Command Protocol" above.

The system MUST construct RPC URLs as `http://{host}/rpc/{Method}?{params}`.

All RPC calls use HTTP GET with URL-encoded query parameters.

The system MUST throw an `Error` with a descriptive message on non-OK responses, including the device name, host, RPC method, and HTTP status.

Before using the parsed response body, the system MUST validate that it has the expected shape for the RPC method (e.g. a status response has the expected fields). If the body is missing, is not an object, or is a Shelly RPC error object (e.g. `{ error: ... }`) returned with an HTTP `200`, the system MUST throw a descriptive `Error` (including device name, host, and method) rather than casting the body blindly to the typed shape and returning `undefined`/`NaN` to callers.

#### Scenario: Error body on HTTP 200 is rejected

- **WHEN** a Shelly device returns an RPC error object with HTTP status `200`
- **THEN** the system throws a descriptive error rather than returning an invalid/`undefined` result to the caller

#### Scenario: Unexpected-shape body is rejected

- **WHEN** the parsed RPC response is not an object or lacks the expected fields
- **THEN** the system throws a descriptive error identifying the device, host, and method

### Error Handling

- Unregistered device → throw `Error`: `Shelly device "X" is not registered. Call shelly.register("X", "<ip>") first.`
- HTTP failure → throw `Error`: `Shelly RPC {method} failed for "{name}" ({host}): HTTP {status}`
- All operational errors are logged via the child logger

### Types

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
