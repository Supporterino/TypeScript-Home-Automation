# Design — Wall Zones and Fit

## Context

See `proposal.md` — Why for motivation. The current wall presentation, as it
exists before this change:

- `wall/grid.ts` — pure placement (`gridPlacementStyle`, `resolveRowUnit`,
  `wallGridMetrics`, `wallGridStyle`). The row unit is
  `clamp(72, (H − chrome)/rows, 112)`; a composition that does not fit degrades
  to `alignContent: start` with `overflowY: auto` (a scroll).
- `wall/WallGrid.tsx` — the grid root; measures the panel and calls
  `wallGridStyle`.
- `wall/frame.ts` + `wall/WidgetFrame.tsx` — per-widget chrome from a widget's
  grammar (`ambient` chrome-less, `control` surfaced), plus the opt-in title.
- `wall/registry.ts` — the declarative widget registry: per-type `grammar`,
  `defaults`, `min`, `max`, `configSchema`, `renderer`, and
  `WALL_MIN_TOUCH_TARGET = 56`.
- `wall/hearth.css` + `wall/type-ramp.ts` — Hearth tokens and the distance ramp.
- `wall/widgets/**` — the renderers. `widget.w`/`widget.h` are read nowhere but
  `gridPlacementStyle()`.
- `components/DeviceTile.tsx` `size="wall"` — the wall device card; its `light`
  archetype adds a brightness control and, where the device declares them, a
  colour-temperature and a colour control.
- `wall/editor/**` + `views/WallsView.tsx` — the Lumen editor; no wall preview
  and no fit check.
- `views/WallView.tsx` + `lib/router.ts` — a wall is addressed by
  `wallPath(name)` and navigated with the shared router (`Link`/`useRouter`); the
  surface owns the whole viewport and opens no event stream of its own.
- `packages/shared/src/wall.ts` + `wall-schema.ts` — the profile contract
  (`WallWidget`, `WALL_PROFILE_VERSION = 1`, `wallProfileSchema`).

`docs/architecture.md` and `openspec/specs/wall-display/spec.md` are the
authorities for the surrounding system; this document covers only how the change
is built.

## Goals / Non-Goals

**Goals**

- Give the wall a container hierarchy (readouts / zoned controls) without a
  profile-format migration.
- Make a card's composed content a function of its declared span, in both
  directions.
- Make fitting the panel a resolved outcome rather than an author's guess.
- Reduce the wall's component scale so its cards read at the panel's density,
  without crossing the touch-target or body floors.
- Let a device-dense home express a dense, author-selected device grid as its own
  wall, without a scroll.
- Let walls form a walkable hierarchy of separate profiles.
- Keep the change additive at the shared boundary and free of any `core`
  dependency change.

**Non-Goals (design-level)**

- No auto-composition, content-first packing, or layout modes inside a profile;
  authored placement is retained and the device grid renders an explicit
  selection.
- No change to the device tile's behaviour contract (ranking, optimistic
  channels, state encoding) or to the dashboard's rendering.
- No new endpoint; the editor preview stays inside the existing editor surface.

## Decisions

### D1 — A zone is an additive label on the flat grid

**Decision.** `WallWidget` gains an optional `zone?: string`
(`packages/shared/src/wall.ts`), validated in `wall-schema.ts` as an optional,
trimmed, non-empty, length-bounded string. `WALL_PROFILE_VERSION` stays `1`. No
placement field changes. `scripts/contract-inventory.json` is updated if
`WallWidget` is a tracked contract.

**Why.** The alternative — restructuring the profile into a stack of bands with
their own height policies — is the cleanest expression of "zones", but it is a
format change with a migration and it discards the author-placed grid the
capability deliberately pins. The label keeps every existing profile valid and
reuses `WallWidget`'s single declaration site.

**Trade-off.** The composition stays fully authored, so the wall cannot arrange
zones itself; zone quality is the author's, surfaced by the editor preview (D7).
Accepted — auto-composition is a non-goal.

### D2 — A zone renders as a labelled band behind its members

**Decision.** A new pure module `wall/bands.ts` groups widgets by `zone` and
returns, per zone, the bounding box of its members (`{zone, x, y, w, h}`).
`WallGrid.tsx` renders a band layer behind the widget cells: for each band, a
surface-filled element at the band's grid placement, carrying the zone label, at
a z-index below the widgets. Member widgets keep their own surface.

A band token is added to `hearth.css` (`--hearth-band`) with a dark and a light
value — a slightly lifted field between `--hearth-canvas` and
`--hearth-surface`.

**Why.** The spec's "a card is a single surface" must survive: a band that
replaced its members' surfaces (a filled container with flat members) would make
a member's surface ambiguous and nest a room widget's tiles three deep. A tinted
band behind intact tiles adds one container level with no rule conflict.

**Trade-off.** A disjoint zone (the same label at two unrelated regions) yields
one bounding-box band that spans both. Accepted for scope: band selection is the
author's, and D7's preview exposes it; the editor MAY warn. Tracked as a risk.

**Alternative considered.** Drawing a zone as a synthesised "group widget" —
rejected, because it changes the catalog and the grid's single-source placement.

### D3 — Card presentation is span-aware, not measure-and-shrink

**Decision.** A new pure module `wall/span.ts` maps a placement and its
descriptor to a presentation tier — `compact | regular | roomy` — using the
descriptor's own `min`/`defaults`/`max` (the registry's single source), and
exposes the tier plus the placement through `WallWidgetProps`. Each renderer
composes its content for the tier. A card's content MUST fit its span *by
construction* at every tier.

**Why.** The reconciliation must run in both directions: a card at `min` must
not overflow its cells, and a card at `max` must not repeat its `compact`
composition. Deriving the tier from the registry means the tier and the editor's
`min`/`max` rule cannot drift.

**Trade-off.** Three discrete tiers are coarser than continuous measurement. A
render-time measure-and-shrink (a `ResizeObserver` on each card) was rejected: it
forms a feedback loop with the grid's own `ResizeObserver` and the panel-derived
row unit, and it makes overflow a runtime property rather than a build-time one.
A discrete tier keeps the guarantee testable without a DOM.

### D4 — The compact light card fits the minimum span; the row-unit floor follows it

**Decision.** The wall `light` archetype presents the same control set at every
tier — on/off, brightness, colour-temperature, and colour only when declared
(specs "Colour controls appear only when supported") — but the *form* adapts: at
`compact` the controls use span-appropriate forms (for example full-width
segments/swatches rather than a bare slider each), at `regular`/`roomy` they use
the full-width slider forms with spectrum bars.

The compact composition's height is the wall's minimum viable cell. Because the
`device` type's `min` is 2 rows, `ROW_UNIT_MIN` (`wall/grid.ts`) is re-derived so
a minimum-span light cell holds the compact composition at the wall's
`WALL_MIN_TOUCH_TARGET` and text floors — i.e. `2 · ROW_UNIT_MIN + gutter ≥
compactContentHeight + cardPadding`.

The compact composition is drawn at the reduced scale (D10), so the re-derived
`ROW_UNIT_MIN` is lower than today's 72 px and `ROW_UNIT_MAX` drops with it.

**Why.** This is the decision that makes "compact form" and "never overflow"
compatible. The alternative the change rejected — a device-dependent minimum span
— would move the minimum out of the per-type registry into runtime and complicate
the editor. Deriving the floor from the compact form keeps the minimum a static,
single-source value and makes the guarantee checkable in a test.

**Trade-off.** The re-derived `ROW_UNIT_MIN` (lower under D10) sets how tall a
profile may be before it stops fitting; a very tall profile overflows at a lower
row count. Handled by D5 (the state is explained, not clipped) and D7 (the
editor refuses the draft).

### D5 — The fit resolver never scrolls; overload pages or explains

**Decision.** `wall/grid.ts` gains a resolver returning
`{rowUnit, contentHeight, fits}` and — for an unfittable authored composition —
an explicit `tooLarge` outcome. `wallGridStyle` sets `overflowY: "hidden"` in
every case (the `auto` branch is removed). `WallGrid.tsx` renders a contained
explanation (the wall vocabulary's message form, plus a route to the editor) when
an authored composition cannot fit at the floors.

A widget whose *own* content cannot fit the span it was placed at does not
overflow or scroll: it pages. The device grid is the archetype (D12); the
favorites and room tile grids, which previously scrolled their tile area, are
re-pointed onto the same pure pagination layer. Every such widget resolves its
pages through the same pure layer, so the wall never scrolls anywhere — overflow
becomes an explanation (authored composition) or a page (the widget).

**Why.** A wall panel that scrolls is broken by definition; the spec's "Panel
Fit" makes never-scrolling normative. The resolver is pure, so the renderer and
the editor share one verdict.

**Trade-off.** A profile authored for a larger panel shows an explanation rather
than partial content. Accepted and deliberate: the explanation is actionable
(open the editor), whereas a scroll is silent. A paging widget trades a scroll
for a page control, which is a touch idiom the wall already uses.

### D6 — A band-readout tier, value/unit integrity, and name shortening

**Decision.**
- `wall/type-ramp.ts` and `hearth.css` gain a **band-readout** tier between the
  label and metric tiers (`--hearth-text-band`), for grouped readouts.
- Readouts render their value and unit in one non-breaking unit (a `nowrap`
  span), and choose a tier by their span (D3) so the value stays on one line.
- `lib/humanize-name.ts` gains a short-form helper (the distinguishing trailing
  segment, or an explicit override); wall cards present the short form when the
  full name does not fit, so two `Kitchen …` cards do not collide.

**Why.** The capture shows the metric tier applied at every span (so a value
wraps at 2 columns) and names ellipsized to a shared prefix. Both are
glanceability failures, and both are fixed at the source helpers rather than
per-widget.

**Trade-off.** A shortened name can be ambiguous in rare cases; mitigated by
preferring the trailing segment and by keeping the full name in `title`/
`aria-label`.

### D7 — The editor previews the draft at the panel aspect ratio and blocks an unfittable draft

**Decision.** The editor renders the draft's composition at the wall's target
panel aspect ratio (1920 × 1080 landscape) using the pure layout resolver (D2
bands + D5 fit), styled by the editor's own Lumen system, and reports the fit
verdict, including the page count a device grid would present (D12). Saving is
refused when the resolver reports the draft unfittable. A link opens the saved
profile's real wall render.

The preview MUST NOT import the wall renderer or `hearth.css` into the editor
chunk: a wireframe, not the Hearth paint, keeps Hearth's on-demand isolation
(the prior change's "On-Demand Wall Stylesheet" and its asset assertion).

**Why.** The root cause of the iteration churn is that composition is authored
and evaluated off-panel (the supplied capture is 1674 × 1212, the panel is
1920 × 1080). A preview at the panel's ratio and a fit verdict close that loop
without introducing an endpoint.

**Trade-off.** The preview shows composition and fit, not the exact Hearth
pixels. A live-render preview would need either a draft-preview endpoint or the
wall chunk in the editor chunk (breaking the stylesheet isolation). Deferred —
see Open Questions.

### D8 — Shared-contract and dependency impact

**Decision.** The shared changes are the additive optional `zone` and the two
additive widget types `link` and `devices` with their configs
(`packages/shared/src/wall.ts`, `wall-schema.ts`), so
`scripts/contract-inventory.json` and `scripts/guard-contracts.ts` move only if
`WallWidget` / `WALL_WIDGET_TYPES` is tracked. The change is wall-presentation
plus editor and touches no `@ts-ha/core` or `@ts-ha/cli` code; the `shared` ←
`web-ui` direction and the "no `core` import in `web-ui`" rule are unchanged. The
band token, the band tier, the compact card, the pagination resolver, and the two
new renderers live under `wall/` and in Hearth, never in Lumen. A Changeset covers
`@ts-ha/shared` and `@ts-ha/web-ui`.

### D9 — Tests

**Decision.**
- Pure tests: `wall/bands.ts` grouping and bounding boxes; `wall/span.ts` tier
  selection at `min`/`defaults`/`max`; the `grid.ts` resolver's `fits`/`tooLarge`
  outcomes; `wall/pages.ts` tiles-per-page and page count for a selection at
  several spans; the `grid.ts` row-unit bounds (the lowered `ROW_UNIT_MAX` and the
  re-derived `ROW_UNIT_MIN`); the ramp bounds (the tablet-effective sizes are
  reduced, the body floor is 18 px, and the readouts stay above the dashboard's
  ceiling); the `humanize-name` short form.
- Presentation tests: a light card at its minimum span renders every declared
  control without overflow; a card at a large span does not render its
  minimum-span composition; a readout's value and unit are not split; an
  unfittable profile renders the explanation.
- Navigation tests: a link opens its target profile; a wall reached from a link
  offers a return; a link to an unknown profile renders the not-found
  explanation.
- Device-grid tests: the grid renders exactly the selected devices; a selection
  larger than the span pages rather than scrolling, and the resolver's page count
  is asserted; each tile actuates like a wall device card.
- Paging tests for the favorites and room tile grids: a selection larger than the
  span pages with a page affordance rather than an inner scroll.
- Editor tests: the draft preview resolves at the panel ratio; an unfittable
  draft is refused; a device grid's page count is reported.
- `web-ui-assets.test.ts` keeps asserting Hearth is absent from first paint
  (the editor preview must not pull it in).
- Existing wall tests are re-pointed where a presentation changed, preserving
  each test's intent.

### D10 — The wall's component scale is reduced

**Decision.** The wall is drawn ~25–30 % smaller on the panel:

| Lever | Before | After |
|---|---|---|
| `ROW_UNIT_MAX` (`wall/grid.ts`) | 112 px | 80 px |
| `ROW_UNIT_MIN` (re-derived, D4) | 72 px | ~56 px (derived) |
| Hero | `clamp(48px, 7vmin, 104px)` | `clamp(36px, 5vmin, 76px)` |
| Metric | `clamp(36px, 5vmin, 76px)` | `clamp(26px, 3.6vmin, 54px)` |
| Title | `clamp(20px, 2.5vmin, 28px)` | `clamp(18px, 1.8vmin, 22px)` |
| Label | 20 px | 18 px |
| Body floor | 18 px | 18 px (held) |
| Chip | 16 px | 16 px (held) |

On a 1920 × 1080 panel the ramp resolves at its `vmin` term, so the coefficients
— not the maxima — are what actually shrink the tablet: hero 7vmin → 5vmin
(~76 px → 54 px), metric 5vmin → 3.6vmin (~54 px → 39 px), title 2.5vmin →
1.8vmin (~27 px → 19 px).

**Why.** The cards render oversized on the panel: the row unit rises to its
ceiling and the ramp resolves at its `vmin` term, so a short composition fills
the panel with a few very large blocks. Lowering the ceiling and rescaling the
ramp restores density without touching the composition model.

**Constraints held.** The 56 px touch target (`WALL_MIN_TOUCH_TARGET`) is a floor
and is unchanged. The body floor stays at 18 px — above the spec's 16 px minimum
and above the dashboard's 16 px `--text-base`, so "larger than the dashboard's
body scale" still holds; the chip exception stays 16 px. The rendered readouts
(hero 54 px, metric 39 px on the panel) remain above the dashboard's 34 px
ceiling.

**Trade-off.** The wall trades some of its distance-legibility margin for a
denser composition. This is the requested direction; the floors bound how far it
can go.

### D11 — A wall link opens another profile; the wall remembers how it was reached

**Decision.** The catalog gains a `link` widget (`WALL_WIDGET_TYPES` entry
`link`, grammar `control`): its config is `{ target: string; label?: string }`,
and activating it navigates to the target profile with the existing router
(`wallPath` in `lib/router.ts`), so the address changes and the browser's own
back works. A wall opened from a link additionally presents an on-screen back
affordance that returns to the previous wall, so the hierarchy is walkable by
touch as well as by the browser. A link whose `target` names no saved profile
renders the wall's existing "not found" explanation (specs/wall-display "Named
Wall Profiles"), so a broken link has no separate error path.

The navigation stack is client state in `WallView`/`WallGrid`; nothing is added
to the profile beyond the link's `target`. Because navigation is a real route
change, an always-on panel restored at a wall's address opens exactly that wall —
the hierarchy is not persisted as hidden state.

**Why.** "Multiple layouts" is expressed as separate, independently authored
profiles rather than a second composition model: a home keeps an overview wall
and one or more detail walls, and links join them. Reusing the router keeps
navigation reload-safe and avoids a bespoke history layer.

**Trade-off.** A hierarchy is only as good as its links; a wall reached by a
deep-link (not through a link) offers no back control, because there is nowhere
in-app to return to. Accepted — the browser's back and the editor route remain,
and the composition is the author's.

### D12 — A device grid is an explicit selection that pages, not scrolls

**Decision.** The catalog gains a `devices` widget (`WALL_WIDGET_TYPES` entry
`devices`, grammar `control`): its config is
`{ qualifiedIds: string[]; title?: string }` and it renders the named devices as
a uniform grid of the shared wall device card (`components/DeviceTile.tsx`,
`size="wall"`, D4). A new pure module `wall/pages.ts` computes, for the widget's
span at the resolved row unit, the tiles per page and the page count; the widget
renders one page with touch page controls and never scrolls, satisfying D5's
"never scrolls anywhere". The editor reports the page count so an author sees how
many pages a selection implies (D7).

The descriptor's `min` span holds at least the first page's row of tiles at the
wall's floors, so a device grid cannot be placed too small to page.

**Why.** A device-dense home needs a dense surface, but extending the wall to
scroll would break Panel Fit. Paging keeps the wall's fixed-surface promise while
letting an author show an arbitrary number of devices. Selecting the devices
explicitly (rather than enumerating the inventory) keeps the composition authored
and the device set predictable, and reuses the existing device card so ranking,
optimistic override, and state encoding stay single-source.

**Trade-off.** A page control is one more touch idiom on the wall, and a very
large selection spreads over many pages. Bounded and reported; accepted.

## Risks / Trade-offs

- **[Compact forms still overflow at the floor]** → The floor is derived from the
  compact composition (D4) and asserted in a presentation test, so a compact
  form that does not fit fails the gate.
- **[A lowered row unit / ramp shrinks the compact fit margin]** → The floor
  stays derived from the compact composition (D4) and asserted in a presentation
  test (D9); lowering `ROW_UNIT_MIN` makes the too-large state rarer, not more
  common, so the fit path is unchanged.
- **[The reduced scale hurts distance legibility]** → The floors bound it (18 px
  body, 56 px target) and the rendered readouts stay above the dashboard's
  ceiling (D10).
- **[Disjoint zone bounds overlap another zone]** → Band selection is the
  author's; D7's preview exposes it; the editor MAY warn. A stricter
  "contiguous-run" grouping is a follow-up if it proves necessary.
- **[A link cycle or a deep wall hierarchy]** → Navigation is a real route change
  with the browser's own history as the back stack; a profile's link target is
  resolved when the wall renders, so a deleted target shows the not-found
  explanation rather than a dead end.
- **[A device-grid selection spans many pages]** → The page count is bounded by
  tiles-per-page and reported in the editor (D7); the device set is the author's.
- **[Hearth leaks into the editor chunk]** → The preview is a wireframe (D7);
  `web-ui-assets.test.ts` continues to guard the stylesheet isolation.
- **[Stale capability Purpose]** → `openspec/specs/wall-display/spec.md`'s Purpose
  calls the wall "read-only", which conflicts with its "Touch Operation"
  requirement. This change does not fix it (it is a doc correction, not a
  behavior change); it is noted for a follow-up.
- **[`zone` growth in the shared contract]** → Additive and validated; the
  version is unchanged and old profiles keep loading.

## Migration Plan

None required: `zone` and the `link`/`devices` widget types are additive and
`WALL_PROFILE_VERSION` stays `1`, so existing profiles load and render unzoned.
Deployment is the normal `@ts-ha/shared` + `@ts-ha/web-ui` build; Hearth continues
to ship as its own on-demand asset. Rollback is reverting the change — a profile
carrying `zone` renders it as ignored, while a profile that uses the new widget
types would not load on the older build.

## Open Questions

- **The exact compact control forms** (segments/swatches vs a compacted slider)
  are a visual-design detail resolved during implementation; they do not change
  the spec, the approach, or the task breakdown.
- **The page affordance for a device grid** (explicit page controls vs a swipe
  gesture) is a visual/interaction detail resolved during implementation; it does
  not change the spec, the approach, or the task breakdown.
- **A later live-render preview** (a draft-preview endpoint, or a scaled render
  of the real wall) could replace the wireframe; it is a follow-up, not part of
  this change.
