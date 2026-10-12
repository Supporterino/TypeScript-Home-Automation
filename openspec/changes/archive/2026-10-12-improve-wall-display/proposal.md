## Why

The wall surface is meant to be read at a glance from across a room, but it
renders every widget as a full-height card stretched to fill the panel. Because
the grid's rows are `1fr` with no explicit row template
(`packages/web-ui/src/app/wall/WallGrid.tsx:28`), a single scene button with a
default `{w:3,h:2}` span becomes roughly 300×390 px, and every card is mostly
empty space. At the same time the widget title is 12 px uppercase dimmed text
(`WidgetFrame.tsx:30`) above a 48 px control — an inverted hierarchy that reads
worse from a distance than up close. The shared device tile also carries
operator affordances (favorite, hide/unhide) and an open-detail affordance
(`DeviceTile.tsx:341-342, 407`) that a shared household kiosk should not expose.
The result is a panel that is simultaneously oversized, sparse, and busy, and
that fails its one job: being glanceable.

## What Changes

- **Content-sized grid instead of stretch-to-fill.** Rows become a fixed
  rhythm (a row unit derived from the viewport, not `1fr`), so a widget's
  pixel height tracks its `h` span and its content rather than the number of
  occupied rows. The composition occupies its natural height and is centered
  on the panel; a minimum gutter replaces the current 12 px edge-to-edge gap.
- **A distance-readable type ramp and two card grammars.** Ambient readouts
  (clock, weather, status/energy) render large and chrome-less on the
  background; control widgets (room, favorites, device, scene) render as
  surface tiles whose whole card is the touch target. Widget-level headers are
  dropped unless a title is explicitly configured.
- **Glanceable widget defaults.** The clock and weather defaults move toward
  hero sizing; device/room/favorites defaults are rebalanced so a freshly added
  composition is calm rather than a tall stretched column.
- **A wall-specific device-tile presentation.** On the wall, a device tile
  omits device-management affordances (favorite toggle, hide/unhide, and the
  explicit open-detail affordance) and makes the whole tile the actuation
  target, while keeping the state encoding (push/polled/age/unreachable) and
  the optimistic-then-reconcile-and-revert behaviour. This **revisits design
  decision D7** ("no second device presentation") for the wall context only;
  the dashboard tile is unchanged.
- **A normative glanceability requirement** on the wall-display capability, so
  the layout, type, and gutter rules are specified behaviour rather than
  styling.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `wall-display`: Adds a "Wall Glanceability" requirement (content-sized
  layout, distance-scaled type, minimum gutter, ambient-vs-control grammar) and
  a "Wall Device Presentation" requirement (a wall device tile presents
  actuation and state without device-management affordances).
- `web-ui`: Extends "Device Tile Presentation" so the explicit open-detail
  affordance is required of the dashboard tile but is not required on the
  read-only wall surface, while state encoding and actuation semantics stay
  identical.

## Impact

- **Web UI (wall)**: `wall/WallGrid.tsx` (row rhythm, gutter, centering),
  `wall/WidgetFrame.tsx` (title policy, grammar), the widget renderers, and
  `wall/scale.ts` / `WallDeviceTile.tsx` (wall presentation). All remain inside
  the lazy `wall` chunk; no first-paint budget change and no new dependency.
- **Web UI (shared tile)**: `components/DeviceTile.tsx` gains a wall
  presentation path (or a `wall` mode that suppresses operator affordances);
  the dashboard tile's rendering is unchanged. Covered by the existing shared
  tile tests plus new wall-mode tests.
- **Shared**: widget registry defaults (`defaults`/`min`) in
  `packages/web-ui/src/app/wall/registry.ts` are retuned; the profile schema is
  unchanged, so existing profiles remain valid.
- **Design system**: adds a `design-system/ts-ha/pages/wall.md` override
  capturing the wall's density/type grammar, subordinate to MASTER.md.
- **No engine, HTTP, persistence, or event-stream changes**: the wall profile
  model and endpoints are untouched.
