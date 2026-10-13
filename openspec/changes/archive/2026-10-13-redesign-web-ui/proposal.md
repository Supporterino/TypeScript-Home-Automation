## Why

The web UI works, but it is built on the stock Mantine component set with a thin
Mantine theme layered over a token stylesheet. The result is a dashboard that
looks like Mantine with different colours: default component geometry, a
desktop-first shell that treats the phone as a shrunken sidebar, and a design
whose light scheme is a mechanical inversion of the dark one. On a phone the
control surface is buried behind a persistent bottom bar with only three slots,
and the visual language does not hold up at either end of the size range.

The user has asked for a ground-up redesign targeting a *beautiful*,
mobile-first-and-desktop-friendly interface with first-class light and dark
modes, and has explicitly permitted migrating off Mantine.

## What Changes

- **Migrate the UI stack off Mantine** to **Tailwind CSS v4 + Radix UI
  primitives + lucide-react**, keeping React 19 and the existing `Bun.build`
  asset pipeline (content-hashed, code-split, pre-compressed, first-paint
  budget). A new `bun-plugin-tailwind` step is added to the package build; no
  PostCSS pipeline is introduced.
- **Replace the "Ambient Glass" design system with "Lumen"**, a dark-first,
  light-designed system: a new semantic token layer (colour, typography,
  spacing, radius, elevation, motion) defined once in a Tailwind `@theme` plus
  runtime CSS variables, and consumed by every view through utilities or tokens
  — never a literal hex.
- **Rebuild the application shell** as a responsive, mobile-first layout:
  persistent grouped navigation rail on wide viewports; on narrow viewports a
  safe-area-aware app bar plus a control-first tab bar with all control surfaces
  one tap away, and operator views URL-reachable without being promoted.
- **Rebuild every view** (overview, rooms, room, devices, device detail,
  automations, automation detail, state, logs, HomeKit, energy, weather, wall
  editor, and the full-bleed wall) and the shared presentational components
  (device tile, capability controls, cover transport, source viewer, error
  boundary, navigation) on the new primitives.
- **First-class theming**: an explicit light/dark/system theme selection that is
  persisted, applies before first paint (no flash of wrong theme), and is driven
  by a `data-theme` attribute rather than a vendor colour-scheme manager.
- **Update the design-system documentation** (`design-system/ts-ha/`) and the
  `@ts-ha/web-ui` package description/dependencies to match.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities

- `web-ui`: the **Technology Stack** requirement changes its UI library from
  Mantine to Tailwind CSS + Radix UI primitives + lucide-react; the **Build
  Process** requirement drops its "React + Mantine" phrasing and admits the
  Tailwind CSS plugin step; the **Visual Design System** requirement is
  generalised to the Lumen system and gains an explicit requirement that the
  light scheme be designed rather than inverted; the **PWA Support** requirement
  updates its manifest theme colours to the Lumen palette; and two new
  requirements define theming — **Theme Selection** (light/dark/system choice,
  persisted, defaulting to the system preference) and **No-Flash Theme
  Application** (the scheme is applied before first paint).
- `packaging`: the **Workspace Package Topology** requirement's `@ts-ha/web-ui`
  row updates its responsibility description from "React/Mantine application" to
  "React/Tailwind application".

## Impact

- **Web UI (`packages/web-ui/package.json`)**: drop `@mantine/core`,
  `@mantine/hooks`, `@tabler/icons-react`; add `tailwindcss`,
  `bun-plugin-tailwind`, the `@radix-ui/*` primitives in use, `lucide-react`,
  and the small `clsx`/`tailwind-merge` utility pair.
- **Web UI build (`packages/web-ui/scripts/build-web-ui.ts`)**: register the
  Tailwind plugin, point the CSS entry at the Tailwind stylesheet, and keep the
  content-hash, gzip, code-split, font, and first-paint-budget behaviour
  unchanged.
- **Web UI app (`packages/web-ui/src/app/**`)**: `index.tsx`, `App.tsx`,
  `theme.ts` and `tokens.ts` are replaced by a Tailwind entry, a `useTheme`
  hook, and a Lumen token module; `styles/tokens.css` becomes the Tailwind
  entry stylesheet; `components/`, `views/`, and `wall/` are rebuilt on the new
  primitives.
- **Web UI server (`packages/web-ui/src/components/html-shell.ts`)** carries the
  inline no-flash theme bootstrap and the updated `theme-color`/icon metadata.
- **Design system (`design-system/ts-ha/`)**: `MASTER.md` and the page overrides
  are rewritten for Lumen.
- **Tests (`packages/web-ui/tests/`)**: the theme/token assertions are rebound to
  the Lumen token module and Tailwind entry; presentational tests that asserted
  Mantine internals are re-pointed at the new primitives; pure logic tests are
  unchanged.
- **No `@ts-ha/shared`/`@ts-ha/core`/`@ts-ha/cli` contract change.** The web UI
  remains a pure client of the existing API and shared schemas; the
  `shared`←`web-ui` dependency direction and the "no `core` import" rule are
  unchanged.

## Non-Goals

- No change to the HTTP API, event stream, or shared contracts.
- No change to the data layer's behaviour (snapshot-then-stream reconciliation,
  optimistic actuation, per-property coalescing, revert deadlines) — only its
  presentation.
- No new runtime dependency in any package other than `@ts-ha/web-ui`.
- No server-side rendering or hydration; the app stays a client-rendered SPA.
- The full-bleed wall keeps its own grammar; it is re-skinned, not re-scoped.
