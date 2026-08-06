## 1. Config

- [x] 1.1 Add `mqtt.shellyRpcSrc` (or similar) config key to `src/config.ts`
      with a sensible default, for the `src` value used in Shelly MQTT RPC
      requests
- [x] 1.2 Document the new env var in `.env.example`

## 2. Types

- [x] 2.1 Add `transport: "http" | "mqtt"` to `ShellyDevice` in
      `src/core/services/shelly-service.ts`
- [x] 2.2 Add `topicPrefix?: string` to `ShellyDevice` (present when
      `transport === "mqtt"`, absent/undefined for `"http"`)
- [x] 2.3 Define the MQTT RPC request/response/notification frame shapes
      (`ShellyMqttRpcRequest`, `ShellyMqttRpcResponse`,
      `ShellyMqttNotification`) in `src/types/shelly.ts`

## 3. ShellyService construction

- [x] 3.1 Change `ShellyService` constructor to accept `(http, mqtt, logger)`
- [x] 3.2 Define `ShellyServiceContext` and `ShellyServiceFactory` types
- [x] 3.3 Update `src/core/engine.ts` to special-case the `shelly` service
      factory like `homekit` (pass `ShellyServiceContext`), ensuring `mqtt`
      exists before resolving `shelly`
- [x] 3.4 Update `src/index.ts` exports if `ShellyServiceContext` /
      `ShellyServiceFactory` need to be public

## 4. Registration API

- [x] 4.1 Add the object-form `register(name, { type?, transport: "mqtt",
      topicPrefix })` overload; dispatch on `typeof` of the second argument
- [x] 4.2 Ensure the existing 2-arg/3-arg string overloads set
      `transport: "http"` on the stored device
- [x] 4.3 Extend `registerMany()` to accept mixed HTTP/MQTT entries in array
      form; keep `Record<string, string>` as HTTP-only shorthand
- [x] 4.4 Update `getDevices()` docs/JSDoc to mention `transport`/`topicPrefix`

## 5. MQTT RPC transport

- [x] 5.1 Implement request `id` counter + `Map<id, {resolve, reject,
      timer}>` pending-request tracker on `ShellyService`
- [x] 5.2 Subscribe once to `<configured-src>/rpc` (lazily on first MQTT
      device registration, or eagerly at construction — pick one and be
      consistent) and dispatch incoming frames by `id`
- [x] 5.3 Implement `mqttRpc<T>(name, method, params)`: publish request to
      `<topicPrefix>/rpc`, await correlated response with 5s timeout,
      validate `result`/`error` shape mirroring `httpRpc()`'s existing
      validation
- [x] 5.4 Split the existing private `rpc<T>()` into `httpRpc<T>()` (current
      behavior, renamed) and a dispatcher that routes to `httpRpc` or
      `mqttRpc` based on `device.transport`
- [x] 5.5 Ensure timeout/error messages follow the existing error message
      conventions (device name, identifier, method, cause)

## 6. ShellySource — push status & presence

- [x] 6.1 Filter the poll loop (`poll()`) to only iterate
      `device.transport === "http"` devices
- [x] 6.2 On registering an MQTT-transport device, subscribe to
      `<topicPrefix>/events/rpc`; parse `NotifyStatus` frames and push
      normalized state into `created.updateState()`
- [x] 6.3 On registering an MQTT-transport device, subscribe to
      `<topicPrefix>/online`; mark the accessory reachable/unreachable based
      on the boolean payload
- [x] 6.4 Track per-device MQTT subscription handles so `stop()` can
      unsubscribe them alongside clearing the poll interval and detaching
      `onDeviceRegistered`
- [x] 6.5 Handle malformed/unexpected `NotifyStatus` payloads by logging and
      skipping (no crash, no effect on other devices)

## 7. Tests

- [x] 7.1 Update `tests/shelly-service.test.ts` construction calls for the
      new `(http, mqtt, logger)` signature / `ShellyServiceContext`
- [x] 7.2 Add tests for the object-form `register()` overload and
      `registerMany()` with mixed transports
- [x] 7.3 Add tests for `mqttRpc()`: success, timeout, error-response,
      concurrent requests to different devices on the shared `<src>/rpc`
      subscription
- [x] 7.4 Update `tests/shelly-source.test.ts` for poll-loop filtering by
      transport, push-status handling, and presence handling
- [x] 7.5 Update `tests/homekit-shelly-factory.test.ts` if accessory
      creation/`CreatedAccessory` usage is affected by transport-awareness

## 8. Documentation

- [x] 8.1 Update `docs/services/shelly.md` with MQTT registration examples,
      the required on-device `MQTT.SetConfig` steps (`enable`, `server`,
      `enable_rpc`, `rpc_ntf`, `status_ntf`), and the new constructor/factory
      signature
- [x] 8.2 Note the breaking change (factory signature, constructor
      signature) prominently, e.g. in a changelog/migration note

## 9. Validation

- [x] 9.1 `bun run typecheck && bun run check && bun test`
- [x] 9.2 `openspec validate add-shelly-mqtt-transport --strict`
