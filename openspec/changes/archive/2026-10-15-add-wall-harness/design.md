## Context

See `proposal.md` — Why. The following current-state facts shape the approach; each
was read from the tree rather than assumed.

**The wall's composition is computed above the renderer.**
`packages/web-ui/src/app/wall/WidgetFrame.tsx:55-77` resolves `tier`
(`span.ts`'s `resolveSpanTier`), `rendererHeightPx` (`frame.ts`'s
`rendererBoxHeightPx`), `cardForm` (`resolveCardFormForHeight`) and the `tooSmall`
verdict before it renders anything. The layout above *that* — the clamped row unit,
the gutter, the centering rule, and the fit verdict — lives in `wall/grid.ts`, and
the zone bands in `wall/bands.ts`. All of it is fed by `WallGrid.tsx`, which
measures its own element with a `ResizeObserver` and falls back to
`window.innerHeight`.

**Several wall values resolve against the viewport, not a container.**
`type-ramp.ts` sizes every readout in `vmin`; `use-orientation.ts` reads
`matchMedia("(orientation: portrait)")` on the window; `WallGrid.tsx`'s
too-large explanation sets `height: "100dvh"`. A widget rendered inside a
CSS-`transform`ed box in an ordinary page would therefore measure and size against
the *wrong* viewport.

**The editor's preview cannot take this role.** `wall/editor/preview.ts` is a pure
resolver that draws a wireframe in the editor's own Lumen tokens and, by
`redesign-wall-display` design.md D7 and `specs/wall-display` "Wall Configuration
Editor", deliberately "renders no wall widget and reaches no Hearth". Extending it
would break that decision, so the harness is a new surface rather than a change to
an existing one.

**There is no fixture seam.** `DataStoreContext` is module-private
(`lib/data-store.tsx:182`) and `useDataStore()` throws outside its provider
(`:684-686`). `DataStoreValue` (`:110-181`) exposes real internals the widgets
genuinely consume — `commandCoalescer`, `applyOptimisticOverride`,
`revertOptimisticOverride`, `subscribe` — as well as the maps. The wall widgets
read: `devicesByQualifiedId` (device, temperature, device-grid), `devices`
(status), `rooms` (room), `favorites` and `state` (favorites), `automations`
(scene), and `transport` (weather, energy).

**Two widgets source their own reading.** `wall/widgets/WeatherWidget.tsx` and
`wall/widgets/EnergyWidget.tsx` call `GET /api/weather` and `GET /api/energy`
themselves on mount (`fetchWeather()`/`fetchEnergy()`); their only store read is
`transport`, and that read merely re-triggers their own load rather than carrying
the reading. A fixture seam confined to the store therefore cannot reach their
data, and the harness would render their unavailable state instead of a real
composition — so the seam carries those two readings as well (D5).

**Two stylesheets are involved.** `wall/hearth.css` declares the wall's tokens and
contains no `@import "tailwindcss"`; the 45 `className=` sites under `wall/` are
resolved by `styles/app.css`'s `@source "../../**/*.tsx"` scan. A harness that
loads only Hearth renders a wall with no utilities.

**The build protects first paint structurally.** `build-web-ui.ts` builds a single
entrypoint (`src/app/index.tsx`) with `splitting`, marks non-entry JS chunks and
`file` assets `firstPaint: false`, and a custom plugin (`:61-76`) turns a
`hearth.css` import from a **wall-display** importer into its own on-demand `file`
asset. `tests/web-ui-assets.test.ts` asserts the `--hearth-canvas` marker appears
only in that stylesheet and that `WALL_CHUNK_MARKER` (`registry.ts:142`) appears in
no first-paint asset.

**Bun's bundler selects the `development` condition unless `NODE_ENV=production`**
(oven-sh/bun#16904: `if (!production) conditions.append("development")`). Bun
1.4.3 is what this repo runs, and the existing spec ("Build Process") requires the
development workflow to pass that condition explicitly.

## Goals / Non-Goals

**Goals:**

- Render the wall's real composition, and a single real widget, with no engine,
  broker, or saved profile.
- Report what the wall actually renders: correct `vmin`-based type scale, correct
  orientation, correct fit verdict.
- Make a card's compact/full boundary and the span budgets in `span.ts`
  observable rather than inferred.
- Leave the shipped bundle, the manifest, and the first-paint budget untouched.

**Non-Goals:**

- Not a test gate. No DOM renderer is added to `bun test`; the existing
  source-structural widget tests stay as they are.
- Not a widget authoring tool. The harness edits a draft config in memory and
  never writes to the engine or to a profile.
- Not a fixture server or a mock of the API. Fixtures are values handed to a
  provider, not responses served over HTTP.
- Not a replacement for `bun run dev`. That workflow — a real engine with real
  data — remains the way to verify end-to-end behaviour.

## Decisions

### D1 — Location and lifecycle: `wall/harness/`, permanent but minimal surface

The harness lives at `packages/web-ui/src/app/wall/harness/`, is covered by
`src/app/tsconfig.json` (so `bun run typecheck` checks it), and is reachable only
through its own script. It gets no `docs/` page and no `docs/zensical.toml` entry;
`AGENTS.md` gets one command line under Build/Lint/Test Commands.

Being under `wall/` rather than beside it is deliberate: the harness renders the
wall surface and imports `wall/hearth.css`, so it belongs to the wall's taxonomy.
It is *not* under `wall/editor/`, whose exclusion from the wall-stylesheet rule
(`build-web-ui.ts:44-46`) exists because the editor must never reach Hearth. The
distinction does not matter for the shipped build — the harness is not an
entrypoint — but it keeps the classification honest if that ever changes.

*Alternatives.* A throwaway scratch file: rejected, because the fixture seam it
would force on `lib/data-store.tsx` would outlive it, and because the wall's
`vmin`/orientation traps are rediscovered by every future contributor. A gated
shipped route (`WEB_UI_HARNESS=1`): rejected, because it puts a development
surface inside a published package and adds a runtime branch for a dev-only
concern, which the existing build's structure does not otherwise do.

### D2 — Stage renders `WallGrid`; the harness re-implements no layout

Stage mounts the production `WallGrid` with a draft `WallProfileConfig`. Bands,
the row unit, the gutter, the centering rule, the fit verdict, the per-widget
`ErrorBoundary`, and `WidgetFrame`'s tier/form/too-small logic are therefore the
wall's own by construction, not by imitation. The harness owns exactly two things:
the control panel and the stage's viewport geometry.

*Alternative.* Placing widgets with a harness-local grid: rejected. `grid.ts` and
`bands.ts` already encode the row unit and the zone bounding box; a parallel layout
would drift, and every discrepancy would then have two candidate causes.

### D3 — The panel is a real 1920 x 1080 viewport in a same-origin iframe

The stage is an `<iframe>` whose *layout* size is the panel (1920 x 1080 landscape,
1080 x 1920 portrait) and which the parent scales visually with a CSS `transform`.
Inside the iframe, `vmin`, `window.innerHeight`, `100dvh`, and
`matchMedia("(orientation: …)")` all resolve against the panel's own viewport, so
every viewport-derived wall value is truthful, while the parent page can be any
size. The draft config crosses the frame boundary with `postMessage` (same origin),
and the stage is not reloaded for a config change — only for a mode or panel change.

*Alternatives.* (a) A `transform`ed `<div>` in the parent document: rejected — it
is precisely the trap described in Context, reporting the ramp's *floor*
(`clamp(36px, 5vmin, 76px)` collapses to 36 px) and the parent window's orientation.
(b) Window-as-panel with the controls in a floating overlay: zero fidelity loss and
no second document, but it requires the developer to size the window to the panel
(or use browser device emulation) on every run, and the controls sit on top of the
composition. Kept as the documented degradation if the iframe plumbing ever costs
more than it returns.

### D4 — Orientation is physical, not injected

Because the stage is its own viewport, `useOrientation()` returns the truth with no
seam: a 1080 x 1920 stage *is* portrait. The harness's panel selector therefore
changes the stage's dimensions and nothing else. This matters more than it looks —
`resolveLayout(config, orientation)` is what applies a profile's orientation
override, and that path is currently effectively untestable without a rotated
display.

*Alternative.* Adding an orientation override to `useOrientation`: rejected as
unnecessary surface; it would put a dev-only branch in production code to
reproduce a condition the iframe reproduces for free.

### D5 — Fixtures reach the widgets through `DataStoreProvider`, not by exporting the context

`DataStoreProvider` gains an optional `fixtures` prop. When present, the provider
seeds its state from the fixture set and does not open the event stream or fetch a
snapshot; when absent, every existing behaviour is untouched. Fixture use stays
explicit at the call site — the only place that passes `fixtures` is the harness —
which is what the spec delta requires.

The fixture shape (a `DataStoreFixtures` interface, declared in
`lib/data-store.tsx`, web-ui-internal and *not* a `@ts-ha/shared` contract) covers
exactly what the widgets read and nothing more: `devices`, `state` (which carries
the favorites key), `rooms`, `automations`, `transport`, and the two readings the
weather and energy widgets source themselves rather than read from the store —
`weather` and `energy`. Those two widgets prefer a supplied reading over their own
fetch, which is the one behaviour the seam changes: it is the only way a
fixture-backed render shows their real composition rather than their unavailable
state, and it keeps every wall widget store-driven instead of making the harness
construct renderers by hand (D7's bench is the one place that does). With no
fixture supplied, both widgets fetch exactly as they do today.

*Alternatives.* (a) Export `DataStoreContext` and have the harness construct a
whole `DataStoreValue`: rejected — the harness would have to fabricate
`commandCoalescer`, both optimistic-override functions, `subscribe`, and the
visibility calls, and would have to keep fabricating them as the interface grows,
which converts a compile-time contract into harness noise. (b) Monkey-patching
`globalThis.fetch` and `EventSource` so the real provider loads fixtures: rejected —
it depends on undocumented endpoint payload shapes, and a fixture that fails to
parse surfaces as the *degraded-transport* path rather than as an error, which is
the most confusing possible failure mode for a tool whose purpose is clarity.
(c) Pointing the harness at a live engine: rejected, as it restores the entire
dependency this change exists to remove.

### D6 — Fixtures cover the wall's presentation states, not realism

One device per archetype, so every card composition and every contained-explanation
path is reachable: a full light (on/off plus brightness, colour temperature, and
colour), a plain switch, a cover with position and stop, a read-only sensor, a
value device, a selection large enough that the device grid must page, and an
identifier that is deliberately absent from the map so `DeviceWidget`'s
"is not available" path renders. Plus one automation (scene), one room with
members, and the weather and energy readings the two self-sourcing widgets
consume — one present set, so those two render a real composition rather than
their unavailable state. They live in `wall/harness/fixtures.ts`.

`packages/web-ui/tests/fixtures/` exists and is empty; the harness fixtures are
deliberately *not* placed there. They are a dev surface's data, and giving them a
home next to the test suite would invite them to be treated as a test gate.

### D7 — Bench calls the renderer directly, and says so

Bench calls `getWidgetDescriptor(type).renderer` itself, supplying `tier`,
`cardForm`, `rendererHeightPx`, and `rowUnit` from the control panel, instead of
going through `WidgetFrame`. That is the only place the harness deliberately
bypasses production code, and it is the point: `WidgetFrame` *derives* the card
form from the span, so it can never answer "at what height should this card flip?"
— the question the budgets in `span.ts` are actually answering.

*Mitigation for the obvious hazard:* the control panel shows, next to each manual
override, the value Stage would compute for that span at that panel, so a hand-set
budget that no legal placement produces is visible as an artifact of the bench
rather than mistaken for a wall behaviour.

### D8 — Dev server: HTML entry plus `Bun.serve`, with the bundler's condition

`packages/web-ui/scripts/harness.ts` imports an HTML entrypoint and serves it with
`Bun.serve({ development: { hmr: true, console: true } })`; the script is wired as
`"harness": "bun --conditions=development run scripts/harness.ts"`. Hot reload,
React Fast Refresh, on-demand TSX/CSS bundling, and Tailwind detection come from
the full-stack dev server, so there is no build step, no manifest, and no
interaction with `build-web-ui.ts`.

This satisfies the existing "Build Process" requirement to resolve workspace
imports to source through the `development` condition in two independent ways: the
script passes `--conditions=development` explicitly, exactly as `scripts/dev.ts`
does for the engine, and Bun's bundler appends `development` itself whenever
`NODE_ENV` is not `production` (oven-sh/bun#16904). No prior `@ts-ha/shared` build is
required.

The harness imports both `styles/app.css` (Tailwind utilities) and
`wall/hearth.css` (tokens). The production `wallStylesheetPlugin` needs no
equivalent here: its whole purpose is to keep Hearth out of first paint, and a
bundle that is never shipped has no first paint.

*Fallback.* If the dev server's implicit condition ever changes, or the HTML-import
pipeline conflicts with the Tailwind plugin, the fallback is the shape
`scripts/build-web-ui.ts` already proves — a `Bun.build` with an explicit
`conditions: ["development"]` plus a static server, with a watch/rebuild loop in
place of HMR. Same command, same file, one different mechanism.

*As built (measured).* The fullstack HTML-import server was tried first on the
installed Bun (1.4.3) and its Tailwind handling is not usable here: it compiles
Tailwind but ignores `styles/app.css`'s `@source` globs, so the stylesheet it
serves carries neither `.flex` nor the app's own `min-h-dvh` — the wall's markup
would render without the wall's utilities, which is precisely the fidelity the
harness exists to show. The fallback above is therefore the shipped mechanism,
wired to the same command and the same file: an in-memory `Bun.build` of both
documents with `conditions: ["development"]`, served from memory, with the
watch/rebuild loop in place of HMR (a source edit rebuilds automatically; the
browser reload is manual, and the loop coalesces an edit that lands mid-build
rather than dropping it). The task's verify clause is unchanged: the script
starts, serves the shell, and resolves `@ts-ha/shared` to source with
`packages/shared/dist` absent.

### D9 — Two guards keep the harness out of the shipped build

A source-level test walks imports from `src/app/index.tsx` and asserts nothing under
`wall/harness/` is reachable. A `WALL_HARNESS_MARKER` constant — the same technique
as `WALL_CHUNK_MARKER` (`registry.ts:142`) — is asserted absent from every
first-paint asset by the existing asset test. The first catches an accidental
import; the second catches a regression in the build's entrypoint list, which the
first cannot see.

*Why this needs two guards rather than trust:* the harness sits under `wall/`, so
it matches `isWallDisplayImporter` (`build-web-ui.ts:44-46`). Were it ever to become
reachable from the entry, its `hearth.css` import would be silently emitted as a
second wall stylesheet rather than failing the build — a quiet wrong rather than a
loud one, which is exactly what a guard is for.

*Known artifact, not a leak.* Tailwind's `@source` scan is glob-based rather than
reachability-based, so the harness's own utility class names (`.right-2`,
`.bottom-2`) are emitted into the shipped entry stylesheet — measured as +498 B raw
and +103 B transferred by parking the harness sources and restoring them. The
editor's utilities already behave this way in the current build; no asset and no
manifest entry is added, the first-paint budget is unaffected, and both Build
Process constraints still hold — no emitted asset contains the harness or its
fixture data, and no asset fetched for first paint originates from it.

### D10 — A patch Changeset is added for `@ts-ha/web-ui`

No exported API changes: `lib/data-store.tsx` and `wall/harness/**` are app source,
not package exports. But the frontend source is what `prepublishOnly` compiles into
the package's shipped assets, so the published artifact does change. A patch
Changeset records that without implying a public API change.

## Risks / Trade-offs

- **Fixture drift** — fixtures slowly stop matching what the engine sends, so the
  harness renders a state production cannot produce. → The fixtures are typed
  against the same `DeviceDescriptor` / `Room` / `Automation` / `StateMap` types the
  store consumes, so a contract change is a compile error in `bun run typecheck`
  rather than a silent divergence.
- **A second render surface diverging from the wall route** — the harness could
  come to disagree with `WallView`. → Stage mounts `WallGrid` itself; the harness
  owns only the control panel and the stage geometry, neither of which the wall
  route owns.
- **Production code gains a dev-only branch** — `DataStoreProvider`,
  `WeatherWidget`, and `EnergyWidget` each gain a path they only ever take in
  development. → With no fixture supplied none of the three branches is taken; the
  spec delta pins "not selectable at runtime", and D9's guards assert the harness
  is unreachable from the entry.
- **The iframe stage is more moving parts than a `transform`ed div** — a second
  document plus `postMessage` plumbing. → Accepted deliberately, because the
  alternatives either lie (the div) or cost manual window sizing every run
  (window-as-panel). The degradation path is documented in D3 if the cost proves
  higher than expected.
- **Bench can show a composition no placement produces** — a hand-set
  `rendererHeightPx` is not a legal span's budget. → D7's mitigation surfaces the
  Stage-computed value beside the override.
- **AGENTS.md's "prefer modifying existing modules"** — the change adds a new
  directory. → Allowed: a development render surface is a genuinely new domain
  concept, which is the stated exception.
- **`bun run harness` is a new contributor-facing command that no `docs/` page
  explains.** → The AGENTS.md line is the intended discovery path; this is the
  agreed cost of the "permanent but minimal surface" decision, and it is
  reversible by adding a docs page later without touching the design.

## Migration Plan

No data, config, or contract migration, and no engine-side change.

- **Rollout:** a normal `@ts-ha/web-ui` patch release. The `fixtures` prop is
  additive and optional; the harness is inert unless its script is run.
- **Rollback:** delete `src/app/wall/harness/` and the `harness` script. Leaving the
  `DataStoreProvider` fixture prop and the two widgets' fixture branches in place is
  harmless, since nothing in the shipped app supplies them — so the rollback can be
  partial without consequence.
- **Verification:** `bun run typecheck && bun run check && bun run test` (the
  workspace gate), then manual: run the harness script, exercise both modes, both
  panel orientations, and both schemes, and confirm that changing a widget's source
  updates the stage without a manual rebuild.

## Open Questions

- The fixture roster (D6) is fixed by *category*, not by count; adding archetypes as
  widget work demands is expected and needs no design change.
- Whether Stage should additionally offer a picker of saved draft compositions
  alongside the live control panel is an ergonomics question with no structural
  consequence.
