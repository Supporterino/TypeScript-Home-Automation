# Design — Wall Redesign (Hearth)

## Context

The full-bleed wall (`/wall/:name`) is rendered by `packages/web-ui/src/app/views/WallView.tsx`,
which is lazily imported from `App.tsx` (`import("./views/WallView.js")`), so the
wall already lives in a code-split chunk. Its presentation is:

- `wall/WallGrid.tsx` — the grid container; `wall/grid.ts` — the clamped row unit;
  `wall/frame.ts` + `wall/WidgetFrame.tsx` — per-widget chrome; `wall/registry.ts` —
  the declarative widget registry (grammar, defaults, min/max, config schema,
  renderer) and `WALL_MIN_TOUCH_TARGET`; `wall/scale.ts` + `wall/type-ramp.ts` — the
  wall type scale; `wall/widgets/**` — the eight widget renderers;
  `wall/editor/**` + `views/WallsView.tsx` — the admin editor.
- The wall device tile is the shared `components/DeviceTile.tsx` in its
  `size="wall"` mode (which imports `WALL_BODY_FONT_SIZE` / `WALL_METRIC_FONT_SIZE`
  from `wall/type-ramp.ts`).

Today the wall's colour/spacing/radius tokens come from the dashboard's Lumen
system (`src/app/styles/app.css`, imported once by `src/app/index.tsx`), and the
wall's own scale is a page override documented in
`design-system/ts-ha/pages/wall.md` (16 px body floor, `clamp(72px,…,112px)` row
unit).

Behaviour is fixed by `openspec/specs/wall-display/spec.md`. This change modifies
only "Wall Glanceability" and "Touch Operation" and adds "Wall Visual Language"
and "On-Demand Wall Stylesheet"; the widget catalog, composition model, device
presentation, cover transport, scene buttons, editor flow, live updates, and
always-on behaviour are unchanged.

The build (`scripts/build-web-ui.ts`) uses a single entry (`src/app/index.tsx`)
with `splitting: true` and marks an output `firstPaint: artifact.kind !== "chunk"`,
so anything reachable only through a dynamic import is already excluded from the
first-paint budget.

---

## D1 — Hearth: a wall-owned visual language

**Decision.** The wall adopts **Hearth**, a visual language of its own, in place
of the dashboard's Lumen. Hearth is dark-first and **true-black** (no glass, no
full-white surfaces), with a single accent for interactive affordance, a large
distance-sized type ramp, and a calm, low-emission composition suited to an
always-on panel. It is not a restyle of Lumen and does not consume Lumen's tokens.

**Why (design-intelligence grounding).** ui-ux-pro-max places this surface in its
`Digital Signage / Kiosk` profile — *Minimalism & Swiss Style + Dark Mode (OLED)*,
*Full-Screen Immersive* — with a palette focus of high contrast plus touch target
emphasis, and the `dark-mode-oled` style (deep black, low white emission,
eye-friendly, power-efficient) is the fit for a panel that is on all day. The
dashboard's Lumen (opaque coloured surfaces over a blue-grey canvas) is tuned for
a handheld/desktop operator and is the wrong starting point for a
glance-from-across-the-room wall; reusing it is exactly the "dashboard with bigger
text" outcome this change removes.

**Trade-off.** Diverging means the product ships **two** design systems and two
declaration sites, and the wall cannot reuse the dashboard's utilities. Accepted:
the wall is a genuinely distinct surface (touch-only, distance-read, always-on)
and the user explicitly chose divergence; the alternative — staying on Lumen —
cannot deliver a from-scratch wall concept.

## D2 — A wall-scoped token declaration site

**Decision.** Hearth's tokens are declared in a new wall stylesheet,
`packages/web-ui/src/app/wall/hearth.css`, as `--hearth-*` custom properties under
a wall root scope. Dark is authoritative; light is a designed scheme under
`[data-theme="light"]` (the theme attribute is applied globally on `<html>`, so
the wall must define both). The wall's tokens do **not** alias Lumen's `--bg`,
`--surface`, … and `styles/app.css` (Lumen) is left untouched.

Hearth reuses the existing self-hosted display face (Plus Jakarta Sans, declared
in `app.css` and emitted as a content-hashed `.woff2` by the build) and sets its
own ramp on top of it, rather than adding a second font download.

**Why.** The spec's new "Wall Visual Language" requirement makes the wall the
owner of its tokens; a separate file is the single declaration site the
"Tokens are the single source" rule expects, and keeps the dashboard system from
being the wall's transitive dependency. Reusing the existing face avoids a new
font asset and a second download for a panel that already loads the entry
stylesheet.

**Trade-off.** No token is shared with the dashboard, so the two systems can
drift. Mitigated by keeping the divergence deliberate and documented in
`design-system/ts-ha/pages/wall.md`, and by confining Hearth to the wall display
(D8).

## D3 — Distance type ramp and a re-derived body floor

**Decision.** `wall/type-ramp.ts` is rewritten for Hearth. The ramp is
distance-sized (hero/clock readouts well above the dashboard's 34 px ceiling;
metric readouts for weather/energy/status; a label tier; a body tier). The body
floor is **re-derived from the ramp** (target ≥ 18 px) and replaces the current
hard 16 px rule; the compact status-chip exception is retained.

**Why.** "Wall Glanceability" is modified to require that the ramp own its floor.
The 16 px value was inherited from the dashboard's body scale and is not a
distance-legible floor; the re-derived floor is a deliberate, wall-only value.

**Trade-off.** Raising the floor reduces how much text fits in a small span;
mitigated by the existing span-derived row unit (`grid.ts`) and per-type min/max
dimensions in `registry.ts`, which already prevent undersized placements.

## D4 — Kiosk touch targets

**Decision.** Raise `WALL_MIN_TOUCH_TARGET` (`wall/registry.ts`, currently `48`)
to **56**, and keep at least an 8 px separation between adjacent controls.

**Why.** "Touch Operation" is modified to require a kiosk-class target. The
ui-ux-pro-max touch guidance for a kiosk-class surface is 56 px with ≥ 8 px
spacing; the previous 48 px was the touch-standard minimum, sized for a handheld,
not a wall.

**Trade-off.** Larger targets constrain how many controls fit in a small span;
handled as in D3 via the registry's per-type minimum dimensions.

## D5 — On-demand wall stylesheet delivery

**Decision.** `hearth.css` is imported by the wall **surface** modules (not by the
entry `index.tsx`). Because `WallView.tsx` is reached only through a dynamic
import in `App.tsx`, `Bun.build`'s `splitting: true` emits the wall's CSS as a
separate `chunk` asset, which `build-web-ui.ts` already marks `firstPaint: false`.
No build-script change is expected; the behaviour is verified, and the asset test
is extended.

**Why.** The "On-Demand Wall Stylesheet" requirement states the wall stylesheet
loads only with the wall and never on the dashboard's first paint. The existing
pipeline already supports split CSS; the work is placement, not new machinery.

**Risk / trade-off.** If `hearth.css` is also imported from the editor
(`wall/editor/**`, `views/WallsView.tsx`) — which is in a *different* lazy chunk —
Bun may hoist it into a shared chunk reachable earlier. Mitigated by keeping the
editor on Lumen (D8) and importing `hearth.css` **only** from the wall-display
modules, then asserting its absence from the first-paint assets in
`tests/web-ui-assets.test.ts`, mirroring the existing `WALL_CHUNK_MARKER`
(`registry.ts`) guard.

## D6 — Composition and card grammar retained

**Decision.** The author-placed, fixed-column grid (`grid.ts`), the clamped row
unit and single gutter (`WallGlanceability`), the centered-short-profile rule, the
ambient-vs-control widget grammar (`registry.ts` + `WidgetFrame.tsx`), the opt-in
title rule, and the widget catalog are all retained. Hearth changes the wall's
*language* (tokens, ramp, targets, surfaces), not its *model*.

**Why.** The user chose explicit, author-placed composition and a behavioural
re-scope limited to presentation; the composition model and catalog are correct as
they are. Retaining them keeps the change tight and the risk low.

**Trade-off.** Hearth cannot exploit an auto-composing ambient register (rejected);
accepted.

## D7 — Wall device tile and state encoding retained

**Decision.** `components/DeviceTile.tsx` keeps its props and contracts; only its
`size="wall"` mode is re-skinned to Hearth. Whole-card actuation, the suppressed
favorite/hide/details affordances, the glyph-only observation indicator, the
card archetypes, capability ranking, and the optimistic override are unchanged.

**Why.** "Wall Device Presentation" is not modified; the tile's behaviour is
shared with the dashboard and must not fork. Only its appearance moves to Hearth.

## D8 — The editor stays on Lumen

**Decision.** `wall/editor/WallEditor.tsx`, `wall/editor/WidgetConfigFields.tsx`,
and `views/WallsView.tsx` remain on the dashboard's Lumen system. Hearth applies
to the full-bleed wall display only.

**Why.** The editor is an administration surface operated on a non-wall device,
not the wall; the request was to redesign the wall *display*. Keeping the editor
on Lumen also keeps Hearth's stylesheet out of the editor's chunk (D5).

**Trade-off.** Two visual systems appear on adjacent screens (the editor lists
profiles, then the wall renders them). Accepted as the correct scope; a future
change could bring the editor onto Hearth if desired.

## D9 — Tests

**Decision.**
- Wall presentation tests are re-pointed at Hearth, preserving each test's intent:
  `wall-type-ramp.test.ts` (new ramp + re-derived floor),
  `wall-scale.test.ts`, `wall-frame.test.ts`, `wall-grid.test.ts`,
  `wall-registry.test.ts` (56 px target), `wall-card-archetypes.test.ts`,
  `wall-single-surface.test.ts`, `wall-read-only.test.ts`, plus the per-widget
  model tests where presentation is asserted.
- `web-ui-assets.test.ts` gains a wall-stylesheet-not-in-first-paint assertion.
- Pure wall logic (`wall/*-model.ts`, `wall/live.ts`, `wall/clock.ts`) is
  unchanged and its tests keep passing.

**Why.** Behavioural guarantees live in the spec and must keep being asserted; only
the implementation detail under test changes.

## D10 — Supersession of `redesign-web-ui`'s wall work

**Decision.** This change supersedes the wall-surface work of the in-flight
`redesign-web-ui` change (its tasks 7.1/7.2 and the wall clauses of 3.1/4.1/8.1).
`redesign-web-ui` is **not** edited; it finishes and archives on its own, after
which its wall output is replaced by Hearth.

**Why.** `redesign-web-ui`'s non-goal was that the wall be "re-skinned, not
re-scoped"; this change deliberately reverses that for the wall, so the two must
not both own the wall's appearance. Keeping them separate preserves the near-final
change's history and review.

## Dependency direction and shared contracts

Hearth is presentational only. `@ts-ha/web-ui` remains a pure client of
`/api/*` and the event stream; no `@ts-ha/shared`/`@ts-ha/core`/`@ts-ha/cli`
contract changes, and the `shared` ← `web-ui` direction and the "no `core`
import" rule are unchanged. The widget catalog and its shared config schemas
(`@ts-ha/shared/wall-schema`) are untouched.

## Risks

- **Two-system drift**: Hearth and Lumen can diverge unintentionally. Mitigated by
  a wall-owned declaration site, the `design-system/ts-ha/pages/wall.md` override,
  and confining Hearth to the wall display (D8).
- **Chunk hoisting**: a stray Hearth import from the entry or the editor could pull
  the wall CSS into first paint. Caught by the extended `web-ui-assets.test.ts`
  assertion (D5).
- **Light-scheme dilution**: a true-black dark scheme can tempt a mechanical light
  inversion. The spec's "The light wall scheme is designed" scenario guards this.
- **Scope creep into behaviour**: the widget catalog and composition model are
  non-goals; any proposal to change them is a separate change.
