## Why

The HomeKit bridge only exposes Zigbee2MQTT devices, because every layer of the
bridge is hardwired to the `DeviceRegistry` and Zigbee2MQTT payload shapes.
Shelly devices (plugs, in-wall switches, 2PM covers) are controlled over HTTP RPC
and are invisible in the Home app. Users who own both device families cannot
manage them from one place.

## What Changes

- Introduce a source-agnostic **accessory source** abstraction so the HomeKit
  bridge consumes devices from multiple providers instead of being tied to the
  Zigbee `DeviceRegistry`.
- Extract the existing Zigbee-specific bridging logic out of `HomekitService`
  into a `ZigbeeSource` (behavior preserved, code relocated).
- Add a `ShellySource` that bridges registered Shelly devices into HomeKit,
  keeping their state fresh via a global HTTP **polling loop** (HTTP-only, no MQTT),
  and routing HomeKit write-back to `ShellyService` methods.
- Add a Shelly-specific accessory factory producing `Switch`, `Outlet`, and
  **`WindowCovering`** HAP services. WindowCovering is net-new — the current
  factory has no cover support at all.
- Extend Shelly device registration with a device **type** (`"switch" | "outlet"
  | "cover"`, default `"switch"`) so HomeKit knows how to model each host from a
  single declaration.
- Give `ShellyService` a registration-event surface (`onDeviceRegistered` /
  `offDeviceRegistered`) plus a public `getDevices()` read view, mirroring the
  `DeviceRegistry` push model. This resolves a startup-ordering hazard: Shelly
  devices are registered by automations *after* `ServiceRegistry.startAll()`, so
  the bridge must react to registrations rather than snapshot them at start.
- **BREAKING**: Migrate the `homekit` service factory from positional args
  `(http, logger, mqtt, deviceRegistry)` to a single `HomekitServiceContext`
  object that also carries the `shelly` handle. The `HomekitService` constructor
  gains a `shelly` parameter.

## Capabilities

### New Capabilities
<!-- No brand-new capability specs; the work modifies existing homekit and shelly-service specs. -->

### Modified Capabilities
- `homekit`: Bridge becomes source-agnostic (consumes accessory sources rather
  than the `DeviceRegistry` directly); adds Shelly bridging via polling +
  write-back; adds WindowCovering support; factory/constructor signature change.
- `shelly-service`: `register` accepts a device `type`; adds `getDevices()` and
  registration-event listeners.

## Impact

- **Code**: `src/core/services/homekit-service.ts` (refactor to source host),
  new `src/core/services/homekit-shelly-factory.ts`, new
  `src/core/services/homekit-sources/shelly-source.ts` and `zigbee-source.ts`,
  `src/core/services/shelly-service.ts` (register/type/events),
  `src/core/engine.ts` (context-object wiring), `src/types/shelly.ts`
  (`ShellyDeviceType`).
- **APIs**: `HomekitServiceFactory` signature (breaking); `HomekitService`
  constructor (breaking); `ShellyService.register` gains optional `type` arg
  (back-compatible).
- **Dependencies**: none new — reuses `hap-nodejs`, existing `HttpClient`.
- **Behavior**: periodic outbound HTTP traffic to Shelly devices while the bridge
  runs; physical switch/cover changes appear in HomeKit within one poll interval.
