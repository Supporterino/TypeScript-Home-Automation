## 1. Registry and frame surface rule

- [x] 1.1 Add `slim?: { min: WallWidgetSpan; when: "always" | "read-only" }` to `WallWidgetDescriptor` in `packages/web-ui/src/app/wall/registry.ts`; verify `bun run --filter @ts-ha/web-ui typecheck` passes.
- [x] 1.2 Set `link` to `{ min: { w: 2, h: 1 }, when: "always" }` and drop its `min.h` to `1`; verify `wall-registry` reports link min `{ w: 2, h: 1 }`.
- [x] 1.3 Set `entity` and every read-only-capable typed type to `{ min: { w: 3, h: 1 }, when: "read-only" }`, keeping `defaults`/`max` unchanged; verify the typed-device registry test is extended to except these types.
- [x] 1.4 Replace the scene branch in `wallFrameDrawsSurface()` (`wall/frame.ts`) with a descriptor-driven rule reading `slim` (`when: "always"` at the slim rows draws no surface); verify `wall-single-surface` passes for a one-row scene and link.

## 2. Device-aware minimum resolver

- [x] 2.1 Export a "presents no controls" readiness predicate/model from each typed card that already computes `hasControls` (`LockCard`, `LightCard`, `CoverCard`, `FanCard`, `ClimateCard`, `NumberCard`, `SelectCard`); verify each card's existing test still passes.
- [x] 2.2 Add a shared `resolveEffectiveMin(descriptor, titled, readOnly)` (or equivalent) in `wall/editor/model.ts` returning the slim min when the type's `when` matches the device state, else `descriptor.min`; verify a unit test covers `always`, `read-only` with/without controls, and titled.
- [x] 2.3 Make `minimumRendererBoxHeightPx`/`composesMinimumSpan` (`wall/span.ts`, `wall/frame.ts`) accept the effective descriptor so a one-row read-only cell passes and a one-row control-bearing cell is explained; verify `wall-span`/`wall-frame` cases.
- [x] 2.4 Have `WidgetFrame` (`wall/WidgetFrame.tsx`) read `useDataStore()` to resolve the bound device and effective minimum, degrading to the static minimum when no device is found; verify a frame test renders a one-row read-only device and a one-row control-bearing device.
- [x] 2.5 Update `wall/editor/model.ts` `clampSpan`/`minimumSpanFor` to use the effective minimum, and add an optional `devices` argument to `validateProfileDraft` defaulting conservative; verify existing callers/tests compile and pass unchanged.

## 3. Slim card form

- [x] 3.1 Add a `"slim"` value to `WallDeviceCardForm` and resolve it below `compact` in `resolveCardFormForBox` (`wall/cards/card-composition.ts`); verify the compact-form test still passes and a sub-compact box resolves `"slim"`.
- [x] 3.2 Compose the `slim` form once in the shared card layout (a single inline line: icon, name, state; whole-cell actuation; no observation) and have every typed card render it at a `slim` box; verify `EntityCard` and one non-entity card render the inline line at a one-row box.
- [x] 3.3 Give `EntityCard` the one-row whole-cell toggle with no observation indicator; verify a `wall-card-anatomy`/entity test asserts no sub-42 px control and no observation at one row.

## 4. Link flush variant

- [x] 4.1 Add a flush variant to `WallCardRoute` (no border, no raised background, `0` inset) used only by `LinkWidget` at its one-row minimum, leaving the shared pill for the Back affordance; verify a link test asserts the flush variant at one row and the pill at two rows.
- [x] 4.2 Resolve the link's one-row composition from its placement in `LinkWidget`/`link-model.ts`; verify the link still opens its target profile at one row.

## 5. Editor and harness wiring

- [x] 5.1 Pass the store's devices through `WallEditor` to the clamp and `validateProfileDraft`; verify a one-row read-only draft saves and a one-row control-bearing draft is refused.
- [x] 5.2 Extend `wall/harness/draft.ts`/`computed.ts` to resolve the effective minimum with the fixtures; verify the harness panel renders a one-row link and a read-only device.
- [x] 5.3 Manually load the wall harness (`bun run --filter @ts-ha/web-ui harness`) and confirm a one-row link draws flush and a one-row read-only entity is a single inline line within its cell on both panel aspects.

## 6. Docs

- [x] 6.1 Update `design-system/ts-ha/pages/wall.md`: the span table (`link` 2×1, read-only device min), the grammar note, and the Scene/Link/device-card prose.
- [x] 6.2 Update `docs/http/web-ui.md` (the grammar and widget-type paragraphs) and keep `docs/zensical.toml` nav satisfied; verify the doc build/nav check passes.
- [x] 6.3 Add a Changeset covering `@ts-ha/web-ui`; verify `bun run changeset status` (or the changeset file) lists only that package.

## 7. Verification

- [x] 7.1 Run `bun run typecheck` and confirm every package plus `docs/examples` passes.
- [x] 7.2 Run `bun run check` (Biome + both guards) and confirm it passes.
- [x] 7.3 Run `bun run test` and confirm the wall tests (registry, single-surface, span, frame, editor, card-anatomy, harness) pass.
