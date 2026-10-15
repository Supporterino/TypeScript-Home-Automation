## Why

Iterating on the wall's widgets currently requires the entire production stack: a
built frontend, a running engine, an MQTT broker, and a saved wall profile full of
real devices. There is no way to render a single wall widget in isolation, and
`packages/web-ui/tests/wall-card-vocab.test.ts` records the consequence in its own
header — *"There is no DOM harness here"* — so the widget tests assert that a
`.tsx` file contains the right element names **as text**. Composition defects
(a card that should have composed its compact form, a span whose budget is wrong,
a zone band that overlaps a tile) are observable only on a real panel through a
live instance.

Two properties make that loop actively misleading rather than merely slow:

- The wall's type ramp is `vmin`-based (`packages/web-ui/src/app/wall/type-ramp.ts`,
  `clamp(36px, 5vmin, 76px)`), so a widget tuned in an ordinary browser window is
  tuned against the ramp's *floor*, not against what the 1920 × 1080 panel renders.
- Half the composition decisions happen above the renderer, in
  `packages/web-ui/src/app/wall/WidgetFrame.tsx` — `tier`, `cardForm`,
  `rendererHeightPx`, and the too-small explanation. Rendering a widget directly
  hides exactly the behaviour being debugged.

This change adds a development-only render harness that shows the wall's real
composition against fixture data, so widget work can be done and reviewed without
an engine.

## What Changes

- Add a development-only wall render harness under
  `packages/web-ui/src/app/wall/harness/`, with two modes:
  - **Stage** — renders the real `WallGrid` inside a fixed 1920 × 1080 scaled
    stage, so the `vmin` terms resolve as they do on the panel and the fit
    verdict, zone bands, row unit, and centering are the wall's own rather than a
    re-implementation.
  - **Bench** — renders one widget through the real `WidgetFrame` with `tier`,
    `cardForm`, and `rendererHeightPx` overridden by hand, so a card's
    compact/full boundary and its span budget can be found by direct observation.
- Add a **fixture seam** to the dashboard data layer so the harness can supply
  devices, state, rooms, automations, transport, and the weather and energy
  readings the wall's two self-sourcing widgets otherwise fetch, with no engine
  present. Fixture data is supplied explicitly by a caller; the production
  API-sourced path is unchanged.
- Add a development server and a `harness` script to `@ts-ha/web-ui` that serves
  the harness with hot reload from an HTML entrypoint, resolving workspace imports
  to source. It is **not** an entry of the shipped build.
- No production behaviour changes: the shipped bundle, the asset manifest, the
  first-paint budget, and the wall's on-demand stylesheet are all unaffected.

## Capabilities

### New Capabilities

None. This is a development-tooling change; it introduces no user-facing or
operator-facing capability, so no new capability path is created.

### Modified Capabilities

- `web-ui`: the **Build Process** requirement gains the constraint that the render
  harness is a development-only entrypoint — it is not an entry of the shipped
  bundle, contributes no asset to the manifest, and adds no first-paint
  dependency. The **Data Sources** requirement gains the constraint that fixture
  data is supplied explicitly by a caller and is never selectable in a deployed
  dashboard, and that a widget which sources a reading outside the data layer
  prefers a caller-supplied fixture for it when one is present.

## Impact

**Packages:** `@ts-ha/web-ui` only. No `@ts-ha/shared`, `@ts-ha/core`, or `@ts-ha/cli`
change. No shared contract is added or changed, so `scripts/contract-inventory.json`
is untouched, and the dependency direction (`shared` ← `web-ui`) is unchanged — the
harness imports only `@ts-ha/shared` and web-ui's own modules, never `@ts-ha/core`.

**Code:**

| File | Change |
|---|---|
| `packages/web-ui/src/app/wall/harness/**` | New: HTML entry, Stage and Bench surfaces, fixture data, dev-server script |
| `packages/web-ui/src/app/lib/data-store.tsx` | Fixture seam for the data layer |
| `packages/web-ui/src/app/wall/widgets/WeatherWidget.tsx`, `EnergyWidget.tsx` | Prefer a caller-supplied fixture reading over their own fetch |
| `packages/web-ui/package.json` | A `harness` script |
| `packages/web-ui/tests/` | A test asserting the harness is unreachable from the app entry and contributes no manifest asset |
| `AGENTS.md` | One line under Build/Lint/Test Commands |

**Docs:** none. Per the agreed scope the harness is an internal `@ts-ha/web-ui`
tool with no operator-facing documentation — nothing is added to `docs/` and the
`docs/zensical.toml` nav is unchanged. `AGENTS.md` gets one command line because it
is the authoritative reference for commands, not user documentation.

**Risk:** low and bounded. The production sources touched are the data-layer seam
and the two wall widgets that otherwise fetch their own reading; with no fixtures
supplied both behave exactly as they do today. The rest is additive and excluded
from the shipped build.

## Non-Goals

- **No widget behaviour change.** The harness renders existing renderers unchanged.
  Any tuning applied through it lands as a normal edit to `wall/widgets/*.tsx`,
  `type-ramp.ts`, or the span budgets — with their mirror and derivation tests — not
  as harness-specific divergence.
- **No production data path.** Fixtures are never read by a deployed dashboard, and
  no environment variable, query parameter, or config key selects them.
- **No DOM or visual-regression test infrastructure.** The harness is a development
  surface, not a test gate; the existing source-structural widget tests stay as they
  are.
- **No replacement for the editor's draft preview.** `wall/editor/preview.ts` stays
  a Lumen wireframe that renders no wall widget and reaches no Hearth (design.md D7).
- **No Storybook, no Vite, no second production bundler, no PostCSS pipeline.**
- **No new widget type or registry change**, and no `@ts-ha/shared` schema change.
