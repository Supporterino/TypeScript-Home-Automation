## 1. Shelly types and service

- [x] 1.1 Add `ShellyDeviceType = "switch" | "outlet" | "cover"` to `src/types/shelly.ts` and add `type: ShellyDeviceType` to `ShellyDevice`
- [x] 1.2 Extend `ShellyService.register` to accept an optional `type` (default `"switch"`) via back-compatible overloads; store it on the device record
- [x] 1.3 Add `getDevices(): ShellyDevice[]` public read view to `ShellyService`
- [x] 1.4 Add a hand-rolled listener set + `onDeviceRegistered` / `offDeviceRegistered` to `ShellyService`; fire listeners in `register()` with try/catch-and-log isolation

## 2. Accessory source abstraction

- [x] 2.1 Define `AccessorySource` and `AccessorySink` interfaces (new file, e.g. `src/core/services/homekit-sources/accessory-source.ts`)
- [x] 2.2 Ensure `CreatedAccessory` is importable from a shared location for both factories

## 3. Zigbee source extraction

- [x] 3.1 Create `src/core/services/homekit-sources/zigbee-source.ts` implementing `AccessorySource`
- [x] 3.2 Move `addAccessory` / `removeAccessory` / state-handler logic from `HomekitService` into `ZigbeeSource.start(sink)` (replay `getDevices()`, subscribe `onDeviceAdded/Removed`, wire `onDeviceStateChange`, write-back via `mqtt.publishToDevice`)
- [x] 3.3 Implement `ZigbeeSource.stop()` to detach all registry and state listeners

## 4. Shelly accessory factory

- [x] 4.1 Create `src/core/services/homekit-shelly-factory.ts` with `buildShellyAccessory(device, onSet): CreatedAccessory | null`
- [x] 4.2 Implement `createShellySwitch` for `type: "switch"` (Service.Switch) and `type: "outlet"` (Service.Outlet), mapping `Switch.GetStatus.output` → `On`, and `On` write-back → onSet
- [x] 4.3 Implement `createShellyCover` (Service.WindowCovering): map `current_pos` → CurrentPosition, `state` → PositionState (opening=INCREASING, closing=DECREASING, else STOPPED), TargetPosition write → onSet
- [x] 4.4 Handle uncalibrated covers (`current_pos: null`) → report CurrentPosition 0 and log a calibration warning
- [x] 4.5 Generate a stable accessory UUID per Shelly device

## 5. Shelly source

- [x] 5.1 Create `src/core/services/homekit-sources/shelly-source.ts` implementing `AccessorySource`, constructed with the `ShellyService` handle and `pollIntervalMs`
- [x] 5.2 `start(sink)`: replay `shelly.getDevices()` and subscribe to `onDeviceRegistered`; build accessories via the Shelly factory; namespace accessory IDs by source
- [x] 5.3 Wire write-back: switch/outlet → `turnOn`/`turnOff`; cover → `coverGoToPosition` / `coverStop`
- [x] 5.4 Implement the global poll loop (single `setInterval`) iterating the live device list, calling `Switch.GetStatus` / `Cover.GetStatus`, normalizing, and calling `updateState`; catch/log/skip per-device errors
- [x] 5.5 `stop()`: clear the poll interval and detach the `onDeviceRegistered` listener

## 6. HomekitService becomes source host

- [x] 6.1 Add `pollIntervalMs?: number` (default 10000) to `HomekitServiceOptions`
- [x] 6.2 Add `shelly: ShellyService | null` to the `HomekitService` constructor
- [x] 6.3 Refactor `onStart()` to create the bridge, construct available sources (Zigbee when registry present, Shelly when shelly present), call each `source.start(sink)`, then publish; warn and skip if no sources
- [x] 6.4 Implement the `AccessorySink` (add → `addBridgedAccessory`, remove → `removeBridgedAccessory`, tracked in the accessory map keyed by namespaced id)
- [x] 6.5 Refactor `onStop()` to call `source.stop()` on all sources, clear the map, unpublish, reset state
- [x] 6.6 Update `getStatus()` to count accessories across all sources (unchanged semantics)

## 7. Engine wiring (breaking factory migration)

- [x] 7.1 Define `HomekitServiceContext` and change `HomekitServiceFactory` to `(ctx) => HomekitService` in `engine.ts`
- [x] 7.2 In `createEngine`, build the context object (`http`, `logger`, `mqtt`, `deviceRegistry`, `shelly`) and pass it to the factory / construct `HomekitService` with the shelly handle
- [x] 7.3 Update all docstrings and inline examples in `engine.ts` and `homekit-service.ts` to the new context-object form and constructor signature

## 8. Tests and verification

- [x] 8.1 Add tests for `ShellyService`: type on register, `getDevices()`, registration event fire/unsubscribe/error isolation
- [x] 8.2 Add tests for the Shelly factory: switch On mapping, cover position/state mapping, uncalibrated fallback
- [x] 8.3 Add a test for `ShellySource`: registration-after-start bridges an accessory; poll error isolation
- [x] 8.4 Add/adjust a `HomekitService` test for source add/remove wiring via the sink
- [x] 8.5 Run `bun run typecheck && bun run check && bun test` and fix any failures
