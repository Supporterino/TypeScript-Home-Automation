# Add Wall Display

## Why

The existing dashboard is an operator console: it is organised by audience into
control and operator groups, reached through navigation, and assumes a person
who knows what they are looking at. A wall-mounted tablet needs the opposite —
a full-bleed, glanceable composition of a few curated widgets, configured once
by the owner and consumed by anyone, with no navigation and no admin chrome.

Today there is no way to stand up a panel that shows exactly what a household
wants to see at a glance (time, weather, energy, a room's lights, favorite
devices, a "Good night" button) without exposing the whole admin interface.
This change adds that surface while reusing the existing engine, data layer,
and design system.

## What Changes

- **New wall surface** at `GET {basePath}/wall/:profile`, rendered full-bleed
  with no application header, navigation, or footer, so widgets fill the panel.
- **Named profiles** — a home can run several walls (kitchen, hallway), each a
  distinct composition, addressed by name.
- **A 12-column widget grid** — each widget declares `{x, y, w, h}` spans on a
  layout that reflows for portrait and landscape.
- **An admin editor** at `{basePath}/walls` to create, rename, delete, and
  configure profiles, and to add/arrange widgets without dragging (an add-list
  plus a cell/span picker). The wall itself is read-only.
- **A widget catalog**: clock/date, weather, energy, room group with controls,
  favorites grid, single device control, status/presence summary, and scene
  buttons. Device-control widgets reuse the existing tile presentation scaled
  for touch; scene buttons fire existing automations rather than introducing a
  scene subsystem.
- **Profile persistence** under the reserved `$internal:` state namespace, with
  a new `WallManager` and `GET/POST/PUT/DELETE /api/walls[/:name]` endpoints —
  mirroring how rooms are stored and served. Wall profiles are therefore not
  editable through the State view.
- **A `wall` realtime event** so an open wall re-renders the moment its profile
  is saved in the editor.
- **Kiosk robustness** for always-on use: bounded memory and verified
  reconnect behaviour over multi-day sessions. Screen wake-lock, fullscreen
  manifest, and burn-in mitigation are intentionally out of scope (left to the
  host/tablet).

## Capabilities

### New Capabilities

- `wall-display`: The wall surface itself — profile-addressed full-bleed
  rendering, the widget grid and catalog, touch-target requirements, read-only
  wall semantics, scene buttons via automation triggers, the admin editor and
  profile config model, and always-on reconnect behaviour.

### Modified Capabilities

- `http-server`: Adds the wall-profile CRUD endpoint inventory (`/api/walls`).
- `realtime-events`: Adds the `wall` event category, and requires profile
  changes to be broadcast as that typed event rather than as reserved-key state.
- `web-ui`: Adds the `wall` (full-bleed) and `walls` (editor) view segments,
  extends the route allowlist, and documents the full-bleed render mode and the
  wall editor's place in navigation.
- `packaging`: Permits a pure, browser-safe validation schema (and its pure
  validator dependency) in `@ts-ha/shared` so the wall-profile config shape has
  a single definition site shared by the server and the editor.

## Impact

- **Core**: new `WallManager` (reserved-namespace persistence, event emission),
  new `/api/walls` routes on `HttpServer`, a `wall` event in the shared stream
  contract, and engine wiring.
- **Web UI**: two new route segments kept in sync across `lib/router.ts` and
  `web-ui-routes.ts`; a full-bleed render branch in `App.tsx`; a new widget
  registry, grid renderer, eight widget renderers, a scaled device tile, and the
  editor/view components — all in one lazy `wall` chunk off first paint.
- **Shared**: the wall-profile config type and its Zod schema, and the `wall`
  stream event contract. `@ts-ha/shared` gains a pure, browser-safe validation
  dependency (`zod`) as its first runtime dependency — permitted by the
  `packaging` delta and contained to the wall's lazy chunk in the browser.
- **No new runtime dependencies**: the editor is form-based, the grid is CSS,
  and charts remain hand-rendered SVG. The only dependency added is the pure
  validator already used by core.
- **Auth**: unchanged — `/api/walls` sits behind the existing `/api/*`
  middleware; the wall route uses the existing session cookie.
