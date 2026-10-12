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

## Device tile on the wall (revisits `add-wall-display` design D7)

The wall uses the **same** shared device tile as the dashboard — one
presentation, never a fork — with a wall (`size="wall"`) mode that changes only
affordance visibility and the tap target:

- **Suppressed on the wall:** the favorite toggle, the hide/unhide toggle, and
  the explicit **Details** affordance.
- **Whole-card actuation:** for an actuatable device the whole card is the
  target. For an on/off primary the card toggles; a value-setting primary
  (position, brightness, setpoint, enum) keeps its embedded control, since a
  bare tap cannot express a value.
- **Read-only devices** render as a readout with **no** navigation affordance.
- **Unchanged:** capability ranking, optimistic override (`reflect → reconcile →
  revert on failure, with the failure surfaced`), and non-color state encoding
  (push / polled + age / unreachable) are the single shared implementation.

This is a deliberate, wall-only departure from MASTER's "Explicit open-detail
affordance" rule and from `add-wall-display` D7; the dashboard tile keeps its
open-detail affordance.

## Room accents

Per MASTER: room accents appear on the room header only — never on device tiles.
