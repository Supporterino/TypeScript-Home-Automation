## Context

See `proposal.md` — Why. The wall's rendering path today is: `WallGrid` →
`WidgetFrame` (draws a `Paper` for `control` grammar) → widget renderer →
`WallDeviceTile` → shared `DeviceTile` (draws its *own* `Paper`). So every wall
device card is a surface nested inside a frame surface, and one generic anatomy
is applied to all devices. Capability ranking already exists
(`lib/capability-ranking.ts`, `rankDeviceTile`) but is used only to pick one
action and one readout, not to choose a card shape. The wall type ramp,
`wall.md`, and the `wall-display` spec constrain presentation; `MASTER.md`'s
Device Tile rule ("one dominant primary action **or** readout") is the rule the
light card consciously breaks.

## Goals / Non-Goals

**Goals:**
- One surface per card; the archetype, not the template, decides the chrome.
- Archetype chosen from ranked capabilities, reusing existing ranking.
- Light, sensor, and cover cards each read as their device type at a glance.
- Observation state retained as a non-color channel, demoted to non-textual.
- Stay inside the lazy `wall` chunk and the first-paint budget; no new deps.

**Non-Goals:**
- Any `shared`/`core` capability-schema change (stop is progressive).
- Changing the dashboard tile's presentation; the shared changes are additive
  (a nested/contained mode and an archetype dispatch the dashboard does not use).
- Reworking the clock, weather, energy, or status widgets, which already work.

## Decisions

### D1 — Archetype selection is a pure, presentational helper

Add a small pure module (alongside `lib/capability-ranking.ts`) that maps a
device's `rankDeviceTile(...)` result to an archetype: `light` (toggle +
brightness), `toggle` (on/off only), `cover` (position primary), `readout`
(sensors), and a default that keeps today's behaviour. Keep it
dependency-free and unit-tested, in the same spirit as `frame.ts` /
`device-tile-state.ts`. Rationale: re-tunes against real hardware without
touching specs; the ranking is already the single source of what a device *is*.

*Alternative considered:* a per-widget config field choosing a card style.
Rejected — it moves a device fact into profile config and can contradict the
device.

### D2 — Single surface via a `contained` mode on `DeviceTile`

Give `DeviceTile` (and `WallDeviceTile`) a `contained` flag: when set, the tile
renders no `Paper` of its own and inherits the surrounding frame's surface. The
`WidgetFrame` keeps ownership of `control` chrome; `Ambient` stays chrome-less.
This fixes the device widget, and the room/favorites grids (tiles inside a frame
paper) in one place.

*Alternative considered:* remove `WidgetFrame`'s surface and let tiles always
self-draw. Rejected — a room/favorites widget needs a surrounding card, and an
empty widget still needs a surface.

### D3 — Light card: two controls, wall-only

The light archetype renders a brightness control (slider with a persistent `%`
readout) and an on/off toggle. Because the slider occupies the card, the light
card does **not** whole-card-actuate; the toggle is the explicit affordance.
Document this as the second deliberate wall-only departure in
`design-system/ts-ha/pages/wall.md`, next to the existing D7 revisit.

*Alternative considered:* keep whole-card toggle and reveal brightness on a
second tap. Rejected — adds an interaction the spec's "operable without hover,
at a glance" intent does not want on a wall.

### D4 — Sensor card is a chrome-less readout

The readout archetype draws **no** surface: one large value and one quiet label
on the panel, matching the clock/weather treatment. This means surface choice
follows the archetype, not solely the `ambient`/`control` grammar; update
`wall.md` so the grammar governs *widget* defaults while a readout device card
is explicitly chrome-less.

### D5 — Observation demotion

`deviceTileObservation` already yields a distinct icon shape + token per state.
Keep that, drop the label text from the card face, and expose the state name via
`title`/`aria-label` so it stays accessible and non-color-only. `unreachable`
may add the existing plugged-off marker. No spec requirement is dropped; only
the visual weight changes.

### D6 — Cover transport and progressive stop

Add a `CoverTransport` control (in `CapabilityControl` or a sibling) used when
the archetype is `cover`:
- **Open** → write `position = range.max`; **Close** → `position = range.min`.
- **Stop** is shown only when a pure helper finds a writable transport
  capability capable of expressing stop — concretely a writable capability whose
  permitted values include a stop-like token, or a writable `state` enum
  (Zigbee covers). When none is found, stop is omitted.
Detection stays a pure, tested function so it degrades safely; it never renders
a control that command validation would reject.

*Alternative considered:* author a dedicated writable `stop` capability in core
for all covers. Rejected for now — a contract change for one button; progressive
detection needs no schema change and covers the Zigbee case immediately.

### D7 — Scene button as a full-bleed pressable surface

Replace the bare Mantine `Button` with a full-bleed pressable tile: large icon +
label centered, an explicit pressed/active state (token-driven, no layout shift),
and a busy state while triggering. Keep the existing trigger path and on-button
error surfacing unchanged.

### D8 — Device name humanisation is a pure, presentation-only helper

Add a pure `humanizeDeviceName(rawName)` helper in `app/lib/`: if the name
contains a separator (`_`/`-`) it splits on separators, title-cases the words,
and collapses whitespace; otherwise it returns the name unchanged (so an
already-human Zigbee name is not re-cased). Apply it at every presentation site
in `web-ui` (tiles, `DeviceDetailView`, room membership, select options). The
raw identifier is untouched on the wire and still shown in the detail view
(alongside the humanised label).

*Alternatives considered:* humanise in `core` when building the descriptor —
rejected, it would change the wire/contract and affect the CLI and automations;
humanise in `shared` — rejected, it is a web-UI presentation concern.
Note: this does not infer word boundaries inside a joined token
(`livingroom_couch` → "Livingroom Couch", not "Living Room Couch"); a dictionary
segmenter is out of scope.

### D9 — Editor widget list is a responsive grid

Change the editor's widget list from a vertical `Stack` to a responsive grid
(`cols={{ base: 1, md: 2 }}`), each `WidgetRow` staying a self-contained card
with its placement controls and config fields. Rationale: the editor is only
used on a non-wall device, so a wide viewport is the common case, and halving
the scroll improves scanning of long profiles.

*Alternative considered:* keep one column and rely on scrolling. Rejected — the
reported problem is exactly the scroll length for many widgets.

## Risks / Trade-offs

- **Archetype misclassification** → keep it pure + unit-tested against the
  existing ranking fixtures; default case preserves today's rendering.
- **Demoted observation reduces stale discoverability** → keep the state in
  `title`/`aria-label`; stale/unreachable keep their distinct token and icon
  shape, so they remain visually distinguishable at a glance.
- **Stop-detection heuristic is fragile across firmware** → pure helper with
  tests; when detection is unsure, omit stop (spec explicitly requires omission
  over an inert control).
- **First-paint budget** → all new modules live under the lazy `wall` chunk;
  the shared `DeviceTile`/`CapabilityControl` additions add no imports and no
  new dependencies. `bun run --filter @ts-ha/web-ui test` asset gates re-run.
- **Name humanisation alters existing labels users may rely on** → only
  separator-containing names are transformed, and the raw identifier stays in the
  detail view, so nothing becomes unaddressable or unrecognisable.

## Migration Plan

No data or persistence migration: profiles, configs, and the grid format are
unchanged. Rollback is a code revert; nothing is written to disk. Deploy is the
normal web-UI build (`bun run --filter @ts-ha/web-ui build:web-ui`).

## Open Questions

- Whether the cover Stop implementation should later be unified across sources
  (a writable Shelly stop) is deferred; it does not change the specs or the task
  breakdown, which ship progressive stop.
