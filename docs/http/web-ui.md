# Web UI

The `@ts-ha/web-ui` package provides an optional browser-based dashboard served on the same port as the HTTP server. It registers itself with the engine as a `ServicePlugin` — the core engine contains no web-UI-specific code. It is a control-first interface: the landing view is an **Overview** control surface that summarizes the home (live device metrics, favorites, and room zones) before listing it, with engine internals (automations, state, logs, HomeKit, energy, weather, walls editor) demoted to a distinct operator section.

The interface is built on a single designed visual system — **Lumen**, a
dark-first, light-designed semantic token layer declared once in the Tailwind CSS
entry stylesheet (palette, typography, spacing, elevation, radii, motion), where
the same token block is also the utility source. It is not component-library
defaults, and it ships with a self-hosted display typeface. The full-bleed wall is
the one exception: it is drawn in **Hearth**, its own wall-owned system, loaded on
demand rather than in the entry stylesheet (see [Wall displays](#wall-displays)).

---

## Enabling

```bash
WEB_UI_ENABLED=true
WEB_UI_PATH=/status   # optional, this is the default
```

Navigate to `http://your-host:8080/status`.

`WEB_UI_ENABLED` and `WEB_UI_PATH` are parsed by `@ts-ha/web-ui`, not the core
engine. `ts-ha run` reads `WEB_UI_ENABLED` only as a raw import gate (so a
disabled run never loads the package), then lets the package parse its own
options. The auth token is supplied by the runner from the core config's
resolved `HTTP_TOKEN`; the package never reads `HTTP_TOKEN` itself.

The web UI is disabled by default and adds zero overhead when disabled — the
package is imported lazily only when enabled, and adding it to `ts-ha run` is a
dynamic import.

---

## Embedding the UI in your own runner

`ts-ha run` registers the web UI plugin for you. If you build your own entry
point with `createEngine()` directly, setting `WEB_UI_ENABLED` has **no effect
on its own** — the core engine does not know the web UI exists. Register the
plugin explicitly, passing the core config's resolved `httpServer.token` as the
auth token:

```ts
import { createEngine, loadConfig } from "@ts-ha/core";
import { createWebUiService, parseWebUiOptions } from "@ts-ha/web-ui";

const config = loadConfig();
const options = parseWebUiOptions(); // reads WEB_UI_ENABLED / WEB_UI_PATH

const engine = createEngine({
  automationsDir: "./automations",
  services: options
    ? {
        "web-ui": createWebUiService({
          path: options.path,
          token: config.httpServer.token,
        }),
      }
    : {},
});

await engine.start();
```

The plugin is optional: a headless install does not need `@ts-ha/web-ui`, and a
run that leaves it out serves no UI routes. The `onStart` hook the engine calls
supplies the plugin's logger; request handlers read it lazily, so routes mounted
before `onStart` are safe.

---

## Information architecture

The interface is split by audience, not by feature area (design.md D13):

- **HOME** — a control surface. Overview (landing view), a favorites group (shown when any device is favorited), each user-defined room, an Unassigned-devices bucket, and an all-devices list.
- **ENGINE** — an operator surface. Automations, State, Logs, HomeKit, Energy, Weather, Walls.

This one IA is rendered by two navigation components depending on viewport:

| | Desktop (`md` and up) | Mobile |
|---|---|---|
| Layout | Sidebar, collapsible HOME/ENGINE groups | Safe-area app bar plus a control-first bottom bar with an overflow affordance |
| Content | Both groups, favorites and rooms listed dynamically under HOME | Home / Rooms / Devices, plus the remaining control entries in the overflow menu |
| ENGINE reachable? | Yes, in the sidebar | Yes, by direct URL — deliberately not promoted |

The mobile bar's omission of ENGINE is a deliberate statement that a phone is
a control surface, not a debugger. Every ENGINE view remains reachable by
navigating directly to its URL on any viewport; nothing is unreachable, it is
simply not promoted on the smallest screens.

Navigation indicates the active view, and a detail route keeps its parent
collection entry active: opening `/devices/:qualifiedId` leaves **All
devices** highlighted, and `/automations/:name` leaves **Automations**
highlighted.

---

## Routes

The dashboard uses real URL paths (not hash routing), so every view is
deep-linkable and reload-safe. Each top-level view segment is registered
explicitly on the server — there is no catch-all beneath the UI's mount path,
which would otherwise shadow health probes, webhooks, and the API when the
UI is mounted at `/` (design.md D7):

| Path (relative to `WEB_UI_PATH`) | View |
|---|---|
| `/` | Overview — at-a-glance control landing view |
| `/rooms` | Rooms index |
| `/rooms/:id` | Single room — members, room-level all on/off, assign/unassign, rename, delete |
| `/devices` | All devices |
| `/devices/unassigned` | Devices belonging to no room |
| `/devices/:qualifiedId` | Device detail — generic capability-driven controls |
| `/automations` | Automations list |
| `/automations/:name` | Automation detail — triggers, history, relationships, source |
| `/state` | Operator state view |
| `/logs` | Operator logs view |
| `/homekit` | Operator HomeKit view |
| `/energy` | Energy view — instantaneous power, cumulative total, per-device breakdown, trend |
| `/weather` | Weather view — current conditions and forecast |
| `/walls` | Wall editor — list, create, rename, delete, and configure wall profiles |
| `/wall/:name` | Wall display — a profile rendered full-bleed, with no application chrome |
| `/login`, `/logout` | Authentication |

A path beneath the UI's mount path that matches none of these — a typo, or a
segment the client has never had — falls through to a `404`, not the
dashboard shell. `:qualifiedId` and `:name` segments are percent-encoded; see
[API Reference](../api-reference.md#httpserver) for the qualified device
identifier's written form.

---

## Realtime updates

The dashboard opens a single Server-Sent Events connection (`GET /api/events`)
after fetching an initial snapshot over the ordinary REST endpoints, and
applies incremental deltas from the stream rather than re-polling on an
interval (design.md D9). A header indicator shows the connection state:

- **Live** — the stream is connected; updates apply as they arrive.
- **Connecting…** — the initial connection or a reconnect is in progress.
- **Degraded — polling** — the stream could not be established or dropped;
  the dashboard falls back to re-fetching a full snapshot every 5 seconds
  until the stream recovers, and switches back to **Live** automatically.

If the server signals that this connection fell behind its per-connection
buffer (a slow client under a burst of events), the dashboard re-reads the
full snapshot rather than trying to reconcile a gap — the same recovery path
used on an ordinary reconnect (design.md D28).

---

## Device control

Every device — Zigbee, Shelly, Nanoleaf, and configured state toggles alike —
is rendered from the same source-neutral capability schema (design.md D22),
so there is no per-device-family UI code anywhere in the frontend.

- **Tiles** (overview, room, and device-list views) show one curated primary
  action and one primary readout, chosen by a fixed ranking — on/off leads,
  followed by position, brightness, and setpoint for actions; temperature,
  humidity, occupancy, contact, illuminance, water leak, and battery for
  readouts (design.md D16). A device matching no rank degrades to a
  read-only tile that still opens the detail view rather than failing to
  render. A tile carries an explicit open-detail affordance; an embedded
  control (the primary action, the favorite toggle, the visibility toggle)
  never triggers it. State is encoded by more than color alone — an on/off
  or reachable condition pairs its color with an icon and a label — so the
  interface stays usable without color discrimination.
- **Device detail** renders every declared capability generically —
  switches, sliders (bounded by the declared range and step), selects (for
  enumerated properties, including a Nanoleaf effect list), and read-only
  text — with no hardcoded knowledge of any device family (design.md D12,
  D17).
- **Optimistic actuation**: a control updates immediately on interaction and
  reconciles against the next reported state. If no confirmation arrives
  before a deadline, the control reverts and surfaces the error. The
  deadline is derived from the device's own observation mode — short and
  fixed for a push-backed device, at least its reported refresh interval
  plus a margin for a polled one — so the client needs no per-family
  knowledge of `SHELLY_POLL_MS` or `NANOLEAF_POLL_MS` (design.md D21).
  Dragging a slider coalesces to at most one outstanding command per device
  and property, so an intermediate value never snaps the control backwards
  after the drag ends (design.md D31).
- **Reachability and freshness** are shown per tile and in device detail: an
  unreachable device is badged distinctly, and a polled device shows its
  observation age while a push-backed one does not.

### Favorites

A device can be marked or unmarked as a favorite from its own tile, without
knowing its identifier. Favorites are persisted as an ordinary state key
(a JSON array of qualified identifiers), not a device change, so they survive
a reload and are reflected in every connected dashboard as the state stream
delivers updates (design.md D9). A favorites group appears in navigation, and
favorited devices are presented on the Overview, only when at least one
favorite is set.

---

## Rooms

Rooms are a user-defined grouping spanning every device source — one room
can hold a Zigbee bulb, a Shelly plug, and a state toggle. A device belongs
to at most one room; assigning it to a new room removes it from the old one.
A device that becomes unavailable (unpaired, or its source disabled) is
**retained** in its room and shown distinctly as unavailable, rather than
dropped — it reappears automatically with no user action once its source
recovers (design.md D14).

A room view offers an **all on / all off** action that commands every
actuatable member through `POST /api/rooms/:id/command`. The request is
optimistic per member: the requested change is reflected immediately, and
each member reconciles against its reported state. A member whose command
fails reverts and surfaces its error while the others remain commanded;
members that do not support the command (e.g. sensors) are reported as
skipped, distinctly from failures. The endpoint is best-effort and does not
claim atomicity across members (design.md D5).

For a room whose actuatable members all share one on/off property family
(canonical `on`, or Zigbee2MQTT's `state`), the view issues exactly one
request. A mixed room — some members declaring `on` and others `state` — is
the deliberate exception: the endpoint requires every requested property to
be writable by each targeted actuator and rejects a property a member does
not declare, so the view sends **one batch request per property family**
(e.g. one for `on`, one for `state`) and merges the per-member outcomes. It
is not one request per device; a room with any number of devices across the
two families costs at most two requests.

---

## Wall displays

A wall display is a full-bleed surface for a wall-mounted touchscreen: a named
profile of curated widgets, configured once by the owner and then rendered as a
fixed, touch-operated composition. Unlike every other view, `/wall/:name` is
rendered **outside** the application shell, so it has no header, no navigation
rail, and no footer and its widgets use the whole panel (design.md D3).

A **profile** is addressed by its name and holds a composition of widgets on a
fixed 12-column grid; each widget declares its position and span (`{x, y, w, h}`)
and may declare a `zone` label, and a profile may carry a per-orientation layout
so it reflows between portrait and landscape without a second profile. Profiles
are stored in the state store's reserved internal namespace
(`$internal:wall:<name>`) through a dedicated `/api/walls` CRUD surface, so they
survive a restart, are rejected on write through the state API, and are not
listed by the State view (design.md D2). Creating or renaming a profile to a name
already in use is rejected; a saved configuration is validated against the shared
wall-profile schema on the server (and reused by the editor for client-side
validation), so a malformed composition is rejected rather than persisted
(design.md D10).

The wall is drawn in **Hearth**, the wall's own visual language, whose stylesheet
is loaded only with the wall and never by the dashboard (see
[Asset delivery](#asset-delivery)). Its eleven widget types are: a clock/date
readout (client clock — no server data); current weather and, when the registered
service provides it, a forecast; instantaneous and cumulative energy; a
temperature reading from a configured sensor; a status/presence summary; a room's
devices with an all-on/all-off room command; the user's favorites; a single
configured device; one or more scene buttons that trigger an existing automation
through the same manual-trigger path the admin interface uses; a **link** that
opens another named wall profile; and a **device grid** over an explicitly
selected set of devices (design.md D8). Each type has a fixed **grammar**:
**ambient** readouts (clock, weather, energy, temperature, status) render
chrome-less with large type directly on the background, while **control** widgets
(room, favorites, device, scene, link, devices) render as surfaces whose whole
card is the touch target. A widget whose backing feature is unconfigured — for
example weather with no weather service registered — reports that inside its own
area and never prevents the rest of the profile from rendering.

Device controls reuse the standard device tile in a **wall kiosk mode** — a size
token that enlarges controls to the touch-target minimum, plus a presentation
switch that omits the favorite, hide/unhide, and open-detail affordances and, for
a toggle primary, makes the whole card the actuation target (a value-setting
primary keeps its embedded control, since a bare tile activation cannot express
the value). This is **not** a second device presentation: the capability ranking,
optimistic override, and non-color state encoding stay single-source, so a wall
control reflects, reconciles, and reverts exactly as it does elsewhere. (This is
a wall-only revisit of `add-wall-display` design D7; the dashboard tile keeps its
explicit open-detail affordance.)

### Composition and panel fit

A wall is composed to be read from across a room. Card heights follow each
widget's declared span through a bounded row unit that reserves the panel padding
and inter-row gutters
(`clamp(56px, (availableHeight − chrome) / occupiedRows, 80px)`) rather than
stretching to fill the panel, so a small control is never inflated; `chrome`
reserves the panel padding and the inter-row gaps, and the unit is bounded at
**56 px** (`ROW_UNIT_MIN`, re-derived from the compact light card) and **80 px**
(`ROW_UNIT_MAX`). Cards are separated from each other, and inset from the panel
edge, by a single gutter of `clamp(16px, 2vmin, 24px)`. A widget title header is
shown only when the profile explicitly configures one; otherwise the widget's own
content labels it. The wall's density, row-unit bounds, gutter, and type ramp are
recorded as a design-system page override
(`design-system/ts-ha/pages/wall.md`).

Fitting is a **resolved outcome**, not a guess. A profile that occupies fewer rows
than fill the panel keeps its natural height and is **centered**; a profile that
cannot fit the panel at the wall's floors renders a contained **"Too large for
this panel"** explanation with a route to the editor, rather than degrading to a
scroll. `overflowY: hidden` is set in every outcome: the wall **never scrolls**
(design.md D5/D10). A widget whose *own* content cannot fit the span it was
placed at does not scroll either — it **pages** its content and shows a page
affordance. The device grid is the archetype, and the favorites and room tile
grids resolve their tile area through the same pure pagination rule, so the
wall's only overflow responses are an explanation (the authored composition) or a
page (a widget's content).

### Zones

A widget may carry an optional `zone` label. The widgets that share a label are
grouped into **one labelled band** — the bounding box of its members, drawn as a
tinted `--hearth-band` field behind the member cells and carrying the zone
caption. Grouping never moves a widget: each member still occupies the grid cells
its configuration declares, and a widget that declares no zone renders outside
every band (design.md D2). The band layer is inert to touch, so a tap between two
members passes through to the grid. A zone is an additive annotation rather than a
second layout model, so a disjoint zone — the same label at two unrelated regions
— yields one band spanning both; the editor's preview draws the draft's bands
before saving, so that is visible.

### Span-aware cards and the type ramp

A card composes its content for the span it was placed at, in **both** directions:
it never overflows its cells, and a card at a larger span does not repeat the
composition its smaller span draws. The tier — `compact`, `regular`, or `roomy` —
is derived from the widget type's own registry spans (`min`, defaults, `max`, the
same values the editor's size rule enforces), so composition and legal spans
cannot drift (design.md D3).

The wall's type ramp is sized for viewing at distance and was reduced roughly
25–30 % from its former scale (design.md D10):

| Tier | Size | Use |
|---|---|---|
| Hero | `clamp(36px, 5vmin, 76px)` | the clock time |
| Metric | `clamp(26px, 3.6vmin, 54px)` | weather, energy, status; a roomy device readout |
| Band | `clamp(20px, 2.4vmin, 32px)` | a grouped readout (the climate band, or a readout on a small card) |
| Title | `clamp(18px, 1.8vmin, 22px)` | device names, card titles |
| Label | 18 px | metric labels, uppercase card labels |
| Body (floor) | 18 px | any other wall text |
| Chip | 16 px | compact status chips (deliberate exception) |

On the wall's 1920 × 1080 panel `vmin` is 10.8 px, so the hero renders at 54 px
and the metric at 39 px — both above the dashboard's 34 px ceiling. The
**band-readout** tier sits between the label tier and the metric tier: a grouped
readout renders on it at a small or default span and grows to the metric tier
only on a genuinely roomy card, so a group of readouts does not compete with a
card's hero. No wall body text renders below the 18 px body floor; the compact
status chip is the one deliberate exception. A readout renders its value and unit
as one non-breaking unit, and a name too long for its card is **shortened** — the
distinguishing trailing words — rather than truncated to a prefix several cards
share, with the full name kept in the card's `title`/`aria-label` (design.md D6).

### Wall device cards

A wall device card selects its presentation from the device's ranked
capabilities. The wall `light` card is a distinct wall-only design that presents
**every control the device declares** — on/off, brightness, and colour
temperature and colour only when declared — at the type's minimum span; only the
*form* adapts:

- **Compact form** (a card at its minimum span, the case the row-unit floor is
  derived from): a 56 px on/off icon pill, the device's short name, its brightness
  level (or `Off`), and the observation glyph on the first row, then a second row
  of full-height **segments** — one per declared value control — where a segment
  stands in for the full-width slider and spectrum bar a larger card draws. Each
  segment is a range input and the whole segment is the touch target.
- **Regular and roomy forms**: the same controls with room to breathe — the icon
  pill, the name and readout, a full-width brightness bar, and, for each declared
  colour capability, a spectrum bar above its slider.

In both forms the bar's off state turns the light on when activated, and actions
go through the same optimistic channels; a failed command reverts and surfaces
inline. This is a wall-only departure from the one-dominant-action rule; the
dashboard tile keeps its single dominant action.

A cover presents discrete **Open / Close / Stop** transport at the wall's minimum
touch target rather than a bare position slider, offering Stop only when a
writable property can express it. On the wall a device card presents no favorite
toggle, no hide/unhide toggle, and no explicit open-detail affordance, and the
observation is demoted to a glyph-only non-textual indicator (its label and polled
age stay in `title`/`aria-label`). A device card inside a widget frame — including
each tile of a device grid — draws one surface, never a surface inside another.

### Cross-wall navigation

A `link` widget (`{ target, label? }`) is a route, not a widget with its own view:
activating it navigates to the target profile's address through the shared router,
so the URL changes, the browser's own back button works, and an always-on panel
restored at that address opens exactly that wall (design.md D11). It renders a
touch-sized pill carrying the configured label or the target profile's name. A
wall **opened from a link** presents an on-screen **Back** affordance at the foot
of the panel, so the hierarchy is walkable by touch as well as by the browser; a
wall reached by a deep link offers none, because there is nowhere in-app to return
to. A link whose target names no saved profile is not a separate error path — the
target wall presents its own unknown-profile explanation, which itself offers the
way back. Walls therefore form a walkable hierarchy of separate profiles rather
than a second composition model.

### Device grid

A `devices` widget (`{ qualifiedIds, title? }`) renders the device set the author
selected **explicitly** (never an enumeration of the whole inventory) as a uniform
grid of the shared wall device card at its minimum span, so ranking, optimistic
override, and state encoding stay single-source (design.md D12). Its minimum span
is 4 × 4 — two tile columns by two tile rows — so it cannot be placed too small to
present a page. It **pages rather than scrolls**: one page is drawn at a time with
a `‹ n / m ›` page affordance, drawn only while the selection pages, and a
selection that fits is one page. An empty selection explains itself inside the
widget's own area, and the editor reports how many pages a selection implies so an
author sees a large selection's cost before saving.

### Editing

The wall itself is **read-only**: it presents no control for adding, removing, or
editing a widget. Profiles are created and configured at `/walls`, an ENGINE
navigation entry with its own reloadable URL. The editor configures a widget's
zone, a link's target profile, and a device grid's selected devices, and presents
the draft at the wall's target panel aspect ratio (1920 × 1080) with a fit verdict
and a device grid's page count — refusing to save a draft the resolver reports as
unfittable. When a profile is saved or deleted, the `wall` realtime event reaches
every open wall displaying it, which re-renders without a reload; a profile
deleted while open — or one that never existed — is replaced with an explanatory
state and a route back to the editor rather than a blank panel (design.md D9).

### Kiosk limitations

A wall is expected to run unattended for long periods. It relies on the data
layer's existing resilience — reconnect-then-resnapshot with a fallback poll, and
bounded buffers — and its clock is derived from the client, so it keeps correct
local time even with the engine unreachable (design.md D11). The remaining
always-on concerns are deliberately left to the host device: **screen wake-lock,
a wall-specific fullscreen/PWA manifest, and burn-in mitigation are not provided**
by the application. The session cookie is also session-scoped, so a panel that is
rebooted rather than kept open requires a re-login; a wall-specific long-lived,
revocable credential is a possible follow-up, not part of this surface.

---

## Operator views

### Automations

List view with an enable/disable toggle per row. Detail view shows declared
triggers, an enable toggle, a manual "Trigger now" control (hidden while the
automation is disabled — attempting to trigger a disabled automation is
refused with `409`, so the control's absence is a guard rather than an
expected error, design.md D27), recent execution history, and the
automation's source code with syntax highlighting (TypeScript/JavaScript via
a lazily-loaded Prism — never fetched on first paint, design.md D15).

Relationships are split into **declared** (required services, related
devices, watched state keys — complete, taken from the automation's own
declarations) and **observed** (state keys written since the engine started
— grows with use, and is capped per automation with a "truncated" label once
that cap is reached, design.md R12, R15). A never-run automation shows empty
observed writes without implying it writes nothing.

### State

Lists, edits, and deletes ordinary state keys, updating live from the event
stream. Reserved internal keys (rooms, automation enabled flags — see
[State Management](../state.md#reserved-internal-namespace)) are never
listed and there is no free-text key field that could target one directly
(design.md D20).

### Logs

Filters by level, automation name, and free text, appending new entries as
the stream delivers them rather than polling. An SSE delivery failure on the
stream's own connection is deliberately logged to stdout only, not through
the log category itself — see the note on log-delivery logging below.

### HomeKit

Bridge status, pairing configuration, and accessory count, reading the same
`GET /api/homekit/status` endpoint used by the CLI dashboard. Reports the
service as "not configured" rather than erroring or rendering an empty
bridge when `HomekitService` is not registered.

### Energy

Instantaneous home power, cumulative consumption (displayed in kWh), a
per-device breakdown, and a rolling recent trend when history is enabled,
backed by `GET /api/energy` and updated from the event stream. An
unreachable metering device is reported as unavailable, never counted as
zero. The view remains useful with history disabled (current totals and
breakdown, no trend) and on a deployment with no metering devices
(explanatory empty state, no error). The trend is a hand-rendered SVG
sparkline — no chart library is added. See
[Configuration](../configuration.md#energy-monitoring) for
`ENERGY_SAMPLE_MS` and `ENERGY_HISTORY_MINUTES`.

### Weather

Current conditions and a daily forecast, backed by `GET /api/weather`. The
location is the configured default (`WEATHER_LATITUDE`/`WEATHER_LONGITUDE`)
when the client supplies none. When no weather service is registered the view
reports the feature as **unconfigured** rather than presenting an error or an
empty forecast. See [Configuration](../configuration.md#weather).

---

## Authentication

When `HTTP_TOKEN` is set the web UI requires authentication. On first visit the browser redirects to `/status/login` (adjust for your `WEB_UI_PATH`):

1. Enter the same token as `HTTP_TOKEN`
2. A session cookie (`ts-ha-session`, `HttpOnly`, `SameSite=Strict`) is set for the duration of the browser session
3. Navigate to `/status/logout` to clear the session

The dashboard's own `fetch` calls send `Authorization: Bearer <token>`; the
session cookie exists so a browser navigation to a plain HTML route (the
shell itself, which cannot attach a header) is also authenticated. The page
also works from a reverse proxy that injects the `Authorization` header.

When `HTTP_TOKEN` is empty the dashboard — and every `/api/*` route,
including `GET /api/automations/:name/source` — is publicly accessible with
no login. See [Configuration](../configuration.md#security-note-automation-source-is-readable-without-authentication)
before relying on an empty token in an untrusted network.

Compiled JS/CSS assets and the PWA manifest/icon are served unauthenticated
and immutably cached regardless of `HTTP_TOKEN` — they carry no instance
data, and the shell that references them must be able to load before a
session exists.

---

## Color scheme

The dashboard offers an explicit **light / dark / system** selection in the app
bar. The choice is persisted in `localStorage` and applied to the document's
`data-theme` attribute before the first paint, so a reload never flashes a scheme
other than the one selected; **system** follows `prefers-color-scheme` and reacts
to an OS change while it is selected. Dark is the authoritative scheme, and the
light scheme is designed in its own right rather than derived by inverting dark.

---

## Data API

The dashboard is backed by the same top-level `/api/*` routes documented in
full in the [API Reference](../api-reference.md#httpserver) — they are
**not** nested under `WEB_UI_PATH`; only the HTML shell, login/logout, and
static assets are. All routes require the bearer token or session cookie
when `HTTP_TOKEN` is set.

The dashboard fetches an initial snapshot from `GET /api/status`,
`GET /api/automations`, `GET /api/state`, `GET /api/device-catalog`,
`GET /api/rooms`, `GET /api/logs`, and `GET /api/homekit/status` (tolerating
a `404` there as "not configured"), then opens `GET /api/events` and applies
incremental deltas. The Energy and Weather views fetch their own endpoints
(`GET /api/energy`, `GET /api/weather`) lazily when opened — they are not part
of first paint — and refetch on stream reconnect. The wall editor and wall
display likewise fetch profiles from `GET /api/walls` / `GET /api/walls/:name`
only when opened, off first paint. See
[Realtime updates](#realtime-updates) above.

---

## Asset delivery

The entire frontend (React + Tailwind CSS) is compiled by `Bun.build` at build
time into content-hashed, pre-compressed (gzip) asset entries embedded in
the package as generated module constants — there is no external static
file directory, so the package still ships as a single importable module
(design.md D8). At runtime, each asset is served from its own
content-addressed route (`{WEB_UI_PATH}/assets/<hash>.<ext>`) with
`Cache-Control: public, max-age=31536000, immutable`; the HTML shell itself
is small and served with `Cache-Control: no-store`, since it references the
current build's hashed asset URLs and must never go stale.

A rebuild changes an asset's content, which changes its hash, which changes
its URL — so a new deployment is picked up on the next page load with no
cache-busting query parameter and no version number to bump. `bun run dev`
runs a watcher that rebuilds the manifest on every frontend edit; combined
with `bun --hot`, this is the entire development workflow — there is no
separate dev server and no `WEB_UI_DEV` flag.

The frontend's display typeface (a self-hosted subset of Plus Jakarta Sans,
weights 500/700) is emitted as a content-hashed `.woff2` and served from the
same content-addressed route as the scripts and stylesheets. It is never
fetched from a third-party origin, so the dashboard renders correctly on a
network with no internet access, and its transferred bytes are counted
against the first-paint budget.

**First-paint budget:** the JS, CSS, and font required for first paint
(excluding anything behind a dynamic import, such as the Prism syntax
highlighter, or the Energy and Weather views) is budgeted at 250 KB
transferred (gzip-compressed), asserted in `bun test` against the build
manifest (design.md D24, D26). Everything else — non-dashboard views, the
energy/weather views, Prism and its grammars — is lazily loaded behind
`React.lazy()` or a dynamic `import()` and never counted against first paint.

---

## Breaking changes

> **The tabbed dashboard was replaced outright, not incrementally ported.**
> Every operator view (state, logs, HomeKit) was rebuilt against the new
> snapshot-then-stream data layer rather than lifted from the old
> `useApiPoller`-based tabs, because the data layer underneath them changed
> regardless of whether the view itself was redesigned (design.md D25). There
> is no compatibility mode or dual-UI selector — the cutover is a single
> merge once the rebuild reaches parity (design.md R8). If you have deep
> links or bookmarks to the old tab-based UI, they no longer resolve; see
> [Routes](#routes) above for the new paths.

> **The device and HomeKit views degrade, rather than error, against a
> pre-rebuild engine.** This is inherited from an earlier phase that removed
> `GET /api/devices` and `GET /api/devices/:name` in favour of
> `GET /api/device-catalog` (design.md R13) — see
> [Configuration](../configuration.md#breaking-changes-for-upgrading-operators)
> for that migration note. It does not affect the rebuilt web UI itself,
> which was already written against the unified endpoints.

---

## Implementation notes

- Served by a [Hono](https://hono.dev/) sub-app mounted inside the existing `Bun.serve()` instance — no extra port or process
- No browser test harness exists (design.md D23): decision logic (routing, capability ranking, revert deadlines, command coalescing, reserved-key filtering, log filtering, payload normalisation) lives in pure modules covered by `bun test`; component rendering itself is verified by hand
- Works in air-gapped environments — the compiled bundle is embedded in the package, not fetched from a CDN
