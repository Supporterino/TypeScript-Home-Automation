# ts-ha — Ambient Glass Design System (MASTER)

Source of truth for the web UI redesign. Page-specific overrides live in
`design-system/ts-ha/pages/<page>.md` and take precedence where present.

This system is authored for an offline-first home-control appliance (Bun +
React + Mantine v9), not a marketing site. Read this before generating any
web-UI markup or styles.

## Product

- **Product:** smart-home control surface + operator console
- **Personas:** household members (phone, wall tablet) and the operator/tinkerer
- **Rendering:** React 19 + Mantine v9, compiled with `Bun.build`, served over
  plain HTTP on a LAN, often with no internet access
- **Hard budget:** first-paint transferred (gzip) ≤ 250 KB, asserted at build

## Visual Direction

**Ambient Glass** — a dark-first, calm control surface. Real translucency is
reserved for chrome (header, nav rail, overlays); content tiles are opaque with
a hairline border and soft elevation. Room hues give spatial orientation.

Do not use: literal glass cards everywhere, neon glow, emoji as icons, gradients
on data surfaces, color as the sole state channel.

## Color Tokens

### Dark (authoritative)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0B1120` | app background |
| `--surface` | `#151E2E` | tiles / cards |
| `--surface-2` | `#1E2940` | raised / hover |
| `--hairline` | `rgba(255,255,255,0.08)` | borders, dividers |
| `--text` | `#F8FAFC` | primary text |
| `--text-muted` | `#94A3B8` | secondary text |
| `--on` | `#22C55E` | device on / connected / active |
| `--stale` | `#F59E0B` | stale observation |
| `--danger` | `#EF4444` | unreachable / failed |
| `--info` | `#38BDF8` | informational accent |
| `--focus-ring` | `#F8FAFC` | keyboard focus |

### Light (designed, not inverted)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#F1F5F9` | app background |
| `--surface` | `#FFFFFF` | tiles / cards |
| `--surface-2` | `#F8FAFC` | raised / hover |
| `--hairline` | `#E2E8F0` | borders, dividers |
| `--text` | `#0F172A` | primary text |
| `--text-muted` | `#64748B` | secondary text |
| `--on` | `#16A34A` | device on |
| `--stale` | `#D97706` | stale observation |
| `--danger` | `#DC2626` | unreachable / failed |
| `--info` | `#0284C7` | informational accent |
| `--focus-ring` | `#0F172A` | keyboard focus |

### Room Accent Palette (assign by stable hash of room id)

`coral #FB7185` · `amber #FBBF24` · `teal #2DD4BF` · `violet #A78BFA` ·
`lime #A3E635` · `sky #38BDF8`

Use as a 3px rail or tint on a room **header only** — never tint device tiles.

### State Encoding Rule

Never color alone. Every state pairs color with an icon and/or label:

| State | Color | Non-color channel |
|---|---|---|
| on | `--on` | filled power icon + "on" |
| off | `--text-muted` | outline power icon + "off" |
| stale | `--stale` | clock icon + age text |
| unreachable | `--danger` | plugged-off icon + "unreachable" |
| hidden | `--text-muted` | dashed border + "hidden" badge |

## Typography

| Role | Family | Weight | Notes |
|---|---|---|---|
| Display / headings / readouts | Plus Jakarta Sans (self-hosted subset) | 700 / 500 | −0.5px tracking on large |
| Body / UI | system stack | 400 / 500 | no download cost |
| Mono (IDs, state, source) | `ui-monospace, SFMono-Regular, Menlo, monospace` | 400 | never for prose |

Type scale: `12 / 14 / 16 / 20 / 24` px. Numeric readouts may use `24–32` px.

The display font MUST be self-hosted (no Google Fonts / third-party origin) and
emitted as a content-hashed `.woff2` counted against the budget.

## Spacing, Radius, Elevation

- Spacing rhythm: **4 / 8 / 12 / 16 / 24 / 32** px.
- Radius: tiles `14px`, pills `999px`, inputs `10px`.
- Elevation (3 levels, soft):
  - `--e0`: none (flat tiles on `--bg`)
  - `--e1`: `0 1px 2px rgba(0,0,0,.24)` tile resting
  - `--e2`: `0 8px 24px rgba(0,0,0,.32)` overlay / popover
- Glass (chrome only): `backdrop-filter: blur(14px)`, translucent `--surface`
  at 72% alpha, 1px `--hairline`.

## Motion

- Enter: 180 ms fade + 8 px translate, 40 ms stagger.
- Toggle/echo: 120 ms color/opacity; never change layout bounds.
- Easing: `cubic-bezier(.2,.8,.2,1)`.
- No animation library. CSS / Mantine transitions only.
- All non-essential motion suppressed under `prefers-reduced-motion: reduce`.

## Component Rules

### Device Tile
- One dominant primary action **or** readout.
- Actuators: control dominant, readout secondary.
- Sensors: readout dominant, whole tile activates detail.
- Explicit open-detail affordance; embedded controls must not open detail.
- Favorite + visibility toggles live in a corner slot, never over the name.

### Navigation
- Two groups: **Home** (favorites, overview, rooms, unassigned, all devices) and
  **System** (automations, state, logs, HomeKit, energy, weather).
- Wide viewport: persistent rail, each group collapsible.
- Narrow viewport: control-only bottom bar (home / rooms / devices). Operator
  views stay URL-reachable; never promoted.
- Active state follows detail routes back to the collection entry.

### Data / Status
- Snapshot-then-stream; never poll while the stream is healthy.
- Live/polled/stale/unreachable always distinguished.
- Optimistic actuation reconciles and reverts on failure with a surfaced error.
- Per-view error isolation is mandatory.

## Anti-Patterns

- Mantine default blue `#228be6`; unstyled default components.
- Glass on every surface; heavy blur on tile grids.
- Filters ("show hidden", "operable only") promoted onto the consumer surface.
- Whole-tile click as the only way to open detail.
- Color-only status.
- Third-party font/CDN requests.
- Adding a chart/animation library to first paint.

## Page Overrides

Create `design-system/ts-ha/pages/<page>.md` for a page that deviates. If absent,
this MASTER applies exclusively. Planned pages: `overview`, `room`, `device-detail`,
`energy`, `weather`.
