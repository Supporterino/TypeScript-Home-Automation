# ts-ha — Wall Display (Hearth)

The full-bleed wall (`/wall/:name`) renders in **Hearth**, the wall's own visual
language. Its declaration site is
`packages/web-ui/src/app/wall/hearth.css` — `--hearth-*` custom properties under
the wall root scope (`[data-wall-chunk]`, carried by `wall/WallGrid.tsx`). Dark is
authoritative; light is a designed scheme under `[data-theme="light"]`. The tables
below mirror `hearth.css`; where they disagree, `hearth.css` wins.

This page is the wall's own design-system declaration, not a token-by-token
adjustment of MASTER. `MASTER.md` remains authoritative for the dashboard and for
the wall editor.

The wall is full-bleed, always-on, operated by touch, and read from across a room.
Hearth is dark-first and **true-black** — no glass, no full-white surface — with a
single interactive accent and a distance-sized type ramp over a deliberately quiet
composition. A profile is authored on a fixed 12-column grid; a card's *content* is
composed for the span it was placed at (see "Span-aware cards"), and the whole
composition is **resolved to fit its panel**, never scrolled (see "Panel fit").

## Divergence from Lumen (the dashboard system)

Hearth is a deliberate second design system, not a reskin of Lumen:

- **No shared token.** No `--hearth-*` value aliases a Lumen token, and no wall
  module under `wall/` dresses in `--bg`, `--surface`, `--hairline`, … —
  `styles/app.css` (Lumen) is untouched. The two systems may drift; that is
  accepted and confined to the wall.
- **Wall-owned scope.** Hearth is declared for the wall surface only. `MASTER.md`
  (Lumen) is the dashboard system and governs every dashboard view.
- **The editor stays on Lumen.** `/walls` and `wall/editor/**` are an
  administration surface operated on a non-wall device, so `WallEditor`,
  `WidgetConfigFields`, and `views/WallsView.tsx` keep the dashboard's Lumen
  system. Hearth applies to the full-bleed wall display only; keeping the editor
  off Hearth also keeps Hearth's stylesheet out of the editor's chunk.
- **The editor previews a wireframe, not the wall.** `wall/editor/preview.ts`
  resolves the draft through the wall's own pure layout — zones and the fit
  verdict — and draws **each widget's cell and label**, not the widget, at the
  wall's target panel (1920 × 1080 landscape). It reaches no Hearth token, so the
  preview cannot pull the wall's stylesheet back into the editor chunk or first
  paint.
- **One face, not two downloads.** Hearth reuses the self-hosted display face
  (`Plus Jakarta Sans`, declared in `app.css`) and sets its own ramp on top of it
  rather than adding a second font asset.
- **Do not repeat MASTER's dashboard tokens here.** Anything not stated on this
  page for the wall is a dashboard rule, not a wall rule.

## Color — true-black dark, designed light

Dark is the authoritative scheme and the wall's resting appearance: `#000000`
canvas, near-black raised surfaces, an accent reserved for interactive affordance,
and status colours chosen for a low-light panel. Every colour token has an explicit
value in **both** schemes.

| Token | Dark (authoritative) | Light (designed) | Use |
|---|---|---|---|
| `--hearth-canvas` | `#000000` | `#f4efe8` | panel background |
| `--hearth-band` | `#070709` | `#f8f4ee` | zone band field |
| `--hearth-surface` | `#0c0c0e` | `#fffdf9` | control card / tile |
| `--hearth-surface-raised` | `#16161a` | `#faf3ea` | raised control, button |
| `--hearth-surface-sunken` | `#050506` | `#ece4d9` | inset / off-state control |
| `--hearth-hairline` | `rgba(255,255,255,0.1)` | `#ded3c4` | borders, dividers |
| `--hearth-text` | `#f5f5f7` | `#1c1815` | primary text |
| `--hearth-text-muted` | `#a8a8b3` | `#6b6157` | labels, quiet text |
| `--hearth-on` | `#6fd39a` | `#0f7a4a` | device on / active |
| `--hearth-off` | `#8a8a94` | `#6b6157` | device off |
| `--hearth-stale` | `#e3b341` | `#9a6408` | stale observation |
| `--hearth-danger` | `#f0716f` | `#b3261e` | unreachable / failed |
| `--hearth-info` | `#74b6ff` | `#1f5fbf` | informational |
| `--hearth-accent` | `#f0a35e` | `#b45309` | interactive accent |
| `--hearth-accent-fg` | `#1b1103` | `#fff8ef` | text on accent |
| `--hearth-focus` | `#ffca8a` | `#8a4a08` | keyboard focus ring |
| `--hearth-scrim` | `rgba(0,0,0,0.72)` | `rgba(12,10,8,0.5)` | overlay scrim |

The **light** scheme is designed for a warm light panel — it is not computed by
inverting the dark scheme. Every colour token is restated explicitly, and the
elevation shadows are re-declared for a light surface rather than reused. Each
scheme also declares its own `color-scheme`.

`--hearth-band` is the wall's **one container field**: a surface slightly lifted
from the canvas and held below a member tile's surface, so a zone can group its
members without nesting one surface inside another (see "Zones").

**State encoding is never colour alone.** On a true-black panel the shape/fill of a
glyph or a label always accompanies the colour — an on/off affordance changes the
icon's fill as well as its token, and the compact status chips stay.

No per-room hue: a room card and its members use the same Hearth surface, hairline,
and text tokens as every other card. A zone band is the one additional surface a
room's tiles can sit on, and it is uncoloured by room.

## Typography — the distance ramp

The ramp is wall-owned; its numeric bounds live in `wall/type-ramp.ts`
(`WALL_TYPE_RAMP`) and its CSS tokens in `hearth.css`, so a CSS and a numeric
consumer cannot drift apart (`tests/wall-type-ramp.test.ts` asserts the two agree).
The whole component scale is set from the reduced table below — the hero, metric,
title, and label tiers and their `vmin` coefficients were lowered so a card renders
roughly **25–30 % smaller** on the panel.

| Tier | Size | Use |
|---|---|---|
| Hero | `clamp(36px, 5vmin, 76px)` | the clock time |
| Metric | `clamp(26px, 3.6vmin, 54px)` | weather, energy, status; a roomy device readout |
| Band | `clamp(20px, 2.4vmin, 32px)` | a grouped readout (the climate band, or a readout on a small card) |
| Title | `clamp(18px, 1.8vmin, 22px)` | device names, card titles |
| Label | 18 px | metric labels, uppercase card labels, band captions |
| Body (floor) | **18 px** | any other wall text |
| Chip | 16 px | compact status chips (deliberate exception) |

On the wall's 1920 × 1080 panel `vmin` is 10.8 px, so a `clamp` token resolves at
its `vmin` term unless a bound caps it: the hero renders at **54 px**, the metric at
**39 px**, the band at **26 px**, and the title at **19 px**. The hero and metric
stay above the dashboard's 34 px ceiling; the **band** tier deliberately does not,
sitting between the label tier and the metric tier and above the 18 px body floor,
so a group of readouts does not compete with a card's hero.

**The ramp owns its body floor.** The wall's minimum body size is `bodyMin`
(**18 px**, above the spec's 16 px minimum and above the dashboard's 16 px
`--text-base`): no wall body text may render below it. The compact status-chip
exception is the one deliberate case beneath the floor.

Weights are 500 / 600 / 700 and leading is 1.05 (tight) / 1.2 (snug) / 1.45 (body).

## Spacing, radius, elevation, motion

- Spacing rhythm (4-based): 4 / 8 / 12 / 16 / 24 / 32 / 48 px
  (`--hearth-space-1` … `--hearth-space-7`).
- Radius: `--hearth-radius-sm` 10 px, `-md` 16 px, `-lg` 24 px, `-pill` 999 px.
  A zone band and a control card both draw `-md`; the band is the one other
  consumer of it.
- Elevation: `--hearth-e0` none — a resting card is flat on the panel's black,
  separated by the hairline; `--hearth-e1` `0 1px 2px rgba(0,0,0,0.6)` — a raised
  control; `--hearth-e2` `0 18px 44px rgba(0,0,0,0.7)` — a pressed tile or
  overlay. Light declares its own, lower-key shadows
  (`rgba(28,24,21,0.12)` / `rgba(28,24,21,0.2)`). A band is not elevated: it is a
  field, not a card.
- Motion: `--hearth-motion-fast` 130 ms, `--hearth-motion-base` 200 ms,
  `--hearth-motion-enter-translate` 10 px, `--hearth-motion-ease`
  `cubic-bezier(0.16, 1, 0.3, 1)`. Under `prefers-reduced-motion: reduce` fast and
  base collapse to `0.01 ms`; no animation library is used, and a state change
  never alters layout bounds.

## Kiosk touch targets and separation

The wall is operated by touch from a distance, so every interactive control meets a
**kiosk-class minimum of 56 CSS pixels** — `WALL_MIN_TOUCH_TARGET` in
`wall/registry.ts` — and the wall tile's embedded controls are sized to the same
target (`wallTileMetrics("wall").control` in `wall/scale.ts`). A page control, a
link, and a device grid's tiles are all built on that same target, so navigation
and paging are as operable as a device's own control.

Adjacent controls keep at least an **8 px** separation — `WALL_MIN_CONTROL_GAP` in
`wall/registry.ts`, matching `--hearth-space-2` — so a touch intended for one
cannot plausibly activate its neighbour. Rows of controls may space further (the
light card's regular stack uses 12 px, its compact control row uses 8 px), but never
less. Every control is operable without a hover interaction; no affordance depends
on a pointer.

## Grid rhythm and panel fit

The grid is the wall's one placement layer: a fixed 12 columns, with each widget (and
each zone band) drawn at the cell box its configuration declares.

- **Row unit** — one grid row is
  `clamp(56px, (availableHeight − chrome) / occupiedRows, 80px)`, never `1fr`,
  where `chrome = 2·g + (occupiedRows − 1)·g` with `g` the gutter's 24 px upper
  bound (reserving padding and inter-row gutters, so a profile that fits is not
  pushed past the panel by its own chrome). `ROW_UNIT_MIN` = **56 px**,
  `ROW_UNIT_MAX` = **80 px**. A card's height tracks its declared `h` span times
  this unit, so a small widget is never inflated to fill the panel, and an empty
  profile resolves to the ceiling.
- **The floor is derived, not chosen** — it is the row unit at which a minimum-span
  `device` cell (2 rows) holds the compact wall light card with nothing to spare:
  the card needs 2 touch-target rows plus a one-control-gap surface inset per side
  (**128 px**), so `2 · ROW_UNIT_MIN + 16 = 128` ⇒ **56**. Moving the compact card
  moves the floor with it; `wall-grid.test.ts` asserts the derivation against the
  wall's real touch target, control gap, and device minimum span. Because the
  reduced scale lowers this floor, the `tooLarge` outcome becomes rarer with it
  rather than more common.
- **Composition** — a profile occupying fewer rows than the panel keeps its natural
  height and is **centered** (`alignContent: center`); each card keeps its
  span-derived height rather than stretching. The row unit is measured live from the
  panel (`ResizeObserver`), so a same-orientation viewport change re-resolves it.
  The grid stays fixed at 12 columns; an orientation override replaces the base
  layout entirely.
- **Gutter** — a single token for both the grid `gap` and the panel `padding`:
  `clamp(16px, 2vmin, 24px)`; the guaranteed floor is **16 px** and the ceiling
  **24 px**.
- **Titles are opt-in** — a widget header is drawn **only** when the profile sets a
  title; otherwise the widget's own content labels it. The type label is never a
  fallback header.

### Panel fit — the wall never scrolls

Fitting is a **resolved outcome**, not an author's guess. The pure resolver
(`wallGridMetrics` in `wall/grid.ts`) returns the row unit, the composition's
height, the panel's usable height, and an explicit verdict:

- **`fits`** — the composition is rendered within the panel, centered, and the
  panel does not scroll.
- **`tooLarge`** — an authored composition that cannot fit the panel at the wall's
  floors renders a **contained explanation** in place of the grid: the wall's own
  message form — "Too large for this panel" plus a sentence naming the wall's
  minimum touch target and body size — and a route to the wall editor. It is
  actionable, not silent.

`wallGridStyle` sets `overflowY: hidden` (and `overflowX: hidden`) in **every**
outcome; the former `auto` branch is gone, because a wall panel that scrolls is
broken by definition. A widget whose *own* content cannot fit the span it was placed
at does not overflow either: it **pages** its content and shows a page affordance
(the device grid is the one such widget). So there is no scroll anywhere on the
wall — overflow becomes an explanation (the authored composition) or a page (the
widget's content).

The editor resolves the same verdict from the same pure module, at the panel's own
height, and **refuses to save a draft it reports as `tooLarge`**. A draft the editor
reports as fitting is one the wall renders without scrolling.

Each renderer receives the resolved row unit alongside its span, so a widget whose
own geometry is span-derived (the device grid's pages) resolves against the panel it
was actually placed on rather than measuring itself.

## Zones — a labelled band behind its members

A zone is an **additive label** on the flat grid, not a second layout model.

- A widget MAY declare a `zone` label. A widget that declares none renders outside
  every band. The label is trimmed to a non-empty string of at most 40 characters
  (`WALL_ZONE_MAX_LENGTH`), so a blank caption cannot be persisted.
- The widgets that share a label are grouped into **one band** — the bounding box of
  its members, in the same cell space the widgets are placed in. Grouping never
  moves a widget: each member still occupies the cells its configuration declares.
- The band is drawn **behind** the member cells (band at the lower z-index, widgets
  above) as a `--hearth-band`, `--hearth-radius-md` field with `--hearth-space-4`
  padding. Members keep their own surface, so the wall gains a container level
  without nesting one surface in another.
- The band carries its **caption** — the zone label, uppercase, on the label tier,
  in `--hearth-text-muted`. It is a container label, not a readout.
- The band layer is inert to touch (`pointer-events: none`), so a tap between two
  members falls through to the grid rather than activating the band.

Band grouping is the author's: a **disjoint zone** — the same label at two unrelated
regions — yields one band spanning both. The editor's preview draws the draft's
bands before saving, so that is visible; the editor does not reorder the
composition.

## Span-aware cards

A card is composed for the span it was placed at, in **both** directions: it never
overflows its cells, and a card at a larger span does not repeat the composition its
smaller span draws.

The tier is derived from the widget **type's own registry spans** — the `min`,
`defaults`, and `max` below are the same values the editor's size rule enforces — so
the composition tier and the legal spans cannot drift:

- **`compact`** — the placement's area is no larger than the midpoint between the
  type's `min` and `defaults` areas. A type whose default *is* its minimum (`device`,
  `scene`) therefore always receives the compact composition at its smallest legal
  card.
- **`roomy`** — the area is at or above the midpoint between `defaults` and `max`.
- **`regular`** — everything between, which includes the type's default placement.

This is a discrete, build-time guarantee rather than a render-time
measure-and-shrink: there is no per-card `ResizeObserver` and no feedback loop with
the grid's own measurement.

Two rules ride the same tier choice:

- **A readout's value never leaves its unit.** A readout renders its value and unit
  as one non-breaking span, and chooses its tier by span — the band tier at a small
  or default span, the metric tier only on a genuinely roomy card — so a narrow cell
  never wraps a unit onto a second line.
- **A name is shortened, not truncated.** A card too narrow for a full device name
  presents a **short form** — the distinguishing trailing words within 14 characters
  (`shortDeviceName` in `lib/humanize-name.ts`) — so "Kitchen Ceiling Light" and
  "Kitchen Ceiling Lamp" read as "Ceiling Light" and "Ceiling Lamp", where a CSS
  ellipsis would render the same shared "Kitchen Ceili…" twice. A single word longer
  than the budget is kept whole rather than cut mid-word, and the full name stays in
  the card's `title`/`aria-label`. An explicitly configured label always wins.

## Widget card vocabulary

Every wall widget is composed from one Hearth card vocabulary
(`wall/widgets/card-vocab.tsx`), so the surface reads as one designed whole rather
than a set of independent tiles. The card frame carries four slots:

- a **leading glyph** (`WallCardGlyph`, 24 px) that names the card;
- a **title or label** (`WallCardLabel`) on the label tier, uppercase and quiet;
- a **primary metric** (`WallCardMetric`) on the ramp — hero, metric, or, through
  `wallReadoutFontSize`, the band tier;
- a single **action-affordance slot** (`WallCardAffordance`) on control cards,
  spaced by the ≥ 8 px adjacent-control floor.

A contained explanation (`WallCardMessage`) fills a widget's own area for an
unconfigured, empty, or unavailable state; a pressable control uses `WallButton`,
and a route affordance (the link widget) draws the same pill through
`wallAffordanceStyle()` — so a control and a route cannot drift apart visually. Both
are at least 56 px in **both** directions, which matters for an icon-only
affordance.

### Widget grammar

A widget type's grammar is fixed (not owner-selectable) and decides whether the
frame draws a surface:

- **Ambient** — `clock`, `weather`, `energy`, `temperature`, `status`. Rendered
  **chrome-less** with the vocabulary's stat form — a leading glyph, a label, and
  the value on the ramp, directly on the panel. They are read, not touched.
- **Control** — `room`, `favorites`, `device`, `scene`, `link`, `devices`. Rendered
  as a Hearth surface tile (`--hearth-surface`, `--hearth-hairline`,
  `--hearth-radius-md`) with a head (glyph + title), a metric, and the affordance
  slot. The `device` widget's frame is chrome-less so its single device card owns
  the surface; the `devices` widget's frame draws the surface and its tiles draw
  none, so a grid of tiles is still a single surface.

### Widget catalog and spans

The registry (`wall/registry.ts`) is the catalog's single source; the editor clamps
a placement to the type's minimum and maximum, and the span tier is derived from the
same three spans.

| Type | Grammar | Min (w × h) | Default | Max |
|---|---|---|---|---|
| `clock` | ambient | 3 × 2 | 6 × 3 | 8 × 4 |
| `weather` | ambient | 3 × 3 | 3 × 3 | 8 × 8 |
| `energy` | ambient | 3 × 3 | 4 × 4 | 8 × 8 |
| `room` | control | 4 × 6 | 6 × 6 | 12 × 10 |
| `favorites` | control | 3 × 5 | 6 × 6 | 12 × 8 |
| `device` | control | 2 × 2 | 2 × 2 | 6 × 6 |
| `temperature` | ambient | 2 × 2 | 3 × 2 | 6 × 4 |
| `status` | ambient | 3 × 2 | 4 × 3 | 8 × 6 |
| `scene` | control | 2 × 2 | 2 × 2 | 6 × 4 |
| `link` | control | 2 × 2 | 3 × 2 | 6 × 4 |
| `devices` | control | 4 × 4 | 6 × 4 | 12 × 12 |

### Redesigned widgets

- **Temperature** — an ambient readout over a configured sensor device
  (`{ qualifiedId, title? }`): a leading thermometer glyph, the short device name on
  the label tier, and the reading on the tier its span calls for — the band tier at
  its default span, the metric tier only when the card is roomy. A device that is
  unknown, unavailable, or reports no temperature is contained inside the widget's
  own area and never prevents the rest of the profile from rendering.
- **Readout card** — a chrome-less, non-navigable card for a device with no
  actuatable property: a leading readout glyph, the value on the tier its span calls
  for (muted when unreachable), and a quiet uppercase label. No control surface
  competes with the reading.
- **Scene tile** — a leading scene glyph in a 56 px tile at its minimum span, with
  the whole tile as the trigger affordance. At that span the glyph sits **beside**
  the label (the default placement's anatomy); a scene card with room centres a
  larger glyph **over** the label rather than repeating the minimum-span row. Pressed
  and busy are paint-only states (background, elevation, and a spinner in place of
  the glyph), so the tile does not shift while it is operated; a failed trigger is
  surfaced on the tile itself.
- **Link** — opens another named wall profile; see below.
- **Device grid** — an explicitly selected device set, paged; see below.
- **Light card** — redesigned on the wall-only `light` archetype (below).

### Link

A `link` widget (`{ target, label? }`) is a **route**, not a widget with its own
view: activating it navigates to the target profile's wall address through the
shared router, so the URL changes, the browser's own back button works, and an
always-on panel restored at that address opens exactly that wall.

- It renders a touch-sized Hearth pill — a leading forward arrow and the label, or the
  target profile's name when no label is configured — and both its sides meet the
  wall's minimum touch target.
- Its label is set on the label tier at a compact span and the title tier otherwise,
  so a large link does not repeat its smallest composition.
- A link whose target names no saved profile is not a separate error path: the
  target wall presents its own **unknown-profile explanation**, which itself offers
  the way back.
- A link with nothing configured explains that inside its own area rather than
  drawing a dead affordance.
- A wall **opened from a link** presents an on-screen **Back** affordance at the
  foot of the panel — touch-sized, over the composition, clear of the readouts along
  the top edge — so the hierarchy is walkable by touch and not only by the browser.
  A wall reached by a deep link offers none, because there is nowhere in-app to
  return to.

Walls form a walkable hierarchy of **separate profiles** — an overview wall and one
or more detail walls — rather than a second composition model or a layout mode inside
one profile.

### Device grid

A `devices` widget (`{ qualifiedIds, title? }`) renders the device set the author
selected **explicitly** (never an enumeration of the whole inventory) as a uniform
grid of the shared wall device card.

- Each tile is the device card at its **minimum span** — 2 × 2 cells, the cell the
  row-unit floor is derived for — so every tile carries the compact light card and
  the same touch target as a device card anywhere else on the wall. Ranking,
  optimistic override, and state encoding stay single-source.
- The frame draws the card's surface and the tiles draw none, so the grid is a single
  surface however many tiles it holds.
- The type's minimum span is **4 × 4** — two tile columns by two tile rows — so a
  device grid cannot be placed too small to present a page.
- **It pages rather than scrolls.** `wall/pages.ts` resolves how many tiles fit along
  each axis at the panel's row unit, keeping an 8 px gap between tiles, and the grid
  draws exactly one page, with a `‹ n / m ›` page affordance drawn only while the
  selection pages. A selection that fits is one page; a larger one is
  `ceil(count / tilesPerPage)` pages. A row unit below the wall's floor (a panel not
  yet measured) reads as the floor, so the plan degrades to the smallest cell the
  wall ever draws rather than dividing by an unknown unit.
- A paging grid reserves its own chrome from the span's height before packing tiles —
  the frame's 16 px inset above and below, one 56 px page-control row, and the 8 px
  gap separating it from the tiles, **96 px** in all — so a promised page always fits
  the card. Empty space is never reserved for a control that is not drawn.
- Page controls meet the wall's minimum touch target, and a tile actuates exactly as
  a wall device card does elsewhere. A selection edit that removes pages moves an
  open wall back onto a real page rather than a blank one.
- An empty selection explains itself inside the widget's own area.
- The editor reports how many pages a selection implies, so an author sees a very
  large selection's cost before saving.

## Wall device cards

A device card selects its presentation from the device's ranked capabilities. The
wall reuses the shared device tile (`components/DeviceTile.tsx`) in its
`size="wall"` mode: capability ranking, the optimistic
`reflect → reconcile → revert` channel, and non-colour state encoding remain
single-source, and the dashboard's rendering is untouched.

### Light card (wall-only)

The wall `light` archetype is a distinct design, not the dashboard tile with larger
type. It presents **every control the device declares** at every span — on/off,
brightness, and colour-temperature and colour **only** when declared — and only the
*form* adapts to the span. There are two forms:

**Compact form** — used when a wall light card sits at its minimum span, the case
the row-unit floor is derived from. It is exactly two touch-target rows:

- a 56 px pill whose icon (filled when on, outline when off) is the on/off control,
  marked `aria-pressed` and disabled while unreachable; state is carried by
  shape/fill and the on/off token, never hue alone;
- beside it the device's **short name** on the title tier, its brightness level as a
  percentage (normalised against the capability's own range) or `Off` on the
  readout tier, and the observation glyph;
- a second row of full-height **segments**, one per declared value control: brightness
  on a raised-surface track, colour-temperature as an info → accent spectrum, colour
  as a full spectrum. Each segment is a range input and the whole segment is the
  touch target, so the control keeps the wall's minimum size inside a minimum-span
  card.

The compact card's inset is one control gap (8 px) per side, so its composition is
exactly the 128 px the row-unit floor was derived from — it never overflows and never
drops a declared control.

**Regular and roomy forms** — the same controls with room to breathe: a 56 px icon
pill; the short name on the title tier with the brightness readout beside it; a
full-width brightness bar in the accent colour when the light is on and the off
token when it is not; and, for each declared colour capability, a spectrum bar above
a slider that drives it.

In both forms the bar's off state turns the light on when activated, and sets the
level, through the optimistic channels. A failed command reverts and surfaces inline
on the card. A control the device cannot express is never rendered inert, so two
lights of the same type can show different controls.

This card carries a value control *and* an on/off affordance together — a
deliberate, wall-only departure from the one-dominant-action rule; the dashboard
tile keeps its single dominant action.

### Cover transport

A cover — a device that positions, or that declares a writable transport action —
presents discrete **Open / Close / Stop** (up / down / stop) transport on the wall
rather than a bare position slider, so it is operable as a touch-friendly action:

- Open and Close command the device's declared transport action when it declares
  one, and fall back to the position extremes otherwise.
- Stop is presented **only** when a writable property can express it; a cover that
  cannot stop omits Stop rather than rendering it inert.
- Each control is a 56 px pressable button with no hover dependency; a failed
  command reverts and surfaces inline. The position readout appears only when the
  primary capability is a numeric position.

Transport is wall-only; the dashboard keeps its existing cover presentation.

### Suppressed affordances

On the wall a device card presents no favorite toggle, no hide/unhide toggle, and
no explicit open-detail affordance, and the observation is demoted to a glyph-only
non-textual indicator (the label and polled age stay in `title`/`aria-label`). A
pure toggle's whole card is its actuation target; a card with an embedded value
control is actuated through that control. A device card inside a widget frame draws
one surface, never a surface inside another — including each tile of a device grid.

## On-demand stylesheet

Hearth ships as its own content-hashed stylesheet, loaded only with the wall:

- `hearth.css` is imported **only** by the wall surface (`wall/WallGrid.tsx`),
  never by the entry `src/app/index.tsx` and never by the editor, so it lands in
  the lazy wall chunk.
- The build loads a `hearth.css` import whose importer is under `wall/` with the
  `file` loader, so Bun emits it as its own content-hashed asset instead of folding
  it into the entry CSS; copied `file` assets are excluded from the first-paint
  classification.
- `WallGrid` links the emitted URL when the wall chunk is evaluated, ahead of the
  wall's first render. Loading the dashboard therefore neither references nor
  fetches Hearth, and a changed stylesheet is served under a new URL.
- The editor's draft preview is a Lumen wireframe and reaches no Hearth token, so
  the preview does not pull the stylesheet into the editor chunk.
- `packages/web-ui/tests/web-ui-assets.test.ts` asserts the wall stylesheet is
  absent from the first-paint assets.

## Breaking appearance change

The wall **no longer scrolls**. A composition that cannot fit its panel at the
wall's minimum touch target and body size renders an explanation with a route to the
editor instead of a clipped or scrollable grid, and a device grid pages rather than
overflowing. Profiles that fit are unaffected; a profile authored for a taller panel
now reports itself rather than degrading silently.

## Unchanged

- Named profiles, the author-placed 12-column grid, orientation overrides, scene
  triggers, live profile updates, the configuration editor, per-widget error
  isolation, and always-on/reconnect behaviour.
- The wall profile contract's version: `zone` and the `link`/`devices` catalog
  entries are **additive**, so `WALL_PROFILE_VERSION` stays `1` and an existing
  profile keeps loading. A profile carrying a zone renders it; a profile that uses
  the new widget types needs a build that knows them.
- The shared device tile's behaviour — capability ranking, optimistic
  reflect/reconcile/revert, and non-colour state encoding — and the dashboard's
  Lumen rendering, including the dashboard's own light tile.
