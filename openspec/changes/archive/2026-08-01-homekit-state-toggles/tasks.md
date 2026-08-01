# Tasks: HomeKit State Toggles

## 1. State toggle factory

- [x] 1.1 Create `src/core/services/homekit-state-factory.ts` with `buildStateToggleAccessory(name, stateKey, onSet)` returning `CreatedAccessory` — `Service.Switch` + `Characteristic.On`, UUID seeded from `uuid.generate("state:" + stateKey)`, category SWITCH, `onSet` forwarding the raw HomeKit boolean, `updateState` reusing `applySwitchState`
- [x] 1.2 Add unit tests `tests/homekit-state-factory.test.ts` using the lightweight HAP mock (On characteristic update maps to characteristic value; onSet forwards the boolean; UUID is stable per state key)

## 2. StateSource

- [x] 2.1 Create `src/core/services/homekit-sources/state-source.ts` implementing `AccessorySource` with `name = "state"` — builds one accessory per configured toggle, seeds from `state.get(key, false)` with truthy coercion, subscribes via `state.onChange`, routes write-back to `state.set(key, Boolean(value))`, warns and skips duplicate state keys
- [x] 2.2 Implement `stop()` detaching every subscribed `onChange` handler (tracked per state key)
- [x] 2.3 Add unit tests `tests/homekit-state-source.test.ts` — initial seed from existing state, missing key defaults OFF, state change updates characteristic, `state.delete` turns OFF, onSet writes a real boolean, stop detaches all listeners

## 3. HomekitService integration

- [x] 3.1 Add `StateToggleConfig` type and `stateToggles?: StateToggleConfig[]` option to `HomekitServiceOptions`
- [x] 3.2 Extend `HomekitService` constructor with a `state: StateManager` handle and store it
- [x] 3.3 Add the state source to `buildSources()` (built unconditionally; empty list no-ops)
- [x] 3.4 Update the `onStart()` early gate so a toggles-only bridge (no registry, no Shelly) still starts
- [x] 3.5 Update `HomekitServiceContext` (`engine.ts`) with `state: StateManager` and pass `stateManager` at the factory call site
- [x] 3.6 Export `StateToggleConfig` (and any new public types) from `src/index.ts`

## 4. Docs

- [x] 4.1 Document `stateToggles` configuration and the state source in `docs/services/homekit.md` (including an example and the updated constructor signature)

## 5. Verification

- [x] 5.1 Run `bun run typecheck`, `bun run check`, and `bun test` and fix any failures
