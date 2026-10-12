## Context

See `proposal.md` for motivation. The constraints that shape the approach:

- The wall is a view in the existing SPA (`App.tsx` full-bleed branch), built
  into the lazy `wall` chunk. Nothing here may reach first paint or add a
  runtime dependency (the prior redesign's non-goal; `design.md` D6 of
  `add-wall-display`).
- The device tile is a single shared component (`components/DeviceTile.tsx`)
  whose ranking, optimistic-override, and state-encoding logic is the one
  presentation used everywhere; `add-wall-display` D7 deliberately declined a
  second device presentation. The wall already threads a `size="wall"` token
  through `wall/scale.ts`.
- The profile schema (`packages/shared/src/wall-schema.ts`) pins placements to a
  12-column, 24-row grid and is validated at the write boundary; it does not
  encode rendering, so it does not need to change for a layout-only redesign.
- `design-system/ts-ha/MASTER.md` is the visual source of truth: opaque content
  tiles, room accents on headers only, a `12/14/16/20/24` type scale, and no
  glass on content. The wall needs a *larger* ramp than MASTER's body scale,
  which is the gap this design closes with a page override.

## Goals / Non-Goals

**Goals:**

- Make card size track a widget's declared span and content, not the panel
  height, so a small control is never rendered as a huge card.
- Make the wall readable from a distance: a wall-specific type ramp and a clear
  visual split between ambient readouts and touch controls.
- Make the wall a household kiosk: device tiles actuate and report, without
  device-management affordances.
- Keep every change inside the lazy `wall` chunk and the shared tile's existing
  logic; no schema, endpoint, or persistence change.

**Non-Goals:**

- A drag-and-drop editor, per-widget theming, or a new widget type.
- Wake-lock, burn-in mitigation, or a wall credential (still host concerns).
- Changing the dashboard tile's appearance or its open-detail affordance.
- A long-press/gesture escape hatch for operator affordances (deferred).

## Decisions

### D1. Bounded row unit replaces stretch-to-fill

`WallGrid` currently sets `gridAutoRows: "minmax(0, 1fr)"` with no
`gridTemplateRows`, so implicit rows share the full panel height equally and the
occupied row count — not the content — sets every card's height. Replace this
with a **fixed row unit** and center the resulting grid block vertically. The
unit must reserve the panel chrome (padding and inter-row gutters) so a profile
whose natural unit falls inside the clamp bounds cannot overflow and clip its
top and bottom rows:

```
g             = 24px  (the clamp's upper bound, used conservatively)
chrome        = 2·g + (occupiedRows − 1)·g
rowUnit       = clamp(ROW_UNIT_MIN, (availableHeight − chrome) / occupiedRows, ROW_UNIT_MAX)
contentHeight = occupiedRows·rowUnit + (occupiedRows − 1)·g
fits          = contentHeight ≤ availableHeight − 2·g
```

with `ROW_UNIT_MIN ≈ 72px` and `ROW_UNIT_MAX ≈ 112px`. A profile that occupies
five rows on a 1024 px-tall panel computes a clamped `112px` unit and occupies
~5·112 + gaps ≈ 600 px, centered — instead of stretching each card to 190 px.
`gridAutoRows` becomes the resolved unit and `alignContent` centers the block
**when the composition fits**; when the resolved content still exceeds the panel
(a very tall profile), the block is top-aligned and scroll becomes available as
a last resort rather than clipping the first row. The gutter/padding are a
single `clamp(16px, 2vmin, 24px)` value.

- **Rationale:** keeps the existing "one row unit" mental model and the CSS-only
  approach, but bounds it so small profiles stop inflating; content still fills
  its declared cells.
- **Alternative:** `gridAutoRows: auto` (pure content height) — rejected;
  widgets would stop aligning on a shared baseline and spans would lose
  meaning.
- **Alternative:** keep `1fr` and cap card `max-height` — rejected; leaves
  uneven dead space inside cells and does not fix the composition's height.

### D2. Two card grammars: ambient vs control

The widget descriptor gains a `grammar: "ambient" | "control"` field. Ambient
widgets (clock, weather, energy, status) render chrome-less — no `Paper`
border, large type directly on `--bg` — because they are read, not touched.
Control widgets (room, favorites, device, scene) render as surface tiles
(`--surface`, hairline, 14 px radius) whose **whole card** is the touch target.

- **Rationale:** restores the hierarchy the current uniform surface tile loses;
  makes "read" versus "touch" legible at a glance.
- **Alternative:** one grammar with per-widget styling — rejected; drifts and
  reintroduces the flat sameness.

### D3. Headers are opt-in

`WidgetFrame` prints the widget type label as a header whenever no title is
configured. Change it to render a header **only** when `config.title` is set;
otherwise the widget owns its own labelling (a scene button already says its
label, a clock says the time).

- **Rationale:** removes the "SCENE" + "TV DayMode" and "DEVICE" noise the
  panel currently shows.
- **Alternative:** always show the type label — rejected; it is the least
  important element occupying prime space.

### D4. A wall presentation on the shared tile, not a second tile

Extend `DeviceTile` with a wall presentation (the existing `size="wall"` token,
plus a management-affordance switch) that on the wall:

- suppresses the favorite toggle, the hide/unhide toggle, and the explicit
  open-detail affordance, and
- makes the whole card the actuation target for a device whose primary action is
  a toggle (on/off); a device whose primary action sets a value keeps its
  embedded control as the target, because a bare tile activation cannot express
  the value to set.

The capability ranking, optimistic override, and state encoding stay the single
shared implementation. A device with no actuatable property renders as a
read-only readout with no navigation on the wall.

- **Rationale:** satisfies the kiosk requirement without forking the ranking
  and optimistic logic that the spec requires to behave identically.
- **Alternative:** a standalone `WallDeviceTile` that re-implements the tile —
  rejected; recreates the split `add-wall-display` D7 forbade and risks drift.
- **Alternative:** keep operator affordances but hide them behind a long-press
  — deferred; not needed for the kiosk and adds an undiscoverable gesture.

### D5. Glanceable defaults

Retune registry defaults so a first composition is calm: clock toward hero
sizing (e.g. `6×3`), weather `3×3`, single device `2×2`, room `6×4`, scene
`2×2`, within existing min/max bounds. The profile schema is unchanged, so
existing profiles keep loading; only new widgets get the new defaults.

- **Rationale:** first-run composition is the most common way a wall is built;
  defaults currently stack into a tall stretched column.
- **Alternative:** leave defaults and rely on the owner — rejected; the default
  is the design.

### D6. Glanceability is specified, and documented as a page override

The layout, type, and gutter rules become a normative `wall-display`
requirement, and `design-system/ts-ha/pages/wall.md` records the wall's density,
row-unit bounds, and type ramp as a MASTER override.

- **Rationale:** the failure was a styling gap with behavioural consequences
  (unreadable at distance); specifying it prevents regression.

## Risks / Trade-offs

- **A bounded row unit can push a very tall profile past the viewport** →
  mitigate by tuning `ROW_UNIT_MAX` so typical profiles fit, keeping the
  editor's 24-row bound, and allowing `overflow: auto` only as a last resort
  (the wall is otherwise non-scrolling).
- **Removing the detail affordance loses device detail on the kiosk** → the
  household control views remain URL-reachable; the wall is intentionally a
  kiosk. Documented as an accepted limitation.
- **The D7 reversal could look like forking device presentation** → only
  affordance visibility and the tap target differ; ranking/optimistic/state
  logic remains single-source and is covered by the existing tile tests plus
  new wall-mode tests.
- **Chrome-less ambient widgets can lose separation on the dark background** →
  define token-based type sizes and a subtle ambient separation; verify text
  contrast in both schemes.
- **Existing profiles render differently after the change** → intended and
  presentation-only; no data migration.

## Migration Plan

Presentation-only. No schema, endpoint, or persistence change; existing
profiles remain valid and load unchanged. Deploy as a normal release; rollback
is reverting the release.

## Open Questions

- Whether a wall tile should eventually offer device detail behind a deliberate
  secondary gesture (long-press). Deferrable; not required for the kiosk.
- Whether the ambient/control grammar should be owner-selectable per widget
  rather than fixed by type. Deferrable; fixed-by-type is the simpler default.
