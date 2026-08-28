## Why

`DeviceCatalogSource.addOrUpdate()` calls `accessory.updateReachability(descriptor.reachable)`
before the accessory has been bridged (`sink.add()`, which triggers
`bridge.addBridgedAccessory()`, runs afterward). hap-nodejs's `updateReachability()`
throws `"Cannot update reachability on non-bridged accessory!"` whenever
`accessory.bridged` is still `false`, which it always is at that point — so this
throws for the very first device on every startup. The thrown error aborts
`HomekitService.onStart()` before `bridge.publish()` is ever called, so the
`homekit` spec's already-documented "Startup Behavior" requirement (sources
start, then `bridge.publish()` resolves, then `published = true`) is violated:
the bridge never publishes and no accessories are ever exposed to HomeKit,
even though `ServiceRegistry.startAll()` catches and logs the error so the
rest of the engine keeps running.

Separately, in the installed `hap-nodejs@^0.14.3`, `Accessory.prototype.updateReachability`
is documented `@deprecated Not supported anymore` — it is a no-op beyond
setting a local field, regardless of call order. Reordering the calls would
stop the crash but would not restore any real reachability signalling to the
Home app, since the underlying API has no effect either way. `descriptor.reachable`
is already threaded through `device-event-bridge.ts` to the web UI (device
tiles and controls already reflect unreachable devices), so no user-facing
behavior is lost by removing the dead HAP call.

## What Changes

- Remove both `accessory.updateReachability(descriptor.reachable)` calls in
  `src/core/services/homekit-sources/device-catalog-source.ts` (the
  new-accessory path and the existing-accessory update path). This eliminates
  the startup crash and the two now-provably-dead calls to a deprecated,
  always-no-op hap-nodejs API.
- Add a regression test that builds a real accessory via
  `createAccessoryFromDescriptor` (not the wholesale-mocked
  `DeviceCatalogSource` used by `tests/homekit-service.test.ts`) and drives it
  through `DeviceCatalogSource.addOrUpdate()` for both the initial-add and
  update paths, asserting no exception is thrown and the accessory is bridged.

## Capabilities

No requirement-level behavior changes: this restores the `homekit` capability's
existing "Startup Behavior" requirement (sources start successfully and
`bridge.publish()` is reached), which the current code already violates as a
bug rather than as designed behavior. `skip_specs: true` is set in
`.openspec.yaml` accordingly.

## Impact

- `src/core/services/homekit-sources/device-catalog-source.ts` — two-line
  deletion.
- New/updated test coverage exercising the real `hap-nodejs` `Accessory` +
  `DeviceCatalogSource` seam that the current mocked test suite does not
  cover.
- No API, schema, or config changes. No breaking changes.
