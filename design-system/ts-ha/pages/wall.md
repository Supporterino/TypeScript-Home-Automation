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
composition.

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

**State encoding is never colour alone.** On a true-black panel the shape/fill of a
glyph or a label always accompanies the colour — an on/off affordance changes the
icon's fill as well as its token, and the compact status chips stay.

No per-room hue: a room card and its members use the same Hearth surface, hairline,
and text tokens as every other card.

## Typography — the distance ramp

The ramp is wall-owned and larger than the dashboard's scale; its numeric bounds
live in `wall/type-ramp.ts` (`WALL_TYPE_RAMP`) and its CSS tokens in `hearth.css`,
so a CSS and a numeric consumer cannot drift apart.

| Tier | Size | Use |
|---|---|---|
| Hero | `clamp(48px, 7vmin, 104px)` | the clock time |
| Metric | `clamp(36px, 5vmin, 76px)` | weather, energy, status, temperature, brightness/readout values |
| Title | `clamp(20px, 2.5vmin, 28px)` | device names, card titles |
| Label | 20 px | metric labels, uppercase card labels |
| Body (floor) | **18 px** | any other wall text |
| Chip | 16 px | compact status chips (deliberate exception) |

Readouts sit well above the dashboard's 34 px ceiling. Weights are 500 / 600 / 700
and leading is 1.05 (tight) / 1.2 (snug) / 1.45 (body).

**The ramp owns its body floor.** The wall's minimum body size is re-derived from
the ramp (`bodyMin`, **18 px**, up from the previous hard 16 px rule): no wall body
text may render below it. The compact status-chip exception is the one deliberate
case beneath the floor.

## Spacing, radius, elevation, motion

- Spacing rhythm (4-based): 4 / 8 / 12 / 16 / 24 / 32 / 48 px
  (`--hearth-space-1` … `--hearth-space-7`).
- Radius: `--hearth-radius-sm` 10 px, `-md` 16 px, `-lg` 24 px, `-pill` 999 px.
- Elevation: `--hearth-e0` none — a resting card is flat on the panel's black,
  separated by the hairline; `--hearth-e1` `0 1px 2px rgba(0,0,0,0.6)` — a raised
  control; `--hearth-e2` `0 18px 44px rgba(0,0,0,0.7)` — a pressed tile or
  overlay. Light declares its own, lower-key shadows
  (`rgba(28,24,21,0.12)` / `rgba(28,24,21,0.2)`).
- Motion: `--hearth-motion-fast` 130 ms, `--hearth-motion-base` 200 ms,
  `--hearth-motion-enter-translate` 10 px, `--hearth-motion-ease`
  `cubic-bezier(0.16, 1, 0.3, 1)`. Under `prefers-reduced-motion: reduce` fast and
  base collapse to `0.01 ms`; no animation library is used, and a state change
  never alters layout bounds.

## Kiosk touch targets and separation

The wall is operated by touch from a distance, so every interactive control meets a
**kiosk-class minimum of 56 CSS pixels** — `WALL_MIN_TOUCH_TARGET` in
`wall/registry.ts`, up from the previous 48 px — and the wall tile's embedded
controls are sized to the same target (`wallTileMetrics("wall").control` in
`wall/scale.ts`).

Adjacent controls keep at least an **8 px** separation — `WALL_MIN_CONTROL_GAP` in
`wall/registry.ts`, matching `--hearth-space-2` — so a touch intended for one
cannot plausibly activate its neighbour. Rows of controls may space further (the
light card's stack uses 12 px), but never less. Every control is operable without a
hover interaction; no affordance depends on a pointer.

## Grid rhythm (composition model unchanged)

The wall's composition model is retained from the previous wall work — Hearth
changes how a card is painted, sized, and written, not how a profile is placed.

- **Row unit** — one grid row is
  `clamp(72px, (availableHeight − chrome) / occupiedRows, 112px)`, never `1fr`,
  where `chrome = 2·g + (occupiedRows − 1)·g` with `g` the gutter's 24 px upper
  bound (reserving padding and inter-row gutters so a profile cannot overflow and
  clip its first/last rows). `ROW_UNIT_MIN` = **72 px**, `ROW_UNIT_MAX` =
  **112 px**. A card's height tracks its declared `h` span times this unit, so a
  small widget is never inflated to fill the panel.
- **Composition** — a profile occupying fewer rows than the panel keeps its natural
  height and is **centered** (`alignContent: center`); one taller than the panel is
  top-aligned and scrollable rather than clipped. The grid stays fixed at 12
  columns; an orientation override replaces the base layout entirely.
- **Gutter** — a single token for both the grid `gap` and the panel `padding`:
  `clamp(16px, 2vmin, 24px)`; the guaranteed floor is **16 px**.
- **Titles are opt-in** — a widget header is drawn **only** when the profile sets a
  title; otherwise the widget's own content labels it. The type label is never a
  fallback header.

## Widget card vocabulary

Every wall widget is composed from one Hearth card vocabulary
(`wall/widgets/card-vocab.tsx`), so the surface reads as one designed whole rather
than a set of independent tiles. The card frame carries four slots:

- a **leading glyph** (`WallCardGlyph`, 24 px) that names the card;
- a **title or label** (`WallCardLabel`) on the label tier;
- a **primary metric** (`WallCardMetric`) on the ramp — hero or metric tier;
- a single **action-affordance slot** (`WallCardAffordance`) on control cards,
  spaced by the ≥ 8 px adjacent-control floor.

A contained explanation (`WallCardMessage`) fills a widget's own area for an
unconfigured, empty, or unavailable state; a pressable control uses `WallButton`,
sized to the 56 px target.

### Widget grammar

A widget type's grammar is fixed (not owner-selectable) and decides whether the
frame draws a surface:

- **Ambient** — `clock`, `weather`, `energy`, `temperature`, `status`. Rendered
  **chrome-less** with the vocabulary's stat form — a leading glyph, a label, and
  the value on the metric ramp, directly on the panel. They are read, not touched.
- **Control** — `room`, `favorites`, `device`, `scene`. Rendered as a Hearth
  surface tile (`--hearth-surface`, `--hearth-hairline`, `--hearth-radius-md`) with
  a head (glyph + title), a metric, and the affordance slot. The `device` widget's
  frame is chrome-less so its single device card owns the surface.

### Redesigned widgets

- **Temperature** — an ambient readout over a configured sensor device
  (`{ qualifiedId, title? }`): a leading thermometer glyph, the humanized device
  name on the label tier, and the reading on the metric ramp. A device that is
  unknown, unavailable, or reports no temperature is contained inside the widget's
  own area and never prevents the rest of the profile from rendering.
- **Readout card** — a chrome-less, non-navigable card for a device with no
  actuatable property: a leading readout glyph, the value on the metric ramp
  (muted when unreachable), and a quiet uppercase label. No control surface
  competes with the reading.
- **Scene tile** — a leading scene glyph in a 56 px tile beside the label, with the
  whole tile as the trigger affordance. Pressed and busy are paint-only states
  (background, elevation, and a spinner in place of the glyph), so the tile does
  not shift while it is operated; a failed trigger is surfaced on the tile itself.
- **Light card** — redesigned on the wall-only `light` archetype (below).

Behaviour, config surface, and states of every widget are unchanged by the
vocabulary: this is a presentation redesign.

## Wall device cards

A device card selects its presentation from the device's ranked capabilities. The
wall reuses the shared device tile (`components/DeviceTile.tsx`) in its
`size="wall"` mode: capability ranking, the optimistic
`reflect → reconcile → revert` channel, and non-colour state encoding remain
single-source, and the dashboard's rendering is untouched.

### Light card (wall-only)

The wall `light` archetype is a distinct design, not the dashboard tile with larger
type:

- **Icon affordance toggle** — a 56 px pill whose icon (filled when on, outline
  when off) is the on/off control. State is carried by shape/fill and the
  on/off token, never hue alone. It is `aria-pressed` and disabled while the
  device is unreachable.
- **Name and value** — the device name on the title tier and, beside it, the
  brightness level as a percentage (normalised against the capability's own range)
  or `Off`.
- **Full-width brightness bar** — the value control, spanning the card, drawn in
  the accent colour when the light is on and the off token when it is not. While
  the light is off the bar shows its off state and activating it turns the light on
  and sets the level, both through the optimistic channels.
- **Colour-temperature control** — offered only when the device declares the
  capability: a spectrum bar (info → accent) above a slider that drives it.
- **Colour control** — offered only when the device declares the capability: a
  full-spectrum bar above a slider that drives it.
- **Failure** — a failed command reverts and surfaces inline on the card.

Every control meets the 56 px target and the ≥ 8 px separation. A control the
device cannot express is never rendered inert, so two lights of the same type can
show different controls.

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
  cannot stop omits Stop rather than rendering it inert. A Shelly cover now
  declares its transport action, so its stop is reachable.
- Each control is a 56 px pressable button with no hover dependency; a failed
  command reverts and surfaces inline. The position readout appears only when the
  primary capability is a numeric position.

Transport is wall-only; the dashboard keeps its existing cover presentation.

### Suppressed affordances

On the wall a device card presents no favorite toggle, no hide/unhide toggle, and
no explicit open-detail affordance, and the observation is demoted to a glyph-only
non-textual indicator (the label and polled age stay in `title`/`aria-label`). A
pure toggle's whole card is its actuation target; a card with an embedded value
control is actuated through that control.

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
- `packages/web-ui/tests/web-ui-assets.test.ts` asserts the wall stylesheet is
  absent from the first-paint assets.

## Unchanged

- Named profiles, the author-placed 12-column grid, orientation overrides, scene
  triggers, live profile updates, the configuration editor, per-widget error
  isolation, and always-on/reconnect behaviour.
- The wall profile contract: the temperature widget is an **additive** catalog
  entry, so `WALL_PROFILE_VERSION` is unchanged and an existing profile keeps
  loading.
- The shared device tile's behaviour — capability ranking, optimistic
  reflect/reconcile/revert, and non-colour state encoding — and the dashboard's
  Lumen rendering.
