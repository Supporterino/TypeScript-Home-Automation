# Tasks — Wall Redesign (Hearth)

> Delivery is a single pass. Read `proposal.md`, `design.md`, and the deltas under
> `specs/` before starting. Hearth is presentational: the wall's behaviour, widget
> catalog, composition model, and shared schemas do **not** change.
>
> **Staging note.** Hearth is added as its own wall-scoped stylesheet alongside the
> existing Lumen system, so the dashboard keeps compiling and its first paint is
> untouched throughout. The wall surface is then re-skinned onto Hearth; there is
> no Lumen cutover (the dashboard keeps Lumen).

## 1. Hearth foundations

- [ ] 1.1 Add `packages/web-ui/src/app/wall/hearth.css` declaring the wall-scoped tokens: `--hearth-*` colour under a wall root scope (dark, authoritative, true-black) and a designed `[data-theme="light"]` scheme, plus the Hearth type ramp (incl. a re-derived body floor ≥ 18 px), spacing, radius, elevation, and motion. Verify no token aliases a Lumen token and every colour token has a value in **both** schemes (design.md D2, D3)
- [ ] 1.2 Import `hearth.css` from the wall **surface** modules only (e.g. `wall/WallGrid.tsx`/`wall/WidgetFrame.tsx`), never from `src/app/index.tsx` or the editor; verify `bun run --filter @ts-ha/web-ui build:web-ui` emits it as a separate CSS asset and no Hearth CSS is in the first-paint output (design.md D5)
- [ ] 1.3 Extend `packages/web-ui/tests/web-ui-assets.test.ts` with a "wall stylesheet is not in first paint" assertion, mirroring the existing `WALL_CHUNK_MARKER` guard (`wall/registry.ts`); verify the test fails if `hearth.css` is imported from the entry (design.md D5)

## 2. Wall surface re-skin

- [ ] 2.1 Re-skin `packages/web-ui/src/app/wall/WallGrid.tsx`, `wall/WidgetFrame.tsx`, and `wall/frame.ts` onto Hearth (panel background, single gutter, ambient-vs-control chrome); verify widget positions/sizes and the clamped row unit are unchanged (design.md D6)
- [ ] 2.2 Re-skin `wall/scale.ts` and its consumers, and update `wall/registry.ts` presentation constants — raise `WALL_MIN_TOUCH_TARGET` from `48` to `56` and enforce ≥ 8 px between adjacent controls (design.md D4)
- [ ] 2.3 Rewrite `wall/type-ramp.ts` for the Hearth distance ramp and the re-derived body floor, updating `components/DeviceTile.tsx`'s wall-mode imports and any other consumers (design.md D3)
- [ ] 2.4 Re-skin the wall widgets (`wall/widgets/**`: clock, weather, energy, room, favorites, device, status, scene) onto Hearth, preserving each widget's behaviour, config surface, and states (unconfigured/empty/stale/unreachable)

## 3. Wall device tile

- [ ] 3.1 Re-skin `packages/web-ui/src/app/components/DeviceTile.tsx`'s `size="wall"` mode onto Hearth; preserve props/contracts, capability ranking, optimistic override, whole-card actuation, the suppressed management affordances, the glyph-only observation indicator, and the card archetypes (design.md D7)

## 4. Tests

- [ ] 4.1 Re-point the wall presentation tests at Hearth while preserving each test's intent: `wall-type-ramp`, `wall-scale`, `wall-frame`, `wall-grid`, `wall-registry` (56 px), `wall-card-archetypes`, `wall-single-surface`, `wall-read-only`, and the per-widget tests that assert presentation
- [ ] 4.2 Run `bun run --filter @ts-ha/web-ui test` and `bun run --filter @ts-ha/web-ui typecheck`; verify all pass

## 5. Documentation, changeset, and verification

- [ ] 5.1 Rewrite `design-system/ts-ha/pages/wall.md` for Hearth (true-black dark + designed light, the distance ramp and re-derived floor, 56 px targets, and the divergence-from-Lumen note); keep `MASTER.md` unchanged
- [ ] 5.2 Add a Changeset for the `@ts-ha/web-ui` change
- [ ] 5.3 Run the workspace gate `bun run typecheck && bun run check && bun run test`; verify it is green, the dashboard's first-paint budget is unchanged, and the wall stylesheet is excluded from it
- [ ] 5.4 Manual verification: the wall in dark and light at 375 px / 768 px / ≥ 1024 px and portrait + landscape; verify 56 px touch targets, no hover-required interaction, reduced-motion behaviour, and that loading the dashboard does not fetch the wall stylesheet
