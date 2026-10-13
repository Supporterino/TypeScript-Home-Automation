---
"@ts-ha/web-ui": minor
---

Redesign the dashboard on the Lumen design system and migrate the frontend off
Mantine.

- `@ts-ha/web-ui`: replace Mantine v9 and `@tabler/icons-react` with Tailwind
  CSS v4 (via `bun-plugin-tailwind`, no PostCSS pipeline), Radix UI headless
  primitives, and `lucide-react`, keeping React 19, `Bun.build`, the
  content-hashed/split/pre-compressed asset pipeline, and the ≤250 KB gzip
  first-paint budget
- `@ts-ha/web-ui`: replace the "Ambient Glass" system with **Lumen** — the
  semantic tokens (colour, typography, spacing, radius, elevation, motion) are
  declared once in the Tailwind entry stylesheet (`src/app/styles/app.css`) and
  consumed only through utilities/tokens, so no view carries a literal hex; dark
  is authoritative and the light scheme is designed in its own right, not
  inverted
- `@ts-ha/web-ui`: an explicit light / dark / **system** theme selection is
  persisted and applied to `data-theme` before first paint by an inline shell
  bootstrap, replacing Mantine's colour-scheme manager and removing any flash of
  the wrong scheme
- `@ts-ha/web-ui`: the application shell becomes mobile-first — a persistent
  collapsible nav rail on wide viewports, and a safe-area-aware app bar plus a
  control-first bottom bar with an overflow affordance on narrow viewports,
  with operator views reachable by URL
- `@ts-ha/web-ui`: every view and shared component (device tile, capability
  controls, cover transport, source viewer, error boundary, navigation) is
  rebuilt on a token-driven `ui/*` primitive layer; the data layer
  (snapshot-then-stream reconciliation, optimistic actuation, per-property
  coalescing, revert deadlines) and the full-bleed wall's grammar are unchanged
  in behaviour
