# ts-ha — Wall Display (page override)

Override for `MASTER.md`, applied only to the full-bleed wall surface
(`/wall/:name`). Where this page disagrees with MASTER, this page wins; every
token, color, radius, elevation, and motion rule **not** listed here still comes
from `MASTER.md` unchanged. Nothing here applies to the dashboard.

The wall's job is glanceability from across a room. MASTER's body scale and
uniform surface tiles are tuned for a handheld/desktop operator; this page
scales the wall up and splits its cards into two grammars.

## Grid rhythm (overrides MASTER spacing for the wall layout)

- **Row unit** — the height of one grid row is
  `clamp(72px, (availableHeight − chrome) / occupiedRows, 112px)`, never `1fr`,
  where `chrome = 2·g + (occupiedRows − 1)·g` with `g` = the gutter's 24 px
  upper bound (reserving the panel padding and inter-row gutters so a profile
  cannot overflow and clip its first/last rows):
  - `ROW_UNIT_MIN` = **72 px**
  - `ROW_UNIT_MAX` = **112 px**
  A card's height tracks its declared `h` span times this unit, so a small
  widget is never inflated to fill the panel. A profile occupying fewer rows
  than the panel fills keeps its natural height and is **centered**
  (`alignContent: center`); one that is taller than the panel is top-aligned and
  scrollable rather than clipped.
- **Gutter** — a single token used for both the grid `gap` and the panel
  `padding`: `clamp(16px, 2vmin, 24px)`; the guaranteed floor is **16 px**.
- The wall is non-scrolling (`overflow: hidden`) when the composition fits;
  scroll (`overflow-y: auto`) is enabled only as a last resort for a profile
  taller than the panel.

## Type ramp (overrides MASTER's `12/14/16/20/24` body scale)

Distance-readable, using MASTER's fonts and theme-aware text tokens
(`--text`, `--text-muted`, `--font-display`) — no new families.

| Role | Size | Use |
|---|---|---|
| Hero readout | `clamp(32px, 6vmin, 64px)` | clock time |
| Metric readout | `clamp(32px, 4.5vmin, 64px)` | weather temp, energy/status values |
| Label | 20 px | metric labels, descriptions, forecast captions |
| Body (minimum) | 16 px | any remaining wall text |

No wall **body/`Text` content** may render below **16 px**. Readouts stay within
**32–64 px**. (Compact status chips — e.g. the `Hidden`, `Unavailable`, and room
"skipped" badges — are a deliberate compact exception and are not held to the
16 px body floor.)

## Card grammar (overrides MASTER "Device Tile" for ambient widgets)

Every widget type carries a fixed grammar; a frame draws chrome accordingly
(ambient vs control is not owner-selectable).

- **Ambient** — `clock`, `weather`, `energy`, `status`. Rendered **chrome-less**:
  no `Paper`, no border, no background; the large type sits directly on `--bg`.
  They are read, not touched. State still uses a non-color channel (icon shape +
  label), per MASTER's State Encoding Rule.
- **Control** — `room`, `favorites`, `device`, `scene`. Rendered as a MASTER
  content tile: opaque `--surface`, `--hairline` border, 14 px radius; the whole
  card is the touch target.
- **Titles are opt-in** — a widget header is drawn **only** when the profile sets
  a title; otherwise the widget's own content labels it. The type label is never
  a fallback header.

### Device card archetypes (layered on the widget grammar)

The grammar above chooses the surface a **widget** draws. Inside a device card
(a `device` widget, or a tile within `room` / `favorites`), the card's shape is
refined further from the device's ranked capabilities — its *archetype*:

- **Light** — an on/off toggle **and** a brightness control (a slider with a
  persistent `%` readout) coexisting on one card (see the rule-break below).
- **Toggle** — an on/off-only device: the whole card is the toggle.
- **Cover** — transport controls (open / close, and stop only when the device
  declares a writable property that can express it) in place of a position
  slider.
- **Readout** — a device with no actuatable property: one large value and one
  quiet label, and **no surface at all**.
- **Default** — a device the ranking does not classify above keeps the shared
  dashboard tile's behaviour unchanged.

Surface choice therefore follows the archetype, not solely the `ambient` /
`control` grammar. The grammar still governs the *widget* default, while a
**readout device card draws no card surface of its own** — no `Paper`, no
border, no background. A single-device (`device`) widget has a chrome-less
frame, so a readout there sits its value and label directly on `--bg` like the
clock and weather. A readout tile nested in a `room` or `favorites` card draws
no surface of its own but **inherits the enclosing widget's surface** (the
control grammar's `--surface`), since that frame still draws its own surface.

## Device tile on the wall (revisits `add-wall-display` design D7)

The wall uses the **same** shared device tile as the dashboard — one
presentation, never a fork — with a wall (`size="wall"`) mode that changes only
affordance visibility and the tap target:

- **Suppressed on the wall:** the favorite toggle, the hide/unhide toggle, and
  the explicit **Details** affordance.
- **Whole-card actuation:** for an actuatable device the whole card is the
  target. For an on/off primary the card toggles; a value-setting primary
  (position, brightness, setpoint, enum) keeps its embedded control, since a
  bare tap cannot express a value. The **light** archetype is the exception: its
  brightness slider already occupies the card, so it does not whole-card-actuate
  and the explicit on/off toggle is the affordance.
- **Read-only devices** render as a chrome-less **readout** with **no**
  navigation affordance.
- **Unchanged:** capability ranking and the optimistic override (`reflect →
  reconcile → revert on failure, with the failure surfaced`) are the single
  shared implementation.
- **Observation is quieter:** the wall keeps the non-color state encoding — the
  icon shape and token still distinguish push, polled/stale, and unreachable —
  but demotes the observation to a glyph-only indicator. The state label
  (including the `polled · 3m` age) is retained only as `title` / `aria-label`,
  not visible card text. The dashboard keeps the visible label and age.

This is a deliberate, wall-only departure from MASTER's "Explicit open-detail
affordance" rule and from `add-wall-display` D7; the dashboard tile keeps its
open-detail affordance.

A light card carries **two** controls on one card — a brightness control and an
on/off toggle. This is a second, deliberate wall-only departure, this time from
MASTER's Device Tile rule ("one dominant primary action **or** readout"); the
dashboard tile keeps the single dominant action. MASTER's Device Tile rule is
referenced here, not changed.

## Room accents

Per MASTER: room accents appear on the room header only — never on device tiles.
