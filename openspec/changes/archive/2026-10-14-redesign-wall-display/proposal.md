# Proposal

## Why

The dashboard was rebuilt onto the "Lumen" design system and reviewed well, but
the full-bleed wall surface (`/wall/:name`) was only re-skinned: it kept a
generic widget-grid grammar and inherited the dashboard's tokens and sizing, so
it still reads as the dashboard with larger text rather than a purpose-built
wall. A wall panel is a different surface — full-bleed, always-on, read from
across a room — and the user has asked to start its design from scratch.

The widget renderers were re-skinned the same way: only re-pointed at the wall's
tokens while keeping a generic tile shape. The user has asked for them to be
rethought rather than re-skinned — scene, device, and the sensor readout
especially — with the light card modelled on a supplied reference (a tinted
device-icon affordance, the device name, a percentage, and a full-width
brightness bar).

An audit of the cover (shutter) transport found that stop is effectively
unreachable: `ShellyService.coverStop()` exists, but a Shelly cover's capability
description makes stop inexpressible, so the wall correctly omits Stop rather
than rendering it inert. The user asked for shutter up/down/stop to actually be
possible.

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
- **Redesign the widget presentations**: the widget renderers are re-thought onto
  a shared Hearth card vocabulary rather than re-skinned, with the scene, device,
  and sensor-readout widgets redesigned from scratch. This is a presentation
  redesign — widget behaviour, states, and config surface are preserved except
  where explicitly listed below.
- **Redesign the light card** (wall-only, `DeviceTile`'s `size="wall"` mode): a
  distinct on/off affordance — the device-icon badge — toggles the light, and a
  full-width brightness bar is the brightness value control. Where the device
  declares them, a colour-temperature and a colour control are added; while the
  light is off the bar shows an off-state visual and turns the light on when
  pressed. Modelled on the supplied reference image. The dashboard's shared
  tile is unaffected.
- **Extend the widget catalog**: a dedicated **temperature** widget type is
  added, carrying a reading from a configured sensor device. This adds a member
  to `WALL_WIDGET_TYPES`, a config type, and a validation schema in
  `@ts-ha/shared`, so the change is no longer behaviour-free for the catalog.
- **Make a cover's stop reachable (shutter up/down/stop)**: a cover's capability
  description gains a writable transport action (`open`/`close`/`stop`) wherever
  the source can perform it, and the source translates a command naming that
  action to its own open/close/stop primitive. The Shelly source declares and
  dispatches it to `Cover.Open`/`Cover.Close`/`Cover.Stop`; the wall then
  presents up/down/stop for any cover that declares transport, including one that
  exposes no position. This is the change's one `@ts-ha/core` change. A cover that
  genuinely cannot stop still omits Stop.
- **Keep the wall's behaviour**: named profiles, the author-placed widget grid,
  scene triggers, live profile updates, the configuration editor, and
  always-on/reconnect behaviour are retained. Beyond the widget presentations,
  the light-card controls, the added temperature widget, and the cover transport
  action, no other behaviour changes (see Non-Goals).
- **Update the design-system documentation**: rewrite
  `design-system/ts-ha/pages/wall.md` for Hearth, the widget vocabulary, and the
  added widget type.
- **Supersedes** the wall-surface work of the in-flight `redesign-web-ui`
  change (its tasks 7.1/7.2 and its wall clauses). `redesign-web-ui` is left to
  finish; this change replaces its wall re-skin output.

## Capabilities

### New Capabilities
<!-- None. Hearth belongs to the existing wall capability. -->

### Modified Capabilities

- `wall-display`: **MODIFIED** "Wall Glanceability" (the type ramp is replaced
  with Hearth's distance ramp and its re-derived body floor), "Touch Operation"
  (the minimum target is raised to a kiosk-class 56 px), "Widget Catalog" (a
  temperature widget type is added and made configurable), "Wall Device
  Presentation" (a light card offers its on/off toggle as a distinct affordance
  and adds colour-temperature/colour controls where the device declares them,
  and the sensor readout is redesigned), and "Cover Transport Controls" (a cover
  that declares a transport action presents up/down/stop, including when it
  exposes no position); **ADDED** "Wall Visual Language" (wall-owned tokens,
  dark-first true-black with a designed light scheme) and "On-Demand Wall
  Stylesheet" (the wall's stylesheet excluded from the dashboard's first paint).
- `device-sources`: **ADDED** "Cover Transport Action" (a cover declares the
  open/close/stop action it accepts so a consumer can stop a shutter without
  source-specific knowledge, and the source translates it to its own transport).
- `web-ui`: **ADDED** "On-Demand Feature Stylesheets" (a lazily-loaded feature
  may ship its own content-hashed stylesheet, excluded from the first-paint
  budget). No existing `web-ui` requirement is modified, so this change does not
  overlap the in-flight `redesign-web-ui` deltas.

## Impact

- **Web UI app (`packages/web-ui/src/app/wall/**`)**: `WallGrid.tsx`,
  `WidgetFrame.tsx`, `frame.ts`, `grid.ts`, `scale.ts`, `type-ramp.ts`, and
  `widgets/**` are re-skinned onto Hearth, and the widget renderers are
  redesigned onto the shared Hearth card vocabulary; a wall-scoped stylesheet is
  added and imported by the wall surface so it lands in the wall chunk.
- **Shared contract (`packages/shared/src/wall.ts`, `wall-schema.ts`)**:
  `temperature` is added to `WALL_WIDGET_TYPES`, with a `WallTemperatureWidgetConfig`
  type and its schema added to `WALL_WIDGET_CONFIG_SCHEMAS`;
  `scripts/contract-inventory.json` is updated if the new type is a tracked
  contract. This is the only shared change.
- **Wall editor (`packages/web-ui/src/app/wall/editor/**`)**: the type picker and
  per-type config fields offer the temperature widget, and any redesigned
  widget's config surface is reflected. The editor itself stays on Lumen.
- **Wall device tile (`packages/web-ui/src/app/components/DeviceTile.tsx`)**:
  its wall (`size="wall"`) mode is redesigned to Hearth — the light card gains
  the icon-affordance toggle, the brightness bar, and the colour-temperature and
  colour controls — while its props, capability ranking, optimistic override,
  and state encoding are unchanged and the dashboard's rendering is unaffected.
- **Wall entry (`packages/web-ui/src/app/views/WallView.tsx`, `App.tsx`)**: the
  wall stays a lazily-loaded chunk; the Hearth stylesheet import is added to the
  wall surface, not to the entry.
- **Entry stylesheet (`packages/web-ui/src/app/styles/app.css`)**: unchanged as
  the dashboard's Lumen entry; Hearth is a separate stylesheet.
- **Build (`packages/web-ui/scripts/build-web-ui.ts`)**: a small change is
  required. `splitting: true` already emits on-demand JS chunks and the build
  excludes `chunk` outputs from the first-paint budget, but Bun 1.4.3 folds an
  imported stylesheet into the entry CSS, so the wall's CSS must be loaded with
  the `file` loader (via a `wall/`-scoped build plugin) to become its own
  content-hashed asset; the first-paint classification also excludes copied
  `file` assets. The wall surface links the emitted asset when its chunk is
  evaluated.
- **Design system (`design-system/ts-ha/pages/wall.md`)**: rewritten for Hearth
  and the redesigned widget vocabulary; `design-system/ts-ha/MASTER.md` (the
  dashboard system) is unchanged.
- **Tests (`packages/web-ui/tests/wall-*.test.ts`, `web-ui-assets.test.ts`,
  `card-archetype.test.ts`)**: wall presentation tests are re-pointed at Hearth
  and extended for the redesigned widgets and the new temperature widget; the
  asset test gains a wall-stylesheet-not-in-first-paint assertion.
- **Wall cover transport (`packages/web-ui/src/app/components/CoverTransport.tsx`,
  `src/app/lib/card-archetype.ts`)**: cover detection is broadened so a cover is
  recognised by a writable transport action as well as a writable position, and
  the transport presents up/down/stop, using the declared transport action and
  falling back to the position extremes.
- **Device sources (`packages/core/src/device-sources/`)**: the Shelly cover
  capability description gains a writable transport action and
  `ShellySource.command()` dispatches it to `ShellyService.coverOpen/coverClose/
  coverStop` (`Cover.Open`/`Cover.Close`/`Cover.Stop`). The Zigbee source needs no
  change (a Zigbee cover already declares a writable `state`/`action` enum).
- **Changeset**: one is added covering `@ts-ha/shared`, `@ts-ha/core`, and
  `@ts-ha/web-ui`.
- **No `@ts-ha/cli` change.** `@ts-ha/core` changes only in the cover transport
  path (the Shelly cover capability and its command dispatch); no other core
  behaviour changes, and the `shared` ← `web-ui` direction and the "no `core`
  import" rule are unchanged.

## Non-Goals

- **No new widget runtime subsystem.** The temperature widget is a renderer over
  existing device state and readouts; no new backend, service, or endpoint is
  introduced.
- **No change to the composition model.** The author-placed, fixed-column grid
  is retained; an auto-composing ambient register was considered and explicitly
  rejected.
- **No change to wall behaviour** beyond the widget presentations, the light-card
  controls, the added temperature widget, and the cover transport action:
  profiles, the editor flow, scene triggers, live updates, and always-on/reconnect
  behaviour are retained.
- **The wall editor stays a dashboard surface** on the Lumen system; Hearth
  applies to the full-bleed wall display, not the admin `WallsView`/editor.
- **No change to the HTTP API or event-stream shape.** The temperature widget
  rides the existing wall-profile endpoints and the cover transport action rides
  the existing device-command property map; neither adds nor changes an endpoint.
- **No change to the dashboard's device tile or management surfaces.** The
  light-card redesign is wall-only (`size="wall"`); the dashboard keeps its
  shared tile, favorite/hide controls, and detail affordances.
- **No new runtime dependency** in any package, and no animation library.
