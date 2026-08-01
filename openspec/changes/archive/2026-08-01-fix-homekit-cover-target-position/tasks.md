## 1. Reconcile TargetPosition in the Shelly cover accessory

- [x] 1.1 In `createShellyCover` (`src/core/services/homekit-shelly-factory.ts`), seed initial values on the `WindowCovering` service at creation: `CurrentPosition` = 0, `TargetPosition` = 0, `PositionState` = STOPPED (via `updateValue`)
- [x] 1.2 Extend `updateState` so that when the cover is idle (`state` `"open"` / `"closed"` / `"stopped"`) it also sets `TargetPosition` to the computed `CurrentPosition`
- [x] 1.3 Extend `updateState` so that when the cover is moving (`state` `"opening"` / `"closing"`) it sets `TargetPosition` to `cover.target_pos` when a number, falling back to the computed `CurrentPosition`
- [x] 1.4 Keep `CurrentPosition` / `PositionState` mapping and the `TargetPosition` write-back (`onSet` → `{ position }`) unchanged

## 2. Tests

- [x] 2.1 In `tests/homekit-shelly-factory.test.ts`, add a test that the cover service is created with seeded values (CurrentPosition 0, TargetPosition 0, PositionState STOPPED)
- [x] 2.2 Add a test: idle `updateState({ current_pos: 40, state: "stopped" })` sets `TargetPosition` to 40 as well as `CurrentPosition` to 40
- [x] 2.3 Add a test: idle `updateState({ current_pos: 75, state: "open" })` sets `TargetPosition` to 75
- [x] 2.4 Add a test: moving `updateState({ current_pos: 10, target_pos: 20, state: "closing" })` sets `TargetPosition` to 20 and `PositionState` to DECREASING
- [x] 2.5 Add a test: moving without `target_pos` (`state: "opening"`, no target) falls back to `CurrentPosition`
- [x] 2.6 Run `bun run typecheck && bun run check && bun test` and fix any failures

## 3. Documentation

- [x] 3.1 Update the `createShellyCover` doc comment in `src/core/services/homekit-shelly-factory.ts` to mention target-position reconciliation
