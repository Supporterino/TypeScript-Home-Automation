## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Service Construction Receives MQTT

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

### Requirement: Transport-Aware RPC Dispatch

Every command/status method on `ShellyService` (`turnOn`, `turnOff`, `toggle`,
`coverOpen`, `coverClose`, `coverStop`, `coverGoToPosition`,
`coverMoveRelative`, `getStatus`, `getCoverStatus`, `getConfig`,
`getCoverConfig`, `getDeviceInfo`, `getSysStatus`, `reboot`, etc.) MUST route
the underlying RPC call based on the target device's `transport` field:
- `transport: "http"` → the existing HTTP RPC path (`GET
  http://{host}/rpc/{method}?{params}`)
- `transport: "mqtt"` → the MQTT RPC path (see "MQTT RPC Command Protocol")

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

### Requirement: MQTT RPC Command Protocol

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
