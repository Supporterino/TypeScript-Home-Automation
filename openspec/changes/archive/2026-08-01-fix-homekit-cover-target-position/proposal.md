## Why

Shelly `WindowCovering` accessories always display **"Closing"** in the Apple
Home app, regardless of their real position. The blind position is reported
correctly (the slider works and matches reality) and the covers are calibrated,
but the tile status never settles.

Root cause: HomeKit shows "Opening"/"Closing" whenever it believes the accessory
has not yet reached its target position. The bridge only *receives* `TargetPosition`
writes (`onSet`) and never *publishes* it back, so iOS compares its remembered
target against `CurrentPosition` and waits forever. On a fresh bridge the target is
`undefined` (read as 0 = closed); once any interaction or external state change
diverges target from current, the tile wedges in a perpetual moving state. The HAP
spec explicitly requires the accessory to set `TargetPosition = CurrentPosition`
when movement completes — this is never done.

## What Changes

- `createShellyCover.updateState` additionally reconciles the HAP `TargetPosition`
  characteristic against reality:
  - When the cover is **idle** (`state` `"stopped"` / `"open"` / `"closed"`),
    push `TargetPosition = CurrentPosition` so HomeKit sees the covering has arrived.
  - When **moving**, push the Shelly `target_pos` when present (falling back to the
    current position) so the animation direction matches reality.
- Seed initial characteristic values (`CurrentPosition`, `TargetPosition`,
  `PositionState`) on the `WindowCovering` service at accessory creation so the
  first controller read is never `undefined`.
- Keep `TargetPosition` write-back (HomeKit → Shelly) unchanged.

## Capabilities

### New Capabilities
<!-- None; this modifies the existing homekit capability. -->

### Modified Capabilities
- `homekit`: The `WindowCovering Support` requirement gains target-position
  reconciliation so idle covers report a settled `TargetPosition` in HomeKit.

## Impact

- **Code**: `src/core/services/homekit-shelly-factory.ts`
  (`createShellyCover` — seed initial values, reconcile `TargetPosition` in
  `updateState`).
- **APIs**: none (no signature changes; internal behavior fix).
- **Dependencies**: none new — reuses `hap-nodejs` `Characteristic.TargetPosition`.
- **Behavior**: cover tiles in the Home app settle to a static position/"Open"/
  "Closed" state when idle instead of showing a permanent "Closing" state.
- **Tests**: `tests/homekit-shelly-factory.test.ts` gains assertions that
  `updateState` also updates `TargetPosition` (idle → equals `CurrentPosition`,
  moving → equals Shelly `target_pos` when provided) and that initial values are
  seeded at creation.
