# ts-ha — Lumen Design System (MASTER)

Source of truth for the web UI design system. Page-specific overrides live in
`design-system/ts-ha/pages/<page>.md` and take precedence where present.

This system is authored for an offline-first home-control appliance (Bun +
React 19 + Tailwind CSS v4 + Radix UI primitives + lucide-react), not a
marketing site. Read this before generating any web-UI markup or styles.

The single declaration site is `packages/web-ui/src/app/styles/app.css` — `:root`
carries the authoritative dark scheme, `[data-theme="light"]` the designed light
scheme, and the `@theme`/`@theme inline` blocks expose both to Tailwind as
utilities. The tables below mirror that file; where they disagree, `app.css`
wins.

## Product

- **Product:** smart-home control surface + operator console
- **Personas:** household members (phone, wall tablet) and the operator/tinkerer
- **Rendering:** React 19 + Tailwind CSS v4 + Radix UI primitives + lucide-react,
  compiled with `Bun.build`, served over plain HTTP on a LAN, often with no
  internet access
- **Hard budget:** first-paint transferred (gzip) ≤ 250 KB, asserted at build

## Visual Direction

**Lumen** — light on a dark-first control surface. Opaque surfaces sit on one
canvas, separated by a single hairline border; elevation is soft and reserved for
raised cards and overlays, never for every tile. Dark is the authoritative
scheme; the light scheme is designed for its own contrast, not derived by
mechanically inverting dark.

Do not use: literal glass/translucency on content surfaces, neon glow, gradients
on data surfaces, emoji as icons, colour as the sole state channel.

## Color Tokens

Colour is declared once per scheme and exposed to Tailwind through
`@theme inline`, so a view composes `bg-surface`, `text-ink`, `text-muted`,
`border-hairline`, `text-on`, `text-stale`, `text-danger`, `text-accent`, … rather
than a literal hex. A view must never use a literal colour.

### Dark (authoritative, `:root`)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0B0F17` | app background |
| `--surface` | `#121826` | tiles / cards |
| `--surface-2` | `#1A2334` | raised / hover |
| `--surface-3` | `#222D42` | pressed / inset |
| `--hairline` | `rgba(255,255,255,0.08)` | borders, dividers |
| `--text` | `#F3F6FC` | primary text |
| `--text-muted` | `#9AA6BC` | secondary text |
| `--on` | `#34D399` | device on / active |
| `--stale` | `#F59E0B` | stale observation |
| `--danger` | `#F87171` | unreachable / failed |
| `--info` | `#5EA8FF` | informational |
| `--accent` | `#5EA8FF` | interactive accent |
| `--accent-fg` | `#0B0F17` | text on accent |
| `--focus` | `#7CB8FF` | keyboard focus ring |

### Light (designed, not inverted, `[data-theme="light"]`)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#F6F8FC` | app background |
| `--surface` | `#FFFFFF` | tiles / cards |
| `--surface-2` | `#EEF2F9` | raised / hover |
| `--surface-3` | `#E3EAF5` | pressed / inset |
| `--hairline` | `#DCE3EF` | borders, dividers |
| `--text` | `#0D1526` | primary text |
| `--text-muted` | `#5B6B85` | secondary text |
| `--on` | `#059669` | device on / active |
| `--stale` | `#B45309` | stale observation |
| `--danger` | `#DC2626` | unreachable / failed |
| `--info` | `#2563EB` | informational |
| `--accent` | `#2563EB` | interactive accent |
| `--accent-fg` | `#FFFFFF` | text on accent |
| `--focus` | `#1D4ED8` | keyboard focus ring |

Contrast (asserted in `packages/web-ui/tests/theme.test.ts`): `--text` on every
surface ≥ 4.5:1; `--text-muted` on `--surface` / `--surface-2` ≥ 4.5:1;
`--on` / `--stale` / `--danger` / `--info` on `--surface` ≥ 3:1 — in **both**
schemes.

### State Encoding Rule

Never colour alone. Every state pairs colour with an icon and/or label:

| State | Colour | Non-colour channel |
|---|---|---|
| on | `--on` | filled power icon + "on" |
| off | `--text-muted` | outline power icon + "off" |
| stale | `--stale` | clock icon + age text |
| unreachable | `--danger` | slashed-plug icon + "unreachable" |
| hidden | `--text-muted` | dashed border + "hidden" badge |

## Typography

| Role | Family | Weight | Notes |
|---|---|---|---|
| Display / headings / readouts | Plus Jakarta Sans (self-hosted subset) | 500–700 | `--font-display` |
| Body / UI | system stack | 400 / 500 | `--font-body`, no download cost |
| Mono (IDs, state, source) | `ui-monospace, SFMono-Regular, Menlo, …` | 400 | `--font-mono`; never for prose |

Type scale: `12.5 / 14 / 16 / 18 / 22 / 28 / 34` px (Tailwind `text-xs` →
`text-3xl`). Numeric readouts may reach 34 px.

The display font MUST be self-hosted (no Google Fonts / third-party origin) and
emitted as a content-hashed `.woff2` counted against the budget.

## Spacing, Radius, Elevation

- Spacing rhythm: **4 / 8 / 12 / 16 / 24 / 32 / 48** px.
- Radius: inputs `12px` (`--radius-input`), tiles `16px` (`--radius-tile`), cards
  `20px` (`--radius-card`), pills `999px` (`--radius-pill`).
- Elevation (3 levels, soft; light declares its own shadows):
  - `--e0`: none — a resting tile is flat on `--bg` with only a hairline border
  - `--e1`: `0 1px 2px rgba(0,0,0,.28)` dark / `0 1px 2px rgba(13,21,38,.12)`
    light — raised card
  - `--e2`: `0 16px 40px rgba(0,0,0,.36)` dark / `0 16px 40px rgba(13,21,38,.18)`
    light — overlay / popover
- Translucency is reserved for the dialog scrim; content surfaces are opaque.

## Motion

- Enter: 200 ms fade + 8 px translate, 40 ms stagger.
- Toggle/echo: 130 ms colour/opacity; never change layout bounds.
- Easing: `cubic-bezier(.22,1,.36,1)` (`--motion-ease`).
- No animation library — CSS only.
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
  **Engine** (automations, state, logs, HomeKit, energy, weather, walls editor).
- Wide viewport: persistent rail, each group collapsible; the Favorites sub-list
  is labelled distinctly from the rooms.
- Narrow viewport: control-first bottom bar (home / rooms / devices) with an
  overflow affordance for the remaining control entries. Operator views stay
  URL-reachable; never promoted.
- Active state follows detail routes back to the collection entry.

### Data / Status
- Snapshot-then-stream; never poll while the stream is healthy.
- Live/polled/stale/unreachable always distinguished.
- Optimistic actuation reconciles and reverts on failure with a surfaced error.
- Per-view error isolation is mandatory.

### Primitives
- Views compose the shared `src/app/ui/*` layer — layout/display (`Card`, `Stack`,
  `Row`, `Grid`, `Badge`, `Chip`, `Divider`, `Spinner`, `EmptyState`, `Stat`,
  `ScrollArea`) and actions (`Button`, `IconButton`, `NavItem`) — plus the
  Radix-backed interactive set (`Dialog`, `DropdownMenu`, `Switch`, `Slider`,
  `ToggleGroup`, `Select`, `Tooltip`, `Collapsible`), rather than a component
  library's defaults.
- Icons come from `lucide-react`, imported per-icon; decorative icons are
  `aria-hidden`, icon controls carry an accessible name, and a state icon pairs
  with a label (State Encoding Rule).
- Focus is always visible (`:focus-visible` ring on `--focus`); interactive
  targets meet WCAG target size and enlarge on coarse pointers.

## Anti-Patterns

- A literal hex in a view; a component library's stock accent or unstyled
  defaults.
- Glass/translucency on content surfaces; heavy blur on tile grids.
- Filters ("show hidden", "operable only") promoted onto the consumer surface.
- Whole-tile click as the only way to open detail.
- Colour-only status.
- Third-party font/CDN requests.
- Adding a chart/animation library to first paint.

## Page Overrides

Create `design-system/ts-ha/pages/<page>.md` for a page that deviates. If absent,
this MASTER applies exclusively. Current override: `wall`. Planned pages:
`overview`, `room`, `device-detail`, `energy`, `weather`.
