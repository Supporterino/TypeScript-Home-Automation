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
[Asset delivery](#asset-delivery)). Its **eighteen** widget types are: a clock/date
readout (client clock — no server data); current weather and, when the registered
service provides it, a forecast; instantaneous power and the home's recent
rolling-window usage, labelled with the span it covers, and no lifetime total (the
dashboard's own energy view keeps its Cumulative stat); a
temperature reading from a configured sensor, together with that sensor's humidity
where it declares one; a status/presence summary; a room's devices with an
all-on/all-off room command; the user's favorites; one or more
scene buttons that trigger an existing automation through the same manual-trigger
path the admin interface uses; a **link** that opens another named wall profile; a
**device grid** over an explicitly selected set of devices; and **one typed device
widget per device class** — `light`, `cover`, `fan`, `climate`, `lock`, `number`,
`select`, and the `entity` fallback (design.md D8). Each type has a fixed
**grammar**: **ambient** readouts (clock, weather, energy, temperature, status)
render chrome-less with large type directly on the background, while **control**
widgets (room, favorites, scene, link, devices, and every device widget) render as
surfaces whose whole card is the touch target — except a `scene` or a `link` at its
one-row minimum, and a read-only device widget at one row, which draw no surface and
are still the whole cell's touch target. A typed device widget's minimum is
**device-aware**: it is authorable at a single row exactly when its bound
device's card draws no control of its own (an `entity`, or a device whose only
writable state is its on/off toggle), while a card that draws one keeps a two-row
minimum; a widget placed below its effective minimum is replaced by the wall's
explanation rather than a clipped card. A widget whose backing feature is
unconfigured — for example weather with no weather
service registered — reports that inside its own area and never prevents the rest
of the profile from rendering.

A readout widget presents the readings its configured device declares, and presents
one the device does not declare as absent rather than as an empty line or a
placeholder. The temperature widget identifies its sensor by the device's **room
name** where the store assigns it one, otherwise by the device's shortened name,
keeping the full name as the label's tooltip. A temperature widget bound to a
sensor that also declares a humidity reading presents both — the humidity beneath
the temperature, as the widget's secondary reading, with its own unit — while a
sensor that declares only a temperature presents only the temperature. Neither case
needs a second device or a per-profile setting.

The **weather** widget composes for the box the frame hands it (design.md W7).
Leading with the ported 36 px circular icon makes its stacked layout — condition
and temperature, then the humidity/wind detail row, then the forecast — taller than
its 3 × 3 minimum-span cell, and the frame clips rather than pages, so the widget
resolves which of its parts to draw from that box: the condition and temperature
always draw, the humidity/wind detail row draws while the box holds it, and the
forecast draws only when the box holds both. At its default (and minimum) 3 × 3 span
it therefore presents the current condition, temperature, humidity, and wind; the
forecast appears from the span that holds it. Its declared minimum span is unchanged.

Every widget is composed from the wall's **single card vocabulary** — the ported
card anatomy and its ported token table (see
[Wall device cards](#wall-device-cards)). An ambient readout's leading glyph is the
ported tinted circular icon, a label and a caption sit on the ported primary and
secondary type, and a control widget's surface, its controls and its control
spacing are the ported ones. The widget frame and the zone band draw the ported
card surface — the same radius and inset as a device card — and the panel's own
chrome (the opt-in title, the zone caption, and a contained "too large for this
panel" with its route to the editor) draws the ported treatment rather than a
treatment of its own, so a panel reads as one system rather than a device card
system sitting on top of a second one. No widget declares an icon shape, a surface
radius or padding, a control treatment, or its own supporting type size.

A device widget is **typed**: its own type determines the card it presents, so the
wall renders one card per device class rather than one generic card for every
device. Each type is bound to a single device and carries the card's `layout`
(`default`, `vertical`, or `horizontal`) and a `collapsible_controls` flag that
hides the card's actions row while the device is inactive. Every device widget is
composed from the ported card anatomy — a tinted circular icon affordance, the
device's name over its state or primary reading, and, where the device has controls,
one actions row carrying the active control and the affordances for the others —
and every control actuates through the shared optimistic channel
(`reflect → reconcile → revert`), so a wall control reflects, reconciles, and
reverts exactly as it does elsewhere. A device widget whose bound device's card draws
**no control of its own** is authorable at a single row, composing the shared **slim**
card form — a single inline line (icon, name, state), the whole cell actuating a
toggle where the primary action is one, and no observation indicator; a widget whose
card draws one keeps a two-row minimum. A widget bound to a device whose
capabilities cannot drive its class reports that inside its own area instead of
presenting an inert card, which is also how a device class the device sources cannot
yet express behaves. See [Wall device cards](#wall-device-cards) below.

### Composition and panel fit

A wall is composed to be read from across a room. Card heights follow each
widget's declared span through a bounded row unit that reserves the panel padding
and inter-row gutters
(`clamp(50px, (availableHeight − chrome) / occupiedRows, 56px)`) rather than
stretching to fill the panel, so a small control is never inflated; `chrome`
reserves the panel padding and the inter-row gaps, and the unit is bounded at
**50 px** (`ROW_UNIT_MIN`, derived from the smallest card the ported card system
produces) and **56 px** (`ROW_UNIT_MAX`, the density ceiling just above it). Cards
are separated from each other, and inset from the panel edge, by a single gutter of
`clamp(16px, 2vmin, 24px)`. The row unit is only the vertical axis: a typed device
widget's minimum *column* span is **3** — its default span **3 × 2** — derived the
same way the row unit is: the fewest columns whose cell is at least the widest
bounded control row a card draws at its minimum span (the cover's Open/Stop/Close
transport), so `3 · 50 + 2 · 16 = 182` clears that row's 174 px — and a card at that
span never clips a control horizontally on either panel. A widget bound to a
control-less device is authorable at **3 × 1** instead; because that cell draws no
frame surface its content holds the wall's 42 px floor within one row unit, so the
derived floor is unchanged. A surfaced widget is padded by the
ported card surface's own inset — **10 px** (`--hearth-card-padding`) — so a
control widget's tile and a device card are the same surface, and a paging widget
reserves that inset above and below plus its page-control row and the gap under it
— **70 px** in all — before packing tiles. A widget title header is shown only
when the profile explicitly configures one; otherwise the widget's own content labels
it. The wall's density, row-unit bounds, gutter, and type ramp are recorded as a
design-system page override (`design-system/ts-ha/pages/wall.md`).

Fitting is a **resolved outcome**, not a guess. A profile that occupies fewer rows
than fill the panel keeps its natural height and is **centered**; a profile that
cannot fit the panel at the wall's floors renders a contained **"Too large for
this panel"** explanation with a route to the editor, rather than degrading to a
scroll. `overflowY: hidden` is set in every outcome: the wall **never scrolls**
(design.md D5/D10). A widget whose *own* content cannot fit the span it was
placed at does not scroll either — it **pages** its content and shows a page
affordance. The device grid, the favorites grid, and a room's tiles all page
through the same pure pagination rule, so the wall's only overflow responses are
an explanation (the authored composition) or a page (a widget's content). A paged
tile row is bounded against inflation as well
as against clipping: a row is drawn at the height the plan resolved — at least the
tile's own cell and at most **1.25×** it — and the widget centres the space its
tiles do not use rather than stretching a tile into it, so a tile renders at a
predictable size on every panel.

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
| Metric | `clamp(26px, 3.6vmin, 54px)` | weather, energy, status values; a roomy readout |
| Band | `clamp(20px, 2.4vmin, 32px)` | a grouped readout (the climate band, or a readout on a small card) |
| Title | `clamp(18px, 1.8vmin, 22px)` | widget titles |
| Label | 14 px | a widget's label and every caption — the ported primary size |
| Body (floor) | 12 px | any other wall text — the ported secondary size |
| Chip | **retired** | the compact status-chip exception is gone with its `--hearth-text-chip` token: the floor is the ported secondary size, so there is nothing left below it to except |

On the wall's 1920 × 1080 panel `vmin` is 10.8 px, so the hero renders at 54 px
and the metric at 39 px — both above the dashboard's 34 px ceiling. The
**band-readout** tier sits between the label tier and the metric tier: a grouped
readout renders on it at a small or default span and grows to the metric tier
only on a genuinely roomy card, so a group of readouts does not compete with a
card's hero. The ramp owns its floor: no wall body text renders below the 12 px
body floor, the ramp declares no tier beneath it, and the label tier is the ported
primary size, so a widget's supporting text and a device card's are the same type.
A **device card** draws neither ramp tier: it carries the ported card system's own
type — **14 px/500** primary over **12 px/400** secondary, with a 42 px control
height — which is now the same scale the ramp's label and body tiers state. A
readout renders its value and unit as one non-breaking unit, and a name too long
for its card is **shortened** — the distinguishing trailing words — rather than
truncated to a prefix several cards share, with the full name kept in the card's
`title`/`aria-label` (design.md D6).

### Wall device cards

A wall device card is **typed**: the widget's own type selects the card, and one
card per device class is offered rather than one card serving any device. The
catalogue is keyed by the device's **capability profile**, not a Home Assistant
domain (the capability vocabulary is open and each source labels its own kinds):
`light`, `cover`, `fan`, `climate`, `lock`, `number`, `select`, and `entity` — the
typed fallback that presents any device's name and state, so a switch, a read-only
sensor, and a device of no class all have an answer. The cards are ported from
[Lovelace Mushroom](https://github.com/piitaya/lovelace-mushroom) (Apache-2.0) and
re-implemented in React; the attribution is recorded in
[`THIRD_PARTY_NOTICES.md`](https://github.com/Supporterino/TypeScript-Home-Automation/blob/main/THIRD_PARTY_NOTICES.md).

Every card is composed from the ported anatomy: a circular icon affordance (36 px,
with a 24 px glyph) drawn on a tinted shape of the device's own colour — which is
the on/off control where the device has one — the device's name over its state or
primary reading, and one actions row that uses the card's full width. A row of
fixed-size controls — an icon control, or an enumerated control drawn as its
segmented form of one option per permitted value — distributes across that width,
while a row containing a flexible control — a slider, or an enumerated control
drawn as its single dropdown — keeps that control growing and centres the fixed
controls beside it, so no control is stretched into a different-looking affordance
or left bunched at the card's left. Each control is bounded horizontally — an icon
control is the ported 42 px control height wide, and
an enumerated control draws one touch-sized option per permitted value, each label
bounded to that same width with an ellipsis — so an actions row is bounded by its
control count rather than by its labels, and a card at its minimum span never clips
a control. An enumerated control whose permitted values do not fit the row at that
42 px target — a select card's values, a thermostat's mode, a fan's presets — draws
a single dropdown affordance carrying them all instead, so no option shrinks below
the target and every value stays reachable. Distribution only consumes width a card
already has, so the ported 42 px control height and 12 px control radius are
unchanged. The metrics are the ported ones, declared once as Hearth tokens:
**42 px** control height (the wall's touch target) and slider height, **12 px**
control radius, control spacing, card radius, and slider track radius, **10 px** card
padding, **14 px/500** primary over **12 px/400** secondary type, and a **10 px**
slider bar thumb. The slider keeps a native range input and redraws only its chrome,
so the control stays keyboard- and touch-operable at the ported height.

- **Light** — the icon affordance is the on/off control (state carried by the
  glyph's fill as well as its colour); the name sits over the brightness reading or
  `Off`; and the actions row carries the active control as the slider — brightness,
  colour temperature, or colour, whichever the device declares — with the other
  declared controls beside it. Operating a control while the light is off turns it
  on first.
- **Cover** — discrete, touch-friendly transport rather than a bare position
  slider: the position (when the device has one) is the primary reading, and the
  actions row carries Open, Stop, and Close, offering Stop **only** when a writable
  property can express it.
- **Fan** — the icon affordance is the on/off control, the name sits over the
  percentage reading, and the actions row carries the percentage as a slider with
  the presets beside it.
- **Climate** — the name sits over the temperature reading, and the actions row
  carries the setpoint as a slider with the thermostat's mode beside it.
- **Lock** — the name sits over its locked/unlocked reading, and the actions row
  carries Lock and Unlock, the one matching the reported state marked active.
- **Number** and **Select** — the bounded numeric control (a slider) and the
  enumerated control as the sole action: one touch-sized option per permitted value
  where they fit its row at the 42 px target, or a single dropdown affordance
  carrying every value where they do not. A control the device cannot express is not
  presented at all.
- **Entity** — the typed fallback: the icon affordance and the name over the state.
  Where the device's primary action is a pure toggle the whole card is the actuation
  target; where the device has no actuatable property the reading becomes the card's
  dominant content, with no control and no navigation affordance.

Each card resolves its composition from the box it is given, so a taller box
composes a richer form rather than inflating the smaller one, and a card's
`layout` and `collapsible_controls` options are honoured without reflowing the card
into a different one. The smallest form is **slim**: a single inline line — the
leading icon, the device's name, and its state — drawn only in a one-row read-only
cell, with the whole cell as the actuation target where the primary action is a
toggle and no observation indicator. Every read-only-capable card composes it, not
`entity` alone, so a read-only `lock`, `climate`, or `fan` reads the same as an
`entity` at one row. On the wall a device card still presents no favorite toggle,
no hide/unhide toggle, and no explicit open-detail affordance, and the observation
is demoted to a glyph-only non-textual indicator (its label and polled age stay in
`title`/`aria-label`) — or omitted entirely at one row. A device card inside a widget
frame — including each tile of a device grid, which renders the card of **its own**
device class — draws one surface, never a surface inside another.

### Cross-wall navigation

A `link` widget (`{ target, label? }`) is a route, not a widget with its own view:
activating it navigates to the target profile's address through the shared router,
so the URL changes, the browser's own back button works, and an always-on panel
restored at that address opens exactly that wall (design.md D11). It renders the
ported labelled control — the same treatment a room's command row and the wall's
own Back and editor affordances draw — at the ported control height and corner
radius, carrying the configured label or the target profile's name. At its **one-row
minimum** (`2 × 1`) the frame draws no surface and the route draws **flush** — no
border, no raised background, no inset — so the whole cell is the link's touch
target, at or above the wall's 42 px floor; at two rows or more the framed labelled
route returns, and the shared route keeps its pill for the framed case and for the
wall's own Back affordance. A wall
**opened from a link** presents an on-screen **Back** affordance at the foot of the
panel, so the hierarchy is walkable by touch as well as by the browser; a
wall reached by a deep link offers none, because there is nowhere in-app to return
to. A link whose target names no saved profile is not a separate error path — the
target wall presents its own unknown-profile explanation, which itself offers the
way back. Walls therefore form a walkable hierarchy of separate profiles rather
than a second composition model.

### Device grid

A `devices` widget (`{ qualifiedIds, title? }`) renders the device set the author
selected **explicitly** (never an enumeration of the whole inventory) as a uniform
grid of the typed wall device cards at their minimum span — a **3 × 2** cell, the
tile the packing counts — each tile presenting the card of **its own** device class
— so ranking, optimistic override, and state encoding stay single-source
(design.md D12). Its minimum span is **6 × 4** — two three-column tile columns by two
tile rows — so it cannot be placed too small to present a page. A span presents
`floor(columns / 3)` tiles across, so a twelve-column span presents **four** across,
an eight- or six-column span **two**, and a four-column span **one**.
It **pages rather than scrolls**: one page is drawn at a time with a `‹ n / m ›`
page affordance, drawn only while the selection pages, and a selection that fits is
one page. Each tile row is drawn at the height the plan resolved — at least the
tile's own cell, at most 1.25× it — and the widget centres the space its tiles do
not use rather than inflating a tile into it. An empty selection explains itself
inside the widget's own area, and the editor reports how many pages a selection
implies so an author sees a large selection's cost before saving.

### Editing

The wall itself is **read-only**: it presents no control for adding, removing, or
editing a widget. Profiles are created and configured at `/walls`, an ENGINE
navigation entry with its own reloadable URL. The editor configures a widget's
zone, a link's target profile, a device grid's selected devices, and a typed device
widget's bound device (offering only the devices whose capabilities can drive that
widget's class) together with the card's layout and inactive-controls setting, and
presents the draft at the wall's target panel aspect ratio (1920 × 1080) with a fit
verdict and a device grid's page count — refusing to save a draft the resolver
reports as unfittable. The editor's placement clamp and the save validation share the
wall's **device-aware minimum**, so a control-less device widget can be authored at
one row while a control-bearing one cannot. The editor reads and writes the current
profile version
(**2**); a profile stored at version 1 is migrated on load — a widget that named one
device becomes that device's typed widget at the same placement, and a widget that
named a set of devices keeps its selection — so no saved wall is lost. When a
profile is saved or deleted, the `wall` realtime event reaches
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

> **The wall's device cards and its profile shape changed.** The wall now renders
> one typed card per device class at the ported card system's own metrics — a 42 px
> control height, 14 px/500 primary over 12 px/400 secondary type, and a 36 px icon
> with a 24 px glyph — instead of the generic card at the wall's former 56 px
> touch target and 18 px device-card floor, so an existing wall renders smaller text
> and smaller drag targets. The wall profile contract went to version **2**
> (per-class device widget types, each with its own config); a stored version-1
> profile is migrated on load rather than rejected, but a version-2 profile cannot be
> loaded by an older build — see
> [Wall device cards](#wall-device-cards) above.

> **The wall carries one card vocabulary, and its supporting text is the ported
> card's.** The wall's earlier widget vocabulary and its pill affordances are gone:
> every widget, the widget frame, the zone band and the panel's own explanations are
> now composed from the ported card anatomy and its token table. Two guarantees move
> with it — the ramp's body floor becomes the ported secondary size (**12 px**) and
> its label tier the ported primary size (**14 px**), and the compact status-chip
> exception and its `--hearth-text-chip` token retire, since nothing is left below
> the floor to except. The frame's inset follows the ported card padding
> (**16 → 10 px**), which re-derives the paging reservation (**70 px**), the floors
> and the page counts the editor reports. The readout tiers are untouched, so what is
> read across a room is unchanged; see
> [Span-aware cards and the type ramp](#span-aware-cards-and-the-type-ramp) above.

---

## Implementation notes

- Served by a [Hono](https://hono.dev/) sub-app mounted inside the existing `Bun.serve()` instance — no extra port or process
- No browser test harness exists (design.md D23): decision logic (routing, capability ranking, revert deadlines, command coalescing, reserved-key filtering, log filtering, payload normalisation) lives in pure modules covered by `bun test`; component rendering itself is verified by hand
- Works in air-gapped environments — the compiled bundle is embedded in the package, not fetched from a CDN
