# Design: HomeKit State Toggles

## Context

The `HomekitService` is a source-agnostic HAP bridge host (see `openspec/specs/homekit/spec.md`). Accessory families plug in as `AccessorySource` implementations that own discovery, freshness, and write-back, interacting with the bridge only through an `AccessorySink`. Today there are two sources — `ZigbeeSource` (registry + MQTT) and `ShellySource` (HTTP polling). The engine already constructs the shared `StateManager` before services are resolved, so it is available to pass into the homekit factory context. Motivation in `proposal.md`.

## Goals / Non-Goals

**Goals:**

- Add a third `AccessorySource` that bridges configured `StateManager` boolean keys as HomeKit `Switch` accessories.
- Bidirectional sync: state changes update the Home app; Home app flips write back to `StateManager` (firing `state` triggers).
- Reuse the existing `CreatedAccessory`/`AccessorySink` contracts and the tested `applySwitchState` mapping helper.

**Non-Goals:**

- No runtime management API (static config only).
- No web-dashboard toggle UI (existing raw state view unchanged).
- No general virtual-accessory source (dimmers, sensors, numbers) — boolean toggles only for now.

## Decisions

### D1: New `StateSource` as an `AccessorySource`

Implement `src/core/services/homekit-sources/state-source.ts`:

```
StateSource(state, toggles, logger)
  start(sink)
    for each toggle → build accessory, seed, subscribe onChange
  stop()
    offChange every subscribed key
```

- `name = "state"` — sink IDs become `state:<stateKey>`, namespaced like `zigbee:`/`shelly:`.
- Toggles are replayed once at `start()`; there is no dynamic registration, so no callback for it.
- Per-key change handlers are tracked in a `Map<stateKey, handler>` for deterministic cleanup on `stop()`.

**Alternative considered:** adding an automation-facing API to register toggles at runtime (mirroring `ShellyService.register`). Rejected — the spec is static config, and a runtime API would pull `StateSource` into service-registry semantics it doesn't need.

### D2: Dedicated factory reusing existing helpers

Add `buildStateToggleAccessory` in a new `src/core/services/homekit-state-factory.ts`, mirroring `homekit-shelly-factory.ts` (separate factory file per family, unit-testable against the lightweight HAP mock):

```ts
buildStateToggleAccessory(
  name: string,
  stateKey: string,
  onSet: (value: boolean) => void,
): CreatedAccessory
```

- `new Accessory(name, uuid.generate("state:" + stateKey))`, category SWITCH.
- `Service.Switch` + `Characteristic.On`; `onSet` forwards the raw HomeKit boolean.
- `updateState` reuses the existing `applySwitchState(service, { state })` from `homekit-accessory-factory.ts` — no new mapping logic.
- UUID seeded from the state key so renames don't orphan accessories in the Home app.

**Alternative considered:** building the accessory inline inside `StateSource`. Rejected — the factory pattern keeps HAP wiring isolated and lets tests exercise the accessory without starting the source.

### D3: Wiring the `StateManager` through the engine

- Add `state: StateManager` to `HomekitServiceContext` (`engine.ts`) and pass `stateManager` at the factory call site (already constructed earlier in `createEngine()`).
- `HomekitService` constructor gains a `state: StateManager` handle (positional, matching the existing constructor style) plus the new `stateToggles?: StateToggleConfig[]` option.
- `buildSources()` appends `new StateSource(state, stateToggles, logger)` unconditionally; an empty list yields no accessories.
- Update the early startup gate in `onStart()` (`if (!this.registry && !this.shelly)`) to also consider `stateToggles` non-empty, so a toggles-only bridge starts. The later `sources.length === 0` check is already generic.

### D4: Value semantics

- **Read/coerce:** seed and every state change normalize via truthiness — `Boolean(state.get(stateKey, false))`. Handles `undefined` (absent key → OFF), real booleans, and incidental non-boolean values (`"on"`, `1`) without special cases.
- **Write:** `onSet` stores a real boolean — `state.set(stateKey, Boolean(value))` — so persisted state and `state` triggers always see booleans.
- **Echo:** a HomeKit write triggers `onChange`, which re-applies the same value to the characteristic. Harmless (hap-nodejs tolerates self-updates; `StateManager.set` already no-ops re-notification when unchanged).
- **Duplicates:** a state key listed twice logs a warning and is skipped.

## Risks / Trade-offs

- [Duplicate state keys misconfigured] → Warn and skip the duplicate in `StateSource.start()`.
- [Toggles-only bridge changes startup gate semantics] → The gate already falls through to the generic `sources.length === 0` check, so an empty toggles list with no Zigbee/Shelly still warns and skips startup as before.
- [hap-nodejs import cost in tests] → Reuse the existing lightweight HAP module mock pattern from `homekit-shelly-factory.test.ts`; `StateSource` logic is tested with fake accessories.

## Migration Plan

- No existing config or behavior changes — `stateToggles` is optional and the `state` handle is additive.
- Rollback: remove the option; the constructor/context additions are backward-incompatible at the type level only for direct `new HomekitService(...)` callers, which is a documented signature change in `docs/services/homekit.md`.

## Open Questions

None — all decisions affecting specs, approach, or tasks are resolved.
