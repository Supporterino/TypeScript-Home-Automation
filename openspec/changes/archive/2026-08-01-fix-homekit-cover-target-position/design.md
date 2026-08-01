## Context

`createShellyCover` in `src/core/services/homekit-shelly-factory.ts` builds the
HAP `WindowCovering` service. Its `updateState` maps `Cover.GetStatus` onto the
service:

- `current_pos` → `CurrentPosition` (both 0 = closed, 100 = open — verified
  against the Shelly Gen 2 API docs).
- `state` → `PositionState` (`opening`=INCREASING, `closing`=DECREASING, else
  STOPPED).

`Characteristic.TargetPosition` appears **only** in the `onSet` write-back
(`homekit-shelly-factory.ts:117`); it is never updated by the bridge.

HomeKit's controllers (the Apple Home app) treat a Window Covering as "in
motion" whenever `CurrentPosition` has not reached the target they believe was
requested. Because the accessory never publishes `TargetPosition`:

- A freshly bridged cover reports an `undefined` target (coerced by iOS to 0 =
  closed), so any cover above position 0 shows **"Closing"** indefinitely.
- After any interaction or external change (wall switch, automation), the last
  written target goes stale while `CurrentPosition` moves away, re-wedging the
  tile in a perpetual moving state.

The HAP spec requires the accessory to set `TargetPosition = CurrentPosition`
when the covering reaches its target — the current code never satisfies this.

## Goals / Non-Goals

**Goals:**
- Make cover tiles settle to a static position/"Open"/"Closed" state when idle.
- Keep the real position and write-back behavior unchanged.
- Minimal, local change to the Shelly cover accessory only (no architecture
  churn).

**Non-Goals:**
- Accelerated polling during cover motion (explicitly deferred in the earlier
  Shelly bridge change).
- Smooth animation tracking (progress interpolation) — out of scope.
- Changes to Zigbee accessories or the `AccessorySource` abstraction.

## Decisions

### D1: Reconcile `TargetPosition` in `updateState`

Extend `updateState` so it always keeps `TargetPosition` truthful:

```
idle  (state "stopped" | "open" | "closed")  →  TargetPosition = CurrentPosition
moving (state "opening" | "closing")          →  TargetPosition = cover.target_pos ?? CurrentPosition
```

The idle branch is the load-bearing fix: it signals "arrived" to iOS and clears
the perpetual "Closing". The moving branch keeps the tile animation direction
honest when a controller has not written a target itself (e.g. a physical switch
press moves the cover); when Shelly omits `target_pos` (already stopped), the
current position is the safest fallback.

`CurrentPosition` and `PositionState` mapping are unchanged.

### D2: Seed initial characteristic values at creation

At accessory build time, set:

- `CurrentPosition` = 0
- `TargetPosition` = 0
- `PositionState` = STOPPED

This guarantees the first read by a controller is a valid, settled value rather
than `undefined` (which iOS coerces to 0 anyway, but an explicit seeded value
keeps the accessory self-consistent before the first poll lands and avoids
relying on that coercion). The next poll tick overwrites these with real data.

### D3: Write-back unchanged

`TargetPosition.onSet` continues to emit `{ position }` → `coverGoToPosition`.
No change to `ShellyAccessoryCommand`, `ShellySource`, or `ShellyService`.

## Risks / Trade-offs

- **Target briefly lags reality while moving** (only one poll tick of staleness
  for externally-initiated motion): acceptable — the poll pushes the true
  `target_pos`/current on the next tick, and controller-initiated moves set
  `TargetPosition` immediately via write-back.
- **Seeded 0/0/STOPPED on covers above 0 until first poll**: transient (≤ 1 poll
  interval); seeding a valid number is strictly better than publishing
  `undefined`.
- **`target_pos` availability**: present only while calibrated and moving; the
  `?? CurrentPosition` fallback covers both the idle and stale-null cases.

## Open Questions

- None blocking. (Potential future refinement: push `PositionState = STOPPED`
  immediately when a write-back command completes, via a one-shot status poll
  after `coverGoToPosition`, instead of waiting for the next tick — noted as a
  possible follow-up, not part of this change.)
