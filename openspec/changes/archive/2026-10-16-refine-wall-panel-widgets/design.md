## Context

Four wall-display behaviours are refined together because each touches the same
wall surface (`packages/web-ui/src/app/wall/`) and three of them share the
ported card vocabulary in `wall/cards/`. The motivation is in `proposal.md`; this
document records how each is implemented and why, grounded in the current code.

Current state that shapes the approach:

- **Scene geometry.** A scene is a `control` widget, so `WidgetFrame` draws the
  ported surface and insets it by `WALL_FRAME_RESERVED_PX` (2 × 10 px). A one-row
  cell is `rowUnit` (50–56 px), so the renderer would get 30–36 px — below both
  the scene's own row budget (`SCENE_ROW_HEIGHT_PX`, 66 px) and the wall's 42 px
  touch target. `scene.min.h` is 2 in `wall/registry.ts` precisely to avoid this.
- **Energy data.** `EnergyAggregator` (`packages/core/src/energy/energy-aggregator.ts`)
  samples only *instantaneous power* into an in-memory ring; `EnergyData`
  (`packages/shared/src/wire.ts`) carries the cumulative lifetime `energyWh` but
  no windowed usage. The `history` ring defaults to 1440 minutes at a 60 s
  interval, and is lost on restart.
- **Temperature label.** `TemperatureWidget` labels the card with
  `shortDeviceName(device.displayName)`, which keeps the *trailing* words within
  14 characters. A name ending in "Sensor" therefore shortens to just "Sensor",
  so several sensors collide. Room membership is already available to the wall:
  `data-store.tsx` exposes `rooms: RoomWithMembers[]`, and `DeviceDetailView.tsx`
  resolves a device's room by scanning `rooms[].members`.
- **Actions row.** `WallCardActions` (`wall/cards/card-anatomy.tsx`) is a flex row
  at `justify-content: flex-start`; every control is a fixed `controlHeight`
  wide, so a row sits at the card's left with unused width beside it.

## Goals / Non-Goals

**Goals:**

- A scene may be authored one row tall and still meets the wall's touch target.
- The wall energy widget answers "what has the home used recently", not "what has
  it used ever", and never shows a misleading number.
- Four identically-named sensors are distinguishable on the wall.
- A device card's actions row uses its card's width without distorting a control.

**Non-Goals:**

- No change to the dashboard `EnergyView`, to the energy window as a
  configuration value, or to energy-history persistence.
- No new widget types, no profile version or profile-config change, no scene
  trigger change, no ported-metric change.
- No `@ts-ha/cli` change.

## Decisions

### D1 — A one-row scene renders chrome-less, so the cell is the target

`scene.min.h` becomes **1** in `wall/registry.ts`. To keep the 42 px floor
without exempting it, a one-row scene **drops the frame's surface** rather than
shrinking into the inset: the cell (50–56 px) is then the scene's touch target and
its composition has the full cell height to fit a 42 px glyph plus its label.

Concretely, `wallFrameDrawsSurface(type, grammar)` (`wall/frame.ts`) becomes
placement-aware: a `scene` placed at one row returns `false`, otherwise the
existing rule applies. `WidgetFrame` already branches on that flag to skip the
surface and inset, so no new rendering path is introduced. The scene's compact
composition in `scene-model.ts` resolves against the chrome-less renderer box
(`rendererHeightPx`), which is what it already does for the stacked/row choice;
`SCENE_MIN_SPAN` moves to `{ w: 2, h: 1 }` so the stacked form is only chosen
with room.

*Alternatives.* Keeping the frame and letting the tile dip to 30–36 px was
considered (the wall would then need to exempt a type from its touch floor);
rejected because it weakens a wall-wide guarantee for a purely cosmetic inset.
Keeping `scene.min.h` at 2 and refusing to save was rejected — it is the request.

*Consequence to state plainly.* A one-row scene has no surface, so it reads as a
bare icon-and-label affordance on the wall rather than a tile. That is the point
of a slim scene; the framed tile returns at two rows.

### D2 — Windowed usage is a core+shared contract, reported with its coverage

`EnergyAggregator` retains **per-device cumulative-energy samples** (not only the
home's power total) in a ring bounded by the existing `ENERGY_HISTORY_MINUTES`,
and derives the home's usage over the window as the sum, over the devices that
report a cumulative reading at *both* ends of the retained span, of each device's
change. A device that is unreachable or silent at either end is therefore
excluded outright rather than entering the sum as a zero at one end: on a device
that drops out mid-window a summed home reading would silently subtract that
device's entire consumption from the window (potentially reporting a negative
usage), which is exactly the misleading number this change exists to prevent.
`EnergyData` gains the usage, the window length, and the coverage as optional
flat fields — `usageWh`, `windowMinutes`, and `coveredMinutes` — so the response
stays useful when nothing has been sampled and an older client simply ignores
them.

`wall/widgets/energy-model.ts` maps the usage to a display string and the widget
presents it in place of "Total", labelled with the span actually covered
("last 24h", or "last 6h" for a partial window); when nothing has been covered
the widget renders an absent value rather than a zero, per the spec.

*Alternatives.* Client-side integration of the power history (web-ui only) was
rejected by the author: it is approximate, under-reports and cannot recover after
a restart. A fixed `usage24hWh` without coverage was rejected because it cannot
distinguish a full window from a partial one, which is exactly the misleading
number the change exists to prevent.

*Contract impact.* `EnergyData` lives in `@ts-ha/shared`; the addition is
additive, so `scripts/contract-inventory.json` is updated only if the guard
reports `EnergyData` as a tracked contract (do not edit the inventory to silence
a violation — update it because the contract changed). Dependency direction is
unchanged: `shared` ← `core`, `shared` ← `web-ui`.

### D3 — The temperature label is the device's room, else its name

`temperature-model.ts` resolves the bound device's room by scanning the store's
`rooms[].members` (the same lookup `DeviceDetailView.tsx` uses) and returns the
room name when found, otherwise the shortened device name. `TemperatureWidget`
draws that on its existing label, keeping the readings and the contained
unavailable/unconfigured explanations unchanged.

*Alternatives.* A per-widget configured label was rejected because the profile
should not have to restate something the room model already knows. A
qualified-id fallback was rejected as less legible at distance than a room name.

### D4 — Actions rows use the card width; flexible controls stay flexible

`WallCardActions` gains the ability to distribute its children across the row.
A row of fixed controls spreads them; a row containing a flexible control (a
`WallCardSlider`, or an enumerated control's collapsed dropdown) keeps that
control's `flex: 1` and centres the fixed controls beside it. An enumerated
control in its *segmented* form **is** a row of fixed-size options, so its row
spreads like any other fixed row rather than bunching the options in the middle.
The ported control height and radius are untouched, so
`WALL_CARD_CONTROL_ROW_MIN_WIDTH_PX` and the derived minimum column span do not
move — distribution only consumes width a card already has.

*Alternatives.* Stretching every control equally was rejected because a slider
stretched to a full-width bar reads as a different control. Centre-only was
rejected because a cover's transport should fill a wide card, not float in it.

### D5 — Scope stays wall-only where it can

The energy field is surfaced on the wall widget only; the dashboard `EnergyView`
keeps its Current power / Cumulative / Metering devices stats. No profile
version, widget type, or config shape changes, so there is no persisted-profile
migration. The only published packages that change are `@ts-ha/shared`,
`@ts-ha/core`, and `@ts-ha/web-ui`.

## Risks / Trade-offs

- **The chrome-less scene changes frame geometry** → `WidgetFrame` already skips
  the inset when `wallFrameDrawsSurface` is false, and the fit/paging math reads
  `WALL_FRAME_RESERVED_PX` only for framed widgets; the change makes the flag
  span-dependent, so `wall-frame`/`wall-grid` tests are extended for the one-row
  case.
- **Windowed usage is in-memory** → a restart yields a partial window; the
  coverage field makes that visible instead of silently under-reporting. Stated
  as a non-goal, matching the existing history model.
- **A mid-window dropout is excluded per device** → the retention is per device
  rather than a pre-summed home reading (D2), so a device that becomes
  unreachable mid-window leaves the window rather than depressing it; the
  reported usage covers the devices that contributed at both ends.
- **Room lookup on every render** → resolve through the store's `rooms` list (as
  `DeviceDetailView` does); the list is memoised in `data-store.tsx`, so the scan
  is cheap and does not re-fetch.
- **Distribution could distort a control** → the rule is fixed-control rows only;
  a row with a slider keeps the slider flexible, asserted by a card test.
- **Two-system drift (Hearth vs Lumen)** → the wall design-system page
  (`design-system/ts-ha/pages/wall.md`) is updated in the same change; the editor
  stays on Lumen.

## Migration Plan

- **Wire**: additive optional fields on `EnergyData`; older clients ignore them.
  No version bump, no migration.
- **Profiles**: none — `WALL_PROFILE_VERSION` is unchanged; a one-row scene is
  newly *authorable*, not newly *loadable*.
- **Rollback**: revert the aggregator and the widget model together; a client
  that ignores the new fields renders the previous cumulative total if the widget
  is rolled back with it.
- **Changeset**: one, covering `@ts-ha/shared`, `@ts-ha/core`, `@ts-ha/web-ui`.

## Resolved Questions

The questions raised during design and implementation were settled before their
respective task work proceeded:

- The wire fields are the flat `usageWh` / `windowMinutes` / `coveredMinutes`
  (D2).
- The wall shows a partial window as a usage value labelled with the span it
  actually covers ("last 6h"), and shows it as absent only when nothing has been
  covered (D2, and the `Energy Widget Presents Recent Usage` scenarios).
- The aggregator retains **per-device** cumulative samples, not the home's
  pre-summed reading, so a device that becomes unreachable mid-window is excluded
  from the window's usage instead of subtracting its consumption from it (D2,
  and the `Rolling-Window Usage` scenario "A non-contributing device is
  excluded").

