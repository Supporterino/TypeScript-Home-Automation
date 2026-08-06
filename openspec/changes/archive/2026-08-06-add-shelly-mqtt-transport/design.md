## Context

See `proposal.md` for motivation. Relevant current state:

- `ShellyService` is constructed with `(http, logger)` and talks to devices
  exclusively via `GET http://{host}/rpc/{method}` (`shelly-service.ts:435`,
  `rpc<T>()`). Engine wiring (`engine.ts`) only special-cases the `homekit`
  service factory to receive a context object (`HomekitServiceContext`);
  `shelly`'s `ServiceFactory<T> = (http, logger) => T` has no access to
  `MqttService` today.
- `MqttService` already implements exact/wildcard topic dispatch and is always
  connected at engine startup (used today only for Zigbee2MQTT). It has no
  concept of request/response correlation — `publish()`/`subscribe()` are
  fire-and-forget/pub-sub only.
- `ShellySource` (`homekit-sources/shelly-source.ts`) runs one global
  `setInterval` poll loop over every registered device, regardless of whether
  status actually changed.
- Shelly Gen2 devices expose a native JSON-RPC 2.0 channel over MQTT
  (confirmed against Shelly's Gen2 docs): requests go to
  `<topicPrefix>/rpc`, and — notably — the **response topic is
  `<src>/rpc`, keyed by the caller-chosen `src` field, not by device**. This
  means one subscription (`<our-src>/rpc`) serves every in-flight request
  across all MQTT-transport devices; correlation is purely by request `id`.
  Devices also publish `NotifyStatus`/`NotifyEvent` on
  `<topicPrefix>/events/rpc`, and presence via LWT on `<topicPrefix>/online`.

## Goals / Non-Goals

**Goals:**
- Add MQTT as a second, explicit, per-device transport for `ShellyService`
  commands, with the exact same public method surface and result/error
  shapes as the existing HTTP transport.
- Eliminate polling for MQTT-transport devices in `ShellySource`, replacing it
  with `NotifyStatus` push + `online` LWT-based presence.
- Keep every existing HTTP-only call site (docs examples, tests,
  `registerMany({...})` shorthand) working unchanged.

**Non-Goals:**
- Automatic fallback between transports (explicitly rejected — see
  proposal). A device is either HTTP or MQTT; if that transport fails, the
  call fails.
- Per-call transport override (explicitly rejected — transport is fixed at
  registration).
- Device auto-discovery via `shellies/announce` (a real future possibility
  once MQTT identity exists, but out of scope here — devices are still
  registered explicitly by name/topicPrefix, exactly as HTTP devices are
  registered by name/host today).
- Simple "MQTT Control" pub/sub commands (`<prefix>/command/...`) as an
  alternative to the full RPC channel — rejected during exploration because
  it has strictly weaker guarantees (no ack, no structured error, no
  `was_on`-style result) than both HTTP RPC and RPC-over-MQTT for zero
  benefit.

## Decisions

### 1. `ShellyServiceContext` — breaking factory change, not `attachMqtt()`

Chosen over post-construction wiring (`attachMqtt()`) because the user
explicitly preferred consistency with the existing `HomekitServiceContext`
pattern over backward compatibility for the 2-arg factory. `engine.ts`'s
`shelly?: ShellyService | ServiceFactory<ShellyService>` becomes
`shelly?: ShellyService | ShellyServiceFactory` where
`ShellyServiceFactory = (ctx: ShellyServiceContext) => ShellyService`, mirroring
`HomekitServiceFactory`. Direct `new ShellyService(...)` instantiation (the
non-factory form) also changes shape — constructor takes `(http, mqtt,
logger)` — since MQTT-transport devices need the client from construction
time (device registration and MQTT RPC calls can happen before `attachMqtt`
would otherwise run).

### 2. `transport` is a field on `ShellyDevice`, fixed at registration

Simpler than a policy object or per-call parameter (rejected alternatives from
exploration). Every command method's internal `rpc()`-equivalent call reads
`device.transport` and dispatches to `httpRpc()` or `mqttRpc()`. No public
method signature changes.

### 3. `register()` grows an object-form overload rather than overloading `host`

```ts
register(name: string, host: string): void;
register(name: string, host: string, type: ShellyDeviceType): void;
register(name: string, options: {
  type?: ShellyDeviceType;
  transport: "mqtt";
  topicPrefix: string;
}): void;
```

Runtime dispatch is by `typeof` on the second argument (string vs object),
consistent with the existing overload-resolution style already used for
`type` defaulting. Rejected alternative: reusing the `host` slot to mean
"topic prefix" for MQTT devices — rejected because it's ambiguous at a
glance and risks a caller accidentally putting an IP address in the MQTT
slot with no type error to catch it.

### 4. MQTT RPC client: single shared response subscription, `Map<id, pending>`

```
publish(<topicPrefix>/rpc, {id, src, method, params})
                                   │
                    Map<id, {resolve, reject, timer}>.set(id, ...)
                                   │
subscribe(<configured-src>/rpc)  ─┴─▶ on message: look up id, resolve/reject, clear timer
```

- `id` is a monotonically increasing counter scoped to the `ShellyService`
  instance (not per-device — the response topic doesn't carry device
  identity in its topic, only in the frame's `src`/`dst`, so ids must not
  collide across concurrent requests to different devices).
- Timeout: fixed 5000ms (chosen for a local-network round trip with broker
  hop; not configurable in v1 — can be revisited if this proves too
  aggressive for slow devices/networks in practice).
- `src` is read from application config (new config key), not derived from
  `MqttService`'s existing internal `clientId` — kept independent so a
  deployment can choose a `src` without needing to know/depend on
  `MqttService`'s internal client id format.
- Result/error extraction mirrors the existing HTTP `rpc()` validation logic
  (`shelly-service.ts:454-465`): a response with `error` rejects with a
  descriptive `Error`; a response with `result` resolves; anything else is
  treated as a protocol violation and rejected.

### 5. `ShellySource`: split poll set vs. push set by transport

`ShellySource` already reacts to `onDeviceRegistered` and iterates
`shelly.getDevices()` per poll tick. The tick's device iteration is filtered
to `device.transport === "http"`. For each MQTT-transport device, on
registration `ShellySource` additionally subscribes to
`<topicPrefix>/events/rpc` (status) and `<topicPrefix>/online` (presence),
storing the unsubscribe handles alongside the existing per-device accessory
entry so `stop()` and future device removal can clean them up symmetrically
with how the poll loop and registration listener are already cleaned up.

## Risks / Trade-offs

- **[Risk]** MQTT RPC has no HTTP-equivalent status code — a device that
  never responds and a device that's simply slow look identical until the
  5s timeout fires, so genuine failures are slower to surface than an HTTP
  connection-refused error. → **Mitigation**: none needed for v1 given no
  fallback is in scope; documented behavior, consistent with the "explicit
  per-device transport, no fallback" decision.
- **[Risk]** Devices must have `MQTT.SetConfig` (`enable`, `server`,
  `enable_rpc`, `rpc_ntf`, `status_ntf`) configured on-device out-of-band —
  this is a manual per-device setup step outside this codebase's control,
  with no in-app way to verify a device is even MQTT-reachable before a
  command is attempted. → **Mitigation**: rely on the existing "Shelly device
  is not registered" style error messaging pattern extended with clear MQTT
  timeout errors; document the required device-side MQTT setup in
  `docs/services/shelly.md`.
- **[Risk]** `src` collisions across independently-deployed app instances
  sharing one broker would cause cross-talk (one instance receiving another's
  RPC responses). → **Mitigation**: `src` is configurable precisely to let
  operators pick distinct values; document this requirement prominently.
- **[Trade-off]** Breaking the `shelly` factory signature requires every
  existing consumer (including this repo's own docs/tests) to update. Accepted
  because the API is still young and the alternative (`attachMqtt()`) was
  explicitly rejected in favor of consistency with `HomekitServiceContext`.

## Migration Plan

1. Land `ShellyServiceContext`/constructor change, `transport` field, and
   `register()` overload first (additive to `ShellyDevice`, but breaking to
   the constructor/factory) — all existing HTTP-only behavior must be
   provably unchanged (existing tests continue to pass with updated
   construction calls).
2. Add MQTT RPC dispatch (`mqttRpc()`) and wire `httpRpc()`/`mqttRpc()`
   selection by `device.transport`.
3. Update `ShellySource` to filter the poll loop and add push
   status/presence subscriptions for MQTT-transport devices.
4. Update `docs/services/shelly.md` with MQTT registration examples and the
   required on-device `MQTT.SetConfig` steps.
5. No data migration needed — this only affects in-memory device
   registration at process startup, not persisted state.

No automated rollback mechanism is needed beyond reverting the change: there
is no persisted schema change, only code and documentation.
