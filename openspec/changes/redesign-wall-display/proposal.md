# Proposal

## Why

The dashboard was rebuilt onto the "Lumen" design system and reviewed well, but
the full-bleed wall surface (`/wall/:name`) was only re-skinned: it kept a
generic widget-grid grammar and inherited the dashboard's tokens and sizing, so
it still reads as the dashboard with larger text rather than a purpose-built
wall. A wall panel is a different surface — full-bleed, always-on, read from
across a room — and the user has asked to start its design from scratch.

## What Changes

- **Introduce "Hearth"**, the wall's own visual language, diverging from the
  dashboard's Lumen system: a dark-first, true-black authoritative scheme suited
  to an always-on panel, a designed (not inverted) light scheme, and wall-owned
  colour / typography / spacing / radius / elevation / motion tokens that no
  longer alias the dashboard's tokens. **BREAKING** for the wall's appearance —
  it is a from-scratch redesign, not a reskin.
- **Re-derive the wall's type ramp and body floor** for distance legibility. The
  current hard 16 px body floor (`wall/type-ramp.ts`, the wall design-system
  page) is replaced by the ramp's own floor, which is expected to be larger;
  readouts keep a distance-sized scale above the dashboard's 34 px ceiling.
- **Raise the wall's minimum touch target** from today's 48 px to a kiosk-class
  56 px, with enough spacing between adjacent controls that they are not easily
  confused.
- **Deliver the wall's stylesheet on demand**: Hearth ships as its own
  content-hashed stylesheet, loaded with the wall chunk and excluded from the
  dashboard's first-paint budget, so the dashboard's bundle and first paint are
  unaffected.
- **Keep the wall's behaviour**: named profiles, the author-placed widget grid,
  the widget catalog (clock, weather, energy, room, favorites, device, status,
  scene), device presentation and card archetypes, cover transport, scene
  buttons, live profile updates, the configuration editor, and
  always-on/reconnect behaviour are retained. The behavioural re-scope is
  limited to the type ramp/floor, touch targets, and styling; broader behaviour
  changes are not part of this change (see Non-Goals).
- **Update the design-system documentation**: rewrite
  `design-system/ts-ha/pages/wall.md` for Hearth.
- **Supersedes** the wall-surface work of the in-flight `redesign-web-ui`
  change (its tasks 7.1/7.2 and its wall clauses). `redesign-web-ui` is left to
  finish; this change replaces its wall re-skin output.

## Capabilities

### New Capabilities
<!-- None. Hearth belongs to the existing wall capability. -->

### Modified Capabilities

- `wall-display`: **MODIFIED** "Wall Glanceability" (the type ramp is replaced
  with Hearth's distance ramp and its re-derived body floor) and "Touch
  Operation" (the minimum target is raised to a kiosk-class 56 px); **ADDED**
  "Wall Visual Language" (wall-owned tokens, dark-first true-black with a
  designed light scheme) and "On-Demand Wall Stylesheet" (the wall's stylesheet
  excluded from the dashboard's first paint).
- `web-ui`: **ADDED** "On-Demand Feature Stylesheets" (a lazily-loaded feature
  may ship its own content-hashed stylesheet, excluded from the first-paint
  budget). No existing `web-ui` requirement is modified, so this change does not
  overlap the in-flight `redesign-web-ui` deltas.

## Impact

- **Web UI app (`packages/web-ui/src/app/wall/**`)**: `WallGrid.tsx`,
  `WidgetFrame.tsx`, `frame.ts`, `grid.ts`, `scale.ts`, `type-ramp.ts`, and
  `widgets/**` are re-skinned onto Hearth; a wall-scoped stylesheet is added and
  imported by the wall surface so it lands in the wall chunk.
- **Wall device tile (`packages/web-ui/src/app/components/DeviceTile.tsx`)**:
  its wall (`size="wall"`) mode is re-skinned to Hearth while its props,
  capability ranking, optimistic override, and state encoding are unchanged.
- **Wall entry (`packages/web-ui/src/app/views/WallView.tsx`, `App.tsx`)**: the
  wall stays a lazily-loaded chunk; the Hearth stylesheet import is added to the
  wall surface, not to the entry.
- **Entry stylesheet (`packages/web-ui/src/app/styles/app.css`)**: unchanged as
  the dashboard's Lumen entry; Hearth is a separate stylesheet.
- **Build (`packages/web-ui/scripts/build-web-ui.ts`)**: unchanged in
  machinery — `splitting: true` already emits on-demand chunks and the build
  already excludes `chunk` outputs from the first-paint budget; the wall's CSS
  becomes such an asset by virtue of being reached only through the dynamic wall
  import.
- **Design system (`design-system/ts-ha/pages/wall.md`)**: rewritten for Hearth;
  `design-system/ts-ha/MASTER.md` (the dashboard system) is unchanged.
- **Tests (`packages/web-ui/tests/wall-*.test.ts`, `web-ui-assets.test.ts`)**:
  wall presentation tests are re-pointed at Hearth; the asset test gains a
  wall-stylesheet-not-in-first-paint assertion.
- **Changeset**: one is added for `@ts-ha/web-ui`.
- **No `@ts-ha/shared` / `@ts-ha/core` / `@ts-ha/cli` change.** The widget
  catalog and its shared config schemas are unchanged; the `shared` ← `web-ui`
  direction and the "no `core` import" rule are unchanged.

## Non-Goals

- **No change to the widget catalog or its shared schemas.** Adding or removing
  widget types and changing `@ts-ha/shared` config shapes are out of scope.
- **No change to the composition model.** The author-placed, fixed-column grid
  is retained; an auto-composing ambient register was considered and explicitly
  rejected.
- **No change to wall behaviour** beyond the type ramp/floor and touch targets:
  profiles, the editor flow, device presentation and actuation, cover transport,
  scene buttons, live updates, and always-on/reconnect behaviour are retained.
- **The wall editor stays a dashboard surface** on the Lumen system; Hearth
  applies to the full-bleed wall display, not the admin `WallsView`/editor.
- **No change to the HTTP API, event stream, or shared contracts.**
- **No new runtime dependency** in any package, and no animation library.
