## Why

`ShellyService` currently only speaks the Shelly Gen2 HTTP RPC API. Every device
must be reachable by a known IP/hostname, and `ShellySource` polls every
registered device's status over HTTP every 10 seconds regardless of whether
anything changed — real-world state changes (a plug turning on, a cover
finishing its move) show up in HomeKit with up to 10s of latency. We already
run an MQTT broker for Zigbee2MQTT, and Shelly Gen2 devices natively support a
full JSON-RPC channel over MQTT (same method vocabulary as the HTTP RPC API:
`Switch.Set`, `Cover.GoToPosition`, etc.) plus push notifications
(`NotifyStatus`) and an online/offline LWT topic. Adding MQTT as an explicit,
opt-in transport lets devices be identified by their MQTT topic prefix instead
of a static IP, and lets MQTT-transport devices get instant push status
instead of being polled.

## What Changes

- **BREAKING**: `ShellyService`'s service-factory signature changes from
  `(http, logger) => ShellyService` to a context object
  `(ctx: ShellyServiceContext) => ShellyService` where
  `ShellyServiceContext = { http, mqtt, logger }`, mirroring the existing
  `HomekitServiceContext` pattern used for `homekit`.
- Add a `transport: "http" | "mqtt"` field to `ShellyDevice`, fixed per device
  at registration time (no per-call override, no automatic fallback between
  transports).
- Add a new object-form overload to `register()` for MQTT devices:
  `register(name, { type?, transport: "mqtt", topicPrefix })`. Existing
  2-arg/3-arg string-based calls (`register(name, host)`,
  `register(name, host, type)`) continue to work unchanged as sugar for
  `{ transport: "http", host }`.
- Extend `registerMany()` to accept the richer per-device shape (the current
  `Record<string, string>` shorthand remains HTTP-only).
- Implement RPC-over-MQTT command dispatch: publish JSON-RPC requests to
  `<topicPrefix>/rpc`, correlate responses on a single shared
  `<src>/rpc` subscription by request `id`, with a fixed 5s timeout per call.
  The `src` value used for all MQTT RPC requests is configurable (env
  var/config), to avoid response cross-talk between multiple app instances
  sharing a broker.
- All existing switch/cover/status/info methods (`turnOn`, `turnOff`,
  `toggle`, `coverOpen`, `coverClose`, `coverStop`, `coverGoToPosition`,
  `coverMoveRelative`, `getStatus`, `getCoverStatus`, `getConfig`,
  `getCoverConfig`, `getDeviceInfo`, `getSysStatus`, `reboot`, etc.) route
  transparently to HTTP or MQTT based on the device's registered transport —
  no public API changes to method signatures.
- `ShellySource` (HomeKit bridge) stops polling MQTT-transport devices:
  subscribes to `<topicPrefix>/events/rpc` for `NotifyStatus` push updates
  instead. HTTP-transport devices keep the existing 10s poll loop unchanged
  (mixed-transport fleets are supported).
- `ShellySource` marks MQTT-transport accessories unreachable/reachable based
  on the device's `<topicPrefix>/online` LWT topic.

## Capabilities

### Modified Capabilities
- `shelly-service`: Adds an MQTT transport alongside the existing HTTP
  transport — device registration gains a `transport` field and MQTT-specific
  identity (`topicPrefix`), RPC dispatch routes per-device to HTTP or MQTT,
  and the service-factory signature changes to receive `mqtt` in addition to
  `http`/`logger`.
- `homekit`: `ShellySource`'s polling loop becomes transport-aware — only
  HTTP-transport devices are polled; MQTT-transport devices are bridged via
  push `NotifyStatus` updates and marked reachable/unreachable from the
  `online` LWT topic instead.

## Impact

- `src/core/services/shelly-service.ts` — constructor/factory signature,
  `ShellyDevice` type, `register()`/`registerMany()` overloads, internal
  `rpc()` dispatch split into `httpRpc()`/`mqttRpc()`, new MQTT
  request/response correlation map + timeout handling.
- `src/core/engine.ts` — `ServiceFactory<ShellyService>` special-cased like
  `HomekitServiceFactory`; construction order must ensure `mqtt` exists before
  resolving the `shelly` service.
- `src/core/services/homekit-sources/shelly-source.ts` — push-based status
  path for MQTT devices (subscribe `events/rpc`, `online` LWT), poll loop
  scoped to HTTP-transport devices only.
- `src/types/shelly.ts` — no new response types expected (MQTT RPC reuses the
  same result shapes as HTTP RPC), but `ShellyDevice`/registration option
  types grow.
- `src/config.ts` — new config value for the MQTT RPC `src` identifier.
- Documentation (`docs/services/shelly.md`) and existing tests
  (`tests/shelly-service.test.ts`, `tests/shelly-source.test.ts`,
  `tests/homekit-shelly-factory.test.ts`) need updates for the new
  constructor signature and transport-aware behavior.
- Any downstream consumer using
  `shelly: (http, logger) => new ShellyService(http, logger)` in their own
  `createEngine()` config must update to the new context-object factory
  signature.
