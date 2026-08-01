# HomeKit State Toggles

## Why

Automations already communicate through the shared `StateManager` (e.g. `night_mode`, `away_mode` booleans), but there is no way to observe or flip those values from a phone. Users want to expose any boolean state key as a simple toggle in Apple's Home app so automations become human-controllable without writing MQTT or HTTP glue.

## What Changes

- Add a `stateToggles` option to `HomekitServiceOptions` — a static list of `{ stateKey, name }` entries that each become a HomeKit `Switch` accessory.
- Add a `StateSource` implementing the existing `AccessorySource` interface:
  - **Freshness:** subscribes to `StateManager.onChange(key, …)` and pushes truthy/falsy reads into the accessory's `On` characteristic.
  - **Write-back:** flipping the toggle in the Home app calls `StateManager.set(key, boolean)`.
  - **Cleanup:** detaches all key listeners on `stop()`.
- Extend `HomekitServiceContext` with a `state: StateManager` handle and the `HomekitService` constructor accordingly.
- Bridge startup now also considers the state source: toggles are available even when neither the device registry nor a Shelly service is present.
- Document the new source and its configuration in `docs/services/homekit.md`.

No breaking changes to existing configuration or the source interface. The state source is additive — when `stateToggles` is empty it no-ops.

## Capabilities

### New Capabilities

- `homekit-state-toggles`: exposing boolean state keys from the shared `StateManager` as HomeKit switch toggles, including bidirectional sync and write-back.

### Modified Capabilities

- `homekit`: the `HomekitServiceOptions`, `HomekitServiceContext`, and bridge source-setup requirements change to include the new `state` dependency and state-toggle source.

## Impact

- `src/core/services/homekit-service.ts` — constructor signature, new `stateToggles` option, source construction, "no sources" startup gate.
- `src/core/services/homekit-sources/state-source.ts` — new `AccessorySource` implementation.
- `src/core/engine.ts` — `HomekitServiceContext` gains `state: StateManager`; factory call passes `stateManager`.
- `src/index.ts` — export the new source/config types if public.
- `docs/services/homekit.md` — configuration and source documentation.
- `tests/` — unit tests for the state source (freshness, write-back, cleanup, coercion).
- Depends on `hap-nodejs` (already bundled) and the existing `StateManager` (no new dependencies).
