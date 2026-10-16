## Context

This refines the wall surface (`packages/web-ui/src/app/wall/`) and follows the
one-row-scene pattern set by the archived `refine-wall-panel-widgets` change
(its design D1). See `proposal.md` for motivation; this records *how*.

Current state that shapes the approach:

- **One row is 50–56 px.** `ROW_UNIT_MIN`/`ROW_UNIT_MAX` are 50/56
  (`wall/grid.ts`); a framed cell gives the renderer `cell − 20 px`, i.e. 30–36
  px, below the 42 px floor. That is why the one-row scene drops the frame
  surface, and why a one-row link must too.
- **The chrome-less rule is a scene branch.** `wallFrameDrawsSurface()`
  (`wall/frame.ts`) has a private `SCENE_CHROME_LESS_ROWS = 1` and a single
  `type === "scene"` check. `wall-single-surface.test.ts` pins it to
  `scene.min.h`.
- **A device widget's frame is already chrome-less** (`isWallDeviceClass`);
  its card owns the surface. So a one-row device cell already has the whole cell
  as the renderer's box — only the minimum and the composition block one row.
- **The device card composes from its box.** `resolveCardFormForBox()`
  (`wall/cards/card-composition.ts`) returns `compact` for any box below 116 px;
  `EntityCard`'s content is 56–62 px, so a one-row cell would clip.
- **The minimum is consumed in several places, most without device access.**
  The editor clamp (`wall/editor/model.ts`'s `clampSpan`), `validateProfileDraft`
  (pure), and the frame's `composesMinimumSpan` (`wall/WidgetFrame.tsx`). The
  wall renders inside `DataStoreProvider` (`app/App.tsx`, `wall/harness/stage.tsx`),
  so the frame *can* read the store; `WidgetFrame` currently does not.
- **Each card already knows whether it presents controls.** Every typed card
  computes `hasControls` from its own model (e.g. `LockCard`'s `model.property`,
  `LightCard`'s `controls.length`), passed into `resolveDeviceCardComposition`.

## Goals / Non-Goals

**Goals:**

- A `link` and a control-less device widget are authorable at one row and hold
  the 42 px floor without exempting it.
- The one-row rule is declared once and read by both the frame's surface
  decision and the effective-minimum resolver.
- The effective (device-aware) minimum is single-sourced across the frame, the
  editor, and save validation.

**Non-Goals:**

- No new card vocabulary, metric, or type-ramp value.
- No change to any paged tile's two-row cell.
- No change to the profile schema, its version, or any shared contract (the
  profile is newly authorable, not newly loadable).

## Decisions

### D1 — Declare one-row behaviour once, in the registry descriptor

`WallWidgetDescriptor` (`wall/registry.ts`) gains an optional
`slim?: { min: WallWidgetSpan; when: "always" | "read-only" }`:

- `link` → `{ min: { w: 2, h: 1 }, when: "always" }`
- `entity` and every read-only-capable typed type → `{ min: { w: 3, h: 1 }, when: "read-only" }`

`wallFrameDrawsSurface()` reads the descriptor: for `when: "always"` at the slim
rows it returns `false`, replacing the scene branch with a type-local lookup
kept in `frame.ts`. `resolveSpanTier` continues to derive from the static
`min`/`defaults`/`max`, so the tier does not become device-aware.

*Alternatives.* A `WALL_ONE_ROW_CHROME_LESS_TYPES` set in `frame.ts` was
rejected: the registry is the catalogue's declared single source
(`design-system/ts-ha/pages/wall.md`), and a per-type branch is what this change
removes. Two separate fields (`oneRowChromeLess`, `readOnlyMin`) were rejected as
two spellings of one concept.

### D2 — A shared device-aware minimum resolver, fed by per-card readiness

A resolver in `wall/editor/model.ts` (beside `minimumSpanFor`) computes a
widget's effective minimum from its descriptor, whether it is titled, and — for a
`when: "read-only"` type — whether the bound device presents controls. "Presents
no controls" comes from the **card's own model/predicate**, exported per card, so
the resolver cannot admit a one-row cell for a card that would still draw a
control. `minimumRendererBoxHeightPx` (`wall/frame.ts`) and `composesMinimumSpan`
(`wall/span.ts`) take this effective descriptor, so a one-row read-only cell
passes the frame's guard.

*Alternatives.* A capability-level predicate in `cards/device-class.ts` was
rejected: it can drift from a card's real `hasControls` and admit a one-row card
that clips. Resolving in `WallGrid` and passing a prop down was rejected in
favour of the frame reading the store itself (D3), which keeps the grid
device-free.

### D3 — The frame reads the store; it stays the one explanation place

`WidgetFrame` calls `useDataStore()` to resolve its bound device and effective
minimum; `WallGrid` stays device-free. The existing `tooSmall` guard
(`composesMinimumSpan`) uses the effective minimum, so the frame remains the
single place a card is explained — matching the scene precedent, where the tile
has no explanation path of its own.

*Alternatives.* Threading the minimum from `WallGrid` was rejected as it couples
the grid to devices and changes its render signature. Moving the explanation
into the card was rejected: it would add a second explanation place and duplicate
the guard.

### D4 — A `slim` card form, shared by every read-only-capable card

`wall/cards/card-composition.ts` gains a `"slim"` value on
`WallDeviceCardForm`, resolved below `compact`: a single inline line (leading
icon, name, state), no observation indicator, the whole cell as the actuation
target where the primary action is a toggle. Every typed card composes it at a
one-row box, not `EntityCard` alone, so a read-only `lock`/`climate`/`fan`
composes the same form. Paged tiles (`WALL_TILE_CELL_ROWS = 2`) never reach it.

*Alternatives.* An entity-only inline form was rejected as inconsistent and
would leave read-only non-entity cards clipping. A `prominent`-style reuse of the
two-line anatomy was rejected because the two-line block (36 px) plus the
ported 10 px inset exceeds the 50–56 px cell.

### D5 — The link draws a flush route variant; the shared route keeps its pill

The one-row link renders a **flush** `WallCardRoute` variant: no border, no
raised background, no inset, the whole cell as the anchor. The shared
`WallCardRoute` (`wall/cards/card-anatomy.tsx`) keeps its ported pill for the
wall view's **Back** affordance and for framed links, so the variant is opted
into by the link at its one-row minimum only.

*Alternatives.* Removing the route's border globally was rejected: the Back
affordance and framed links are surfaces by design. Keeping the pill inside a
chrome-less frame (no frame surface, route border retained) was rejected because
it does not satisfy "no border" and reads as a floating chip in the cell.

### D6 — Validation gains an optional device set, conservative when absent

`validateProfileDraft(name, config, devices?)` accepts the bound devices so it
can apply the device-aware minimum; when omitted it assumes the control-bearing
(two-row) minimum, so existing callers and tests are unaffected. The editor
(`WallEditor`) passes the store's devices; the harness passes its fixtures. The
editor clamp uses the same resolver so authoring and validation agree.

*Alternatives.* A required argument was rejected: it would churn every call site
and test for no behavioural gain, and a conservative default is the safe one.

### D7 — A titled one-row cell stays un-authorable

The editor's `clampSpan` already adds `WALL_TITLE_ROWS` to a titled widget's
minimum, so a titled one-row link/device is not authorable; a hand-authored
titled one-row cell falls through to `WALL_TOO_SMALL_MESSAGE`. No new state
space, matching the scene precedent (`wall-scene-tile.test.ts`).

*Alternatives.* Growing the slim minimum by the title rows was rejected: it
blurs the one-row promise for a case the scene already leaves un-authorable.

## Risks / Trade-offs

- **Frame now depends on the store** → `WidgetFrame` is rendered only inside
  `DataStoreProvider` (`App.tsx`, `harness/stage.tsx`); tests that render it
  directly must provide the store or the resolver must degrade to the static
  minimum when no device is found. Mitigation: resolve to the static minimum on a
  missing device, and update the frame tests' harness.
- **`slim` form across every card** → each card must compose the inline line, not
  just `entity`. Mitigation: implement it once in the shared card composition and
  have each card branch to it for a `slim` box; the harness walks every class at a
  one-row read-only fixture.
- **Card readiness drift** → the resolver's "no controls" could disagree with a
  card's own `hasControls`. Mitigation: the resolver consumes the card's own
  model/predicate (D2), and a test asserts a one-row card carries no control.
- **Read-only is narrow in practice** → most placed typed widgets were offered
  only for a device that drives the class, so the newly authorable one-row case is
  mostly `entity` plus devices that lost their writable property. Mitigation: the
  spec states the rule from the device, and the editor reflects it live.
- **Two-system drift (Hearth vs Lumen)** → the wall design-system page
  (`design-system/ts-ha/pages/wall.md`) is updated in the same change; the editor
  stays on Lumen.

## Migration Plan

- **Wire/schema:** none. `WALL_PROFILE_VERSION` and the profile-config shape are
  unchanged; a one-row link or read-only device is newly authorable under the same
  version. `validateProfileDraft`'s new argument is optional.
- **Rollback:** revert the registry, frame, editor, and card changes together; a
  profile that used a one-row link/device would then be refused on save (or
  explained on the wall) rather than corrupted.
- **Changeset:** one, covering `@ts-ha/web-ui` only.
