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
| `--hearth-accent-faint` | `rgba(240,163,94,0.2)` | `rgba(180,83,9,0.2)` | the accent at 20 % alpha — a device card's slider field when the device reports no colour |
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

`--hearth-accent-faint` is the interactive accent at 20 % alpha. It is the field a
device card's slider draws when the device reports no colour of its own, so the
control is never left colourless and the device's colour is never asked to be a
surface (see "Wall device cards").

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
| Metric | `clamp(26px, 3.6vmin, 54px)` | weather, energy, status values; a roomy readout |
| Band | `clamp(20px, 2.4vmin, 32px)` | a grouped readout (the climate band, or a readout on a small card) |
| Title | `clamp(18px, 1.8vmin, 22px)` | widget titles |
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

A **device card** draws neither tier: it carries the ported card type from the
table under "Wall device cards" — 14 px/500 primary over 12 px/400 secondary —
which is the ported card system's own scale. The ported secondary size (12 px) is
the floor the spec names for it, below the ramp's 18 px body floor; every other
piece of wall text (widget titles and labels, ambient readouts, page controls,
contained explanations) still renders at or above the 18 px floor.

Weights are 500 / 600 / 700 and leading is 1.05 (tight) / 1.2 (snug) / 1.45 (body).

## Spacing, radius, elevation, motion

- Spacing rhythm (4-based): 4 / 8 / 12 / 16 / 24 / 32 / 48 px
  (`--hearth-space-1` … `--hearth-space-7`).
- Radius: `--hearth-radius-sm` 10 px, `-md` 16 px, `-lg` 24 px, `-pill` 999 px.
  A zone band and a control card both draw `-md`; the band is the one other
  consumer of it. A **device card** draws its own ported radii instead —
  `--hearth-card-radius` and `--hearth-card-control-radius`, both **12 px** (see
  "Wall device cards").
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
**minimum of 42 CSS pixels** — `WALL_MIN_TOUCH_TARGET` in `wall/registry.ts` — which
is the ported card system's own **control height** (the `--hearth-card-control-height`
token, and `WALL_CARD_METRICS.controlHeight`). The wall's own affordances are sized
to the same target (`wallTileMetrics("wall").control` in `wall/scale.ts`), so a page
control, a link, a scene tile, and a device grid's tiles are all as operable as a
device card's own control. The icon affordance of a card is the one control whose
*visible* shape is smaller than the target (the ported 36 px circle); the control's
own box is the full 42 px, so the touch target is met without enlarging the glyph.

Adjacent controls keep at least an **8 px** separation — `WALL_MIN_CONTROL_GAP` in
`wall/registry.ts`, matching `--hearth-space-2` — so a touch intended for one
cannot plausibly activate its neighbour. A device card's actions row spaces its
controls by the ported **12 px** control spacing
(`--hearth-card-control-spacing`), which is a floor the card draws with, not a
ceiling: the wall's own rows may space further but never less. Each control is also
bounded horizontally — an icon control is exactly the ported **42 px** control
height wide, and an enumerated control draws one touch-sized option per permitted
value, each label bounded to that same width with an ellipsis (`WallCardOption` in
`wall/cards/card-anatomy.tsx`) — so a row of options is bounded exactly as a row of
icon controls and a card's actions row is bounded by its control count rather than by
its labels. A select card's values, a thermostat's mode, and a fan's presets are all
this one control: where its permitted values do not fit its row at that **42 px**
target, it draws a single dropdown affordance carrying them all
(`WallCardDropdown`) instead, so no option ever shrinks below the target and every
value stays reachable. That bound is what makes the widest control row a finite
width, and so what a typed device widget's minimum *column* span is derived from (see
"Grid rhythm and panel fit"). Every control is operable without a hover interaction;
no affordance depends on a pointer.

## Grid rhythm and panel fit

The grid is the wall's one placement layer: a fixed 12 columns, with each widget (and
each zone band) drawn at the cell box its configuration declares.

- **Row unit** — one grid row is
  `clamp(50px, (availableHeight − chrome) / occupiedRows, 56px)`, never `1fr`,
  where `chrome = 2·g + (occupiedRows − 1)·g` with `g` the gutter's 24 px upper
  bound (reserving padding and inter-row gutters, so a profile that fits is not
  pushed past the panel by its own chrome). `ROW_UNIT_MIN` = **50 px**,
  `ROW_UNIT_MAX` = **56 px**. A card's height tracks its declared `h` span times
  this unit, so a small widget is never inflated to fill the panel, and an empty
  profile resolves to the ceiling.
- **The floor is derived, not chosen** — it is the row unit at which a minimum-span
  device cell (2 rows) holds the smallest card the ported card system produces with
  nothing to spare. That card's own budget is **116 px**: its 10 px inset, its 42 px
  icon row, and its 42 px control row plus the ported 12 px control spacing
  (`WALL_CARD_COMPACT_HEIGHT_PX` in `wall/cards/card-composition.ts`, read by
  `wall/grid.ts` rather than restated), so
  `2 · ROW_UNIT_MIN + 16 = 116` ⇒ **50**. Moving the ported card moves the floor with
  it; `wall-grid.test.ts` asserts the derivation against the card's real compact
  height, the gutter floor, and the typed device widget's minimum span. The ported
  card is smaller than the scale it replaced, so the floor drops with it and an
  authored composition that fit the panel before is still able to fit.
- **The width floor is derived the same way** — a typed device widget's minimum
  (and default) *column* span is the fewest columns whose cell, at the wall's
  floors, is at least the widest control row a card draws at its minimum span: the
  cover's three-control Open/Stop/Close transport, the widest bounded row the ported
  anatomy produces, **174 px** wide (`WALL_CARD_CONTROL_ROW_MIN_WIDTH_PX` in
  `wall/cards/card-composition.ts`). A `w`-column cell is
  `w · unit + (w − 1) · gutter` wide, so
  `3 · 50 + 2 · 16 = 182 ≥ 174` and `WALL_MIN_DEVICE_COLUMNS` = **3** — a card at
  its type's minimum span never clips a control horizontally, on either panel. The
  width axis never feeds the row derivation above, so the row unit is unchanged;
  `wall-grid.test.ts` asserts the derivation against the card's real row width and
  the typed device widget's minimum span.
- **The ceiling is a density choice, not a derivation** — it sits just above the
  floor (**56 px**) so a two-row device cell is not inflated to a block far taller
  than the 116 px card it holds. `wall-grid.test.ts` asserts it stays above the
  floor and near it.
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
at does not overflow either: it **pages** its content and shows a page affordance —
the device grid, a room's tiles, and the favorites grid all page through the one
shared rule. So there is no scroll anywhere on the wall — overflow becomes an
explanation (the authored composition) or a page (the widget's content).

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
  type's `min` and `defaults` areas. A type whose default *is* its minimum (every
  typed device widget, and `scene`) therefore always receives the compact
  composition at its smallest legal card.
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
are at least 42 px in **both** directions, which matters for an icon-only
affordance. A **device card** does not draw this vocabulary: it is composed from the
ported card anatomy under "Wall device cards", which supersedes it for devices.

### Widget grammar

A widget type's grammar is fixed (not owner-selectable) and decides whether the
frame draws a surface:

- **Ambient** — `clock`, `weather`, `energy`, `temperature`, `status`. Rendered
  **chrome-less** with the vocabulary's stat form — a leading glyph, a label, and
  the value on the ramp, directly on the panel. They are read, not touched.
- **Control** — `room`, `favorites`, `scene`, `link`, `devices`, and the eight
  typed device widgets (`light`, `cover`, `fan`, `climate`, `lock`, `number`,
  `select`, `entity`). Rendered as a Hearth surface tile (`--hearth-surface`,
  `--hearth-hairline`, `--hearth-radius-md`) with a head (glyph + title), a metric,
  and the affordance slot. A **typed device widget's** frame is chrome-less, so its
  card owns the surface and draws on the ported metrics; the `devices` widget's
  frame draws the surface and its tiles draw none, so a grid of tiles is still a
  single surface.

### Widget catalog and spans

The registry (`wall/registry.ts`) is the catalog's single source; the editor clamps
a placement to the type's minimum and maximum, and the span tier is derived from the
same three spans.

| Type | Grammar | Min (w × h) | Default | Max |
|---|---|---|---|---|
| `clock` | ambient | 2 × 2 | 4 × 2 | 8 × 4 |
| `weather` | ambient | 3 × 3 | 3 × 3 | 8 × 8 |
| `energy` | ambient | 3 × 3 | 4 × 4 | 8 × 8 |
| `room` | control | 4 × 6 | 6 × 6 | 12 × 10 |
| `favorites` | control | 3 × 5 | 6 × 6 | 12 × 8 |
| `temperature` | ambient | 2 × 2 | 3 × 2 | 6 × 4 |
| `status` | ambient | 3 × 2 | 4 × 3 | 8 × 6 |
| `scene` | control | 2 × 2 | 2 × 2 | 6 × 4 |
| `link` | control | 2 × 2 | 3 × 2 | 6 × 4 |
| `devices` | control | 6 × 4 | 6 × 4 | 12 × 12 |
| `light` | control | 3 × 2 | 3 × 2 | 6 × 6 |
| `cover` | control | 3 × 2 | 3 × 2 | 6 × 6 |
| `fan` | control | 3 × 2 | 3 × 2 | 6 × 6 |
| `climate` | control | 3 × 2 | 3 × 2 | 6 × 6 |
| `lock` | control | 3 × 2 | 3 × 2 | 6 × 6 |
| `number` | control | 3 × 2 | 3 × 2 | 6 × 6 |
| `select` | control | 3 × 2 | 3 × 2 | 6 × 6 |
| `entity` | control | 3 × 2 | 3 × 2 | 6 × 6 |

The eight typed device widgets share one `{ qualifiedId, layout?, collapsible_controls? }`
config: their `3 × 2` minimum and default is the smallest legal placement — three
columns, the width derived from the widest bounded control row a card draws, by two
rows, the cell the row unit is derived to hold a compact device card in with nothing
to spare — and `6 × 6` lets a card be enlarged to the roomiest composition the wall
draws (see "Grid rhythm and panel fit" and "Wall device cards"). The `devices`
widget's `6 × 4` minimum is two three-column tile cells by two tile rows, so a
device grid can never be placed too small to page.

### Redesigned widgets

- **Temperature** — an ambient readout over a configured sensor device
  (`{ qualifiedId, title? }`): a leading thermometer glyph, the short device name on
  the label tier, and the reading on the tier its span calls for — the band tier at
  its default span, the metric tier only when the card is roomy. A device that is
  unknown, unavailable, or reports no temperature is contained inside the widget's
  own area and never prevents the rest of the profile from rendering.
- **Read-only devices** — a device with no actuatable property renders through the
  typed `entity` card's read-prominent composition (see "Wall device cards"): the
  reading is the card's dominant content on the wall's own group-readout tier, the
  name takes the quiet ported secondary line, and no control surface competes with
  the reading. There is no separate readout card type.
- **Scene tile** — a leading scene glyph at the wall's 42 px touch target at its
  minimum span, with the whole tile as the trigger affordance. At that span the glyph
  sits **beside** the label (the default placement's anatomy); a scene card with room
  centres a larger glyph **over** the label rather than repeating the minimum-span
  row. Pressed and busy are paint-only states (background, elevation, and a spinner
  in place of the glyph), so the tile does not shift while it is operated; a failed
  trigger is surfaced on the tile itself.
- **Link** — opens another named wall profile; see below.
- **Device grid** — an explicitly selected device set, paged; see below.
- **Device cards** — one typed card per device class, ported from
  `piitaya/lovelace-mushroom`; see "Wall device cards".

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
grid of the wall's typed device cards.

- Each tile is a device card at its **minimum span** — 3 × 2 cells, the cell the
  row-unit floor is derived for and the cell the tile packing counts — and presents
  the card of **its own device class**, so a grid of a bulb, a blind, and a sensor
  draws three different cards at the same size and the same touch target as a placed
  device widget. Ranking, optimistic override, and state encoding stay single-source.
- The frame draws the card's surface and the tiles draw none, so the grid is a single
  surface however many tiles it holds.
- The type's minimum span is **6 × 4** — two three-column tile columns by two tile
  rows — so a device grid cannot be placed too small to present a page.
- **It pages rather than scrolls.** `wall/pages.ts` resolves how many tiles fit along
  each axis at the panel's row unit — a span presents `floor(columns / 3)` tiles
  across, so a twelve-column span presents **four** across, an eight- or six-column
  span **two**, and a four-column span **one** — keeping an 8 px gap between tiles,
  and the grid draws exactly one page, with a `‹ n / m ›` page affordance drawn only
  while the selection pages. A selection that fits is one page; a larger one is
  `ceil(count / tilesPerPage)` pages. A row unit below the wall's floor (a panel not
  yet measured) reads as the floor, so the plan degrades to the smallest cell the
  wall ever draws rather than dividing by an unknown unit.
- **A tile row is bounded against inflation.** Each row is drawn at the height the
  plan resolved — never taller than **1.25 ×** the tile's own cell
  (`WALL_TILE_ROW_HEIGHT_CAP`), and never shorter than it — and the widget centres
  the space its tiles do not use rather than stretching a tile into it. The bound
  changes no page count: the pitch still packs the tiles as it always did.
- A paging grid reserves its own chrome from the span's height before packing tiles —
  the frame's 16 px inset above and below, one 42 px page-control row, and the 8 px
  gap separating it from the tiles, **82 px** in all — so a promised page always fits
  the card. Empty space is never reserved for a control that is not drawn.
- Page controls meet the wall's 42 px minimum touch target, and a tile actuates
  exactly as a wall device card does elsewhere. A selection edit that removes pages
  moves an open wall back onto a real page rather than a blank one.
- An empty selection explains itself inside the widget's own area.
- The editor reports how many pages a selection implies, so an author sees a very
  large selection's cost before saving.

## Wall device cards

A wall device card is **typed**: one widget type and one card module per device
class, rather than one generic card serving every device. The cards are ported from
`piitaya/lovelace-mushroom` (Apache-2.0) into this repository's GPL-3.0 Hearth
language — the anatomy and the token values are ported, no Mushroom source is
vendored, and the attribution is recorded below. Mushroom's cards are `LitElement`
classes bound to Home Assistant's frontend (they read a `hass` object and render
`ha-*`/`hui-*` elements), so they cannot be imported; what ports exactly is the card
tree and its metrics.

The wall/dashboard divergence is deliberate: the dashboard keeps the shared
`components/DeviceTile.tsx` and its archetype ranking untouched, and the wall no
longer uses it at all.

### The catalogue

One card per device class, resolved from the device's **capability profile** —
never a Home Assistant domain, because the capability vocabulary is open and each
source labels its own kinds (`wall/cards/device-class.ts`). The wall widget and the
Mushroom card it ports:

| Mushroom card | Wall widget | Driven by | Status |
|---|---|---|---|
| light | `light` | `kind: "light"`, or a writable brightness / colour temperature / colour channel | in scope |
| cover | `cover` | `kind: "cover"`, a writable position, or a writable transport action | in scope |
| fan | `fan` | `kind: "fan"` (percentage, presets) | in scope |
| climate | `climate` | `kind: "climate"`, or a writable setpoint property | in scope |
| lock | `lock` | `kind: "lock"` | in scope |
| number | `number` | a writable numeric with a declared range | in scope |
| select | `select` | a writable enum with permitted values | in scope |
| entity | `entity` | any device: name + state, whole-card actuation where the primary action is a toggle | in scope (fallback) |
| switch | `entity` | `kind: "switch"` / `"outlet"` | in scope via `entity` |
| media player | — | no capability kind today | pending |
| vacuum | — | no capability kind today | pending |
| person | — | no capability kind today | pending |
| alarm control panel | — | no capability kind today | pending |
| update | — | no capability kind today | pending |
| humidifier | — | no capability kind today | pending |

`entity` is the handled fallback, so "no generic card" does not mean "no answer for
an unclassified device". A widget bound to a device its class cannot drive reports
that inside its own area rather than rendering an inert card — which is also how the
six pending classes behave until the device sources can express them.

Every typed device widget shares one config:
`{ qualifiedId, layout?, collapsible_controls? }`. `layout` is `default` /
`vertical` / `horizontal`, and `collapsible_controls` hides a card's actions row
while the device is inactive — Mushroom's two options that mean something on a wall.
Mushroom's `tap_action` / `hold_action` / `double_tap_action` are **not** ported (the
wall has no more-info surface and never hovers), and neither are `primary_info` /
`secondary_info` / `icon_type`: a card always draws its device's name and state.

### The anatomy

Every typed card is the same tree, in this order — the leading icon affordance, the
name over the state or primary reading, and one actions row:

```
card surface                       radius 12 px, padding 10 px
+--------------------------------------------------------------+
| ( icon )   name                                               |  state item:
|  36x36     state / reading                                    |  row, gap 10 px
|  circle                                                       |
+--------------------------------------------------------------+
| [ ==== active control ==== ] [btn] [btn]                      |  actions row:
+--------------------------------------------------------------+  gap 12 px,
                                                                   padding 12 px (top 0)
```

### The ported metrics

The values are ported verbatim from Mushroom's `src/utils/theme.ts` and its
`src/shared/{state-item,shape-icon,slider,card}.ts`, and declared once as Hearth's
own `--hearth-card-*` tokens in `wall/hearth.css`. `wall/cards/metrics.ts`
(`WALL_CARD_METRICS`, `WALL_CARD_GLYPH_SIZE`) mirrors them, and
`tests/wall-tokens.test.ts` asserts the two agree, so a card cannot drift from this
table.

| Token | Value | Ported from |
|---|---|---|
| `--hearth-card-icon-size` | 36 px | `--icon-size` |
| glyph | 24 px (`--hearth-card-icon-symbol` `0.667em` of 36 px) | `--icon-symbol-size` |
| `--hearth-card-icon-shape` | `50%` (circle) | `--icon-border-radius` |
| `--hearth-card-primary-size` | 14 px | `--card-primary-font-size` |
| `--hearth-card-primary-weight` | 500 | `--card-primary-font-weight` |
| `--hearth-card-primary-leading` | 20 px | `--card-primary-line-height` |
| `--hearth-card-primary-tracking` | 0.1 px | `--card-primary-letter-spacing` |
| `--hearth-card-secondary-size` | 12 px | `--card-secondary-font-size` |
| `--hearth-card-secondary-weight` | 400 | `--card-secondary-font-weight` |
| `--hearth-card-secondary-leading` | 16 px | `--card-secondary-line-height` |
| `--hearth-card-secondary-tracking` | 0.4 px | `--card-secondary-letter-spacing` |
| `--hearth-card-control-height` | 42 px (the wall's touch target) | `--control-height` |
| `--hearth-card-control-radius` | 12 px | `--control-border-radius` |
| `--hearth-card-control-spacing` | 12 px (the actions row's gap and padding) | `--control-spacing` |
| `--hearth-card-padding` | 10 px (the surface's inset) | `--spacing` |
| `--hearth-card-radius` | 12 px (the surface's radius) | the HA card radius |
| `--hearth-card-slider-height` | 42 px | the slider container's `--control-height` |
| `--hearth-card-slider-radius` | 12 px | the slider track's `--control-border-radius` |
| `--hearth-card-slider-thumb` | 10 px (the bar thumb's width) | the slider track indicator's width |
| `--hearth-card-slider-thumb-radius` | 3 px | the slider track indicator's radius |
| `--hearth-card-slider-thumb-color` | `var(--hearth-text)` | the wall's own foreground |

The values replace the wall's former invented device-card scale: a 56 px kiosk touch
target, an 18 px device-card body floor, a 16 px card radius, and a 26 px glyph. A
card's type and its controls are now the ported ones — which is the deliberate
trade-off recorded in the change, and the checks for it are the harness and the
`wall-display` requirements that were modified with it.

**The slider chrome.** The wall keeps a native `<input type="range">` for touch and
keyboard operation and redraws only its chrome (`[data-wall-chunk] .hearth-card-slider`
in `hearth.css`), so the ported 42 px height is the control's touch target without a
bespoke pointer implementation: a transparent track at the 12 px radius, and a 10 px
bar thumb at a 3 px radius filled with the wall's foreground. The card paints the
value's fill behind the input, over the control's own colour at 20 % alpha — or
`--hearth-accent-faint` when the device reports no colour.

### Device colour

A card carries the device's own colour on the affordances that set it, never as a
surface, and uses Mushroom's contrast improvement (`wall/cards/color.ts`): a colour
whose saturation is below **0.4** is raised to it, and one below **0.1** has its
value pushed to **225**. The improved colour is the glyph colour over a **25 %**-alpha
fill of itself and the slider's colour over a **20 %**-alpha field. A device that
reports no colour falls back to the wall's own accent (`--hearth-accent`, and
`--hearth-accent-faint` for the slider field).

### The cards

- **Light** — the icon affordance is the on/off control (the glyph states on/off by
  its fill as well as its colour, and the shape carries the light's contrast-improved
  colour); the name sits over the brightness reading or `Off`; and the actions row
  carries the active control as the slider — brightness, colour temperature, or
  colour, whichever the device declares — with the other declared controls beside it
  as touch-sized icon buttons. A control the device does not declare is never
  rendered, so two lights of the same model can show different controls. Turning a
  control while the light is off turns it on first.
- **Cover** — discrete, touch-friendly transport rather than a bare position slider:
  the position (when the device has one) is the primary reading, and the actions row
  carries Open, Stop, and Close as touch-sized icon controls, with Stop drawn **only**
  when a writable property can express it. Open/Close command the declared transport
  action and fall back to the position extremes otherwise.
- **Fan** — the icon affordance is the on/off control, the name sits over the
  percentage reading, and the actions row carries the percentage as a slider with the
  presets beside it as the shared enumerated control — touch-sized options where they
  fit its row, or a single dropdown affordance where they do not. Dragging the
  percentage while the fan is off commands it on first.
- **Climate** — the name sits over the temperature reading, and the actions row
  carries the setpoint as a slider with the thermostat's mode beside it as the shared
  enumerated control — touch-sized options where they fit its row, or a single
  dropdown affordance where they do not. A thermostat that only reports presents the
  reading and no inert control.
- **Lock** — the name sits over its locked/unlocked reading, and the actions row
  carries Lock and Unlock as touch-sized options, the one matching the reported state
  marked active, each commanding the property's own authored value. A lock is never
  "inactive", so its controls are always drawn.
- **Number** — a bounded numeric control as the sole action, the slider being the
  value's actuation target (a bare card activation cannot express the value to set).
  A writable numeric with no declared range is not presented at all.
- **Select** — the enumerated control as the sole action: one touch-sized option per
  permitted value where they fit its row at the 42 px target, or a single dropdown
  affordance carrying every value where they do not. An enum with no permitted values
  presents no control.
- **Entity** — the typed fallback: the icon affordance and the name over the state.
  Where the primary action is a pure toggle the whole card is the actuation target;
  where the device has no actuatable property the reading becomes the card's dominant
  content, with no control and no navigation affordance.

Each card composes its *form* — `compact`, `regular`, or `full` — from the box its
widget actually gives it (`wall/cards/card-composition.ts`), so a taller box composes
a richer form rather than inflating the smaller one, and a `horizontal` layout is
composed only where the box is wide enough for it. A card whose controls are hidden
keeps the composition of its non-control content rather than reflowing into a
different card. Every control actuates through the shared optimistic channel
(`reflect → reconcile → revert`), reverting and surfacing the failure inline on the
affordance that issued it.

### Suppressed affordances

On the wall a device card presents no favorite toggle, no hide/unhide toggle, and
no explicit open-detail affordance, and the observation is demoted to a glyph-only
non-textual indicator (the label and polled age stay in `title`/`aria-label`). A
pure toggle's whole card is its actuation target; a card with an embedded value
control is actuated through that control. A device card inside a widget frame draws
one surface, never a surface inside another — including each tile of a device grid.

### Attribution — the ported card system

The card anatomy, the token values, the device-colour contrast improvement, and the
per-card options above are ported from
[`piitaya/lovelace-mushroom`](https://github.com/piitaya/lovelace-mushroom), which is
licensed **Apache-2.0**. This repository is **GPL-3.0**, which is the permitted
direction for that reuse. Nothing is vendored: Mushroom's `LitElement` classes,
`hass` interactions, and `ha-*` elements cannot be imported, so the cards are
re-implemented in React against this codebase's own data model, and the ported
values are re-declared as Hearth tokens with the Mushroom source recorded per line in
`wall/hearth.css`. The repository-level notice lives in
[`THIRD_PARTY_NOTICES.md`](../../../THIRD_PARTY_NOTICES.md).

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

Three changes are breaking by design:

- **The wall's device cards are the ported card system's.** The wall's invented
  device-card scale — a 56 px touch target, an 18 px device-card body floor, a 16 px
  card radius, a 26 px glyph — is replaced by Mushroom's own metrics: a **42 px**
  control height, **14 px/500** primary over **12 px/400** secondary type, a 36 px
  circular icon with a 24 px glyph, a 10 px card inset, and 12 px control spacing
  and radii. The row unit, the paging density, and the editor's span floors are
  re-derived from the smaller card (`ROW_UNIT_MIN` **50 px**, `ROW_UNIT_MAX`
  **56 px**), and a tile row is now bounded at 1.25× its cell. A wall therefore reads
  at the ported card's density rather than the previous, larger one; the harness at
  1920 × 1080 is the check on distance legibility.
- **The wall profile contract is version 2.** `WALL_WIDGET_TYPES` is per device
  class, each type carrying its own config, and `WALL_PROFILE_VERSION` is **2**. A
  stored version-1 profile is **migrated rather than rejected**: a widget that named
  one device becomes that device's typed widget at the same placement and zone, and
  a widget that named a set of devices keeps its selection, so no authored wall is
  lost. Writing a version-2 profile is what the editor does; a profile that cannot be
  migrated is reported without preventing the wall's other profiles from loading.
- **The wall no longer scrolls.** A composition that cannot fit its panel at the
  wall's floors renders an explanation with a route to the editor instead of a
  clipped or scrollable grid, and a paging widget pages rather than overflowing.
  Profiles that fit are unaffected; a profile authored for a taller panel now
  reports itself rather than degrading silently.

## Unchanged

- Named profiles, the author-placed 12-column grid, orientation overrides, scene
  triggers, live profile updates, the configuration editor, per-widget error
  isolation, and always-on/reconnect behaviour.
- The dashboard's rendering: the shared device tile, its capability ranking, its
  optimistic reflect/reconcile/revert, and its non-colour state encoding are
  untouched, and the dashboard's own light tile is unchanged. The wall and the
  dashboard render a device differently **on purpose**.
- The non-device wall widgets' vocabulary, tokens, zones, and the on-demand
  stylesheet.
