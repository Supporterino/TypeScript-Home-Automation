# Tasks — Wall Redesign (Hearth)

> Delivery is a single pass. Read `proposal.md`, `design.md`, and the deltas under
> `specs/` before starting. Hearth is largely presentational, but the widget
> presentations are redesigned (not re-skinned), the light card gains controls,
> the catalog gains one additive widget type (a shared change), and a cover's
> transport action is added in core. The composition model and every other
> behaviour are unchanged.
>
> **Staging note.** Hearth is added as its own wall-scoped stylesheet alongside the
> existing Lumen system, so the dashboard keeps compiling and its first paint is
> untouched throughout. The wall surface is then re-skinned and its widgets
> redesigned onto Hearth; there is no Lumen cutover (the dashboard keeps Lumen).

## 1. Shared contract and Hearth foundations

- [x] 1.1 Extend the shared wall contract (`packages/shared/src/wall.ts`, `wall-schema.ts`): add `temperature` to `WALL_WIDGET_TYPES`, add a `WallTemperatureWidgetConfig` type and its schema, and register the schema in `WALL_WIDGET_CONFIG_SCHEMAS`; update `scripts/contract-inventory.json` if the new type is a tracked contract. Verify `bun run --filter @ts-ha/shared typecheck` passes and the total-record assertion still compiles (design.md D13)
- [x] 1.2 Add `packages/web-ui/src/app/wall/hearth.css` declaring the wall-scoped tokens: `--hearth-*` colour under a wall root scope (dark, authoritative, true-black) and a designed `[data-theme="light"]` scheme, plus the Hearth type ramp (incl. a re-derived body floor ≥ 18 px), spacing, radius, elevation, and motion. Verify no token aliases a Lumen token and every colour token has a value in **both** schemes (design.md D2, D3)
- [x] 1.3 Import `hearth.css` from the wall **surface** modules only (e.g. `wall/WallGrid.tsx`/`wall/WidgetFrame.tsx`), never from `src/app/index.tsx` or the editor; verify `bun run --filter @ts-ha/web-ui build:web-ui` emits it as a separate CSS asset and no Hearth CSS is in the first-paint output (design.md D5)
- [x] 1.4 Extend `packages/web-ui/tests/web-ui-assets.test.ts` with a "wall stylesheet is not in first paint" assertion, mirroring the existing `WALL_CHUNK_MARKER` guard (`wall/registry.ts`); verify the test fails if `hearth.css` is imported from the entry (design.md D5)
- [x] 1.5 Declare and dispatch the cover transport action in core: add a writable `action` enum (`["open","close","stop"]`) to the Shelly cover capability description (`packages/core/src/device-sources/shelly-capabilities.ts`) and map it in `ShellySource.command()` (`shelly-source.ts`) to `ShellyService.coverOpen`/`coverClose`/`coverStop`. Verify a core test asserts each value reaches the matching `Cover.*` RPC and that a stop command is now accepted where it was previously rejected (design.md D15)

## 2. Wall surface and widget presentations

- [x] 2.1 Re-skin `packages/web-ui/src/app/wall/WallGrid.tsx`, `wall/WidgetFrame.tsx`, and `wall/frame.ts` onto Hearth (panel background, single gutter, ambient-vs-control chrome); verify widget positions/sizes and the clamped row unit are unchanged (design.md D6)
- [x] 2.2 Re-skin `wall/scale.ts` and its consumers, and update `wall/registry.ts` presentation constants — raise `WALL_MIN_TOUCH_TARGET` from `48` to `56` and enforce ≥ 8 px between adjacent controls; add the `temperature` descriptor (grammar, defaults, min/max, schema, renderer). Verify `wall-registry.test.ts` passes (design.md D4, D13)
- [x] 2.3 Rewrite `wall/type-ramp.ts` for the Hearth distance ramp and the re-derived body floor, updating `components/DeviceTile.tsx`'s wall-mode imports and any other consumers; verify `wall-type-ramp.test.ts` passes (design.md D3)
- [x] 2.4 Redesign the widget renderers onto the shared Hearth card vocabulary (`wall/widgets/**`: clock, weather, energy, status ambient readouts; room, favorites control shells): an icon/glyph leading the card, a title, a metric on the wall ramp, and a single action-affordance slot. Preserve each widget's behaviour, config surface, and states (unconfigured/empty/stale/unreachable) (design.md D11)
- [x] 2.5 Redesign the scene widget (`wall/widgets/SceneWidget.tsx`) onto the vocabulary, preserving the manual-trigger path, the pressed/busy states, and the on-tile failure surfacing; verify `wall-scene.test.ts` and `wall-scene-tile.test.ts` pass (design.md D14)
- [x] 2.6 Redesign the wall readout presentation in `components/DeviceTile.tsx` (archetype `readout`) onto the vocabulary — a leading glyph, the reading on the metric ramp, and a quiet label — keeping it chrome-less, non-navigable, and non-color state encoding; verify the readout assertions in `wall-card-archetypes.test.ts` and `wall-read-only.test.ts` (design.md D13)
- [x] 2.7 Implement the temperature widget renderer (`wall/widgets/TemperatureWidget.tsx`) and its editor field (`wall/editor/WidgetConfigFields.tsx`): a reading from the configured sensor device, contained when the device is unknown, and selectable in the editor's type picker; verify a new test covers config validation, the reading, and unknown-device containment (design.md D13)
- [x] 2.8 Broaden the wall cover detection (`lib/card-archetype.ts`) so a cover is recognised by a writable transport action as well as a writable position, and extend `components/CoverTransport.tsx` to present up/down/stop using the declared transport action, falling back to the position extremes. Verify a position-less cover renders transport, open/close use the declared transport, and a cover that cannot stop still omits Stop (design.md D15)

## 3. Wall device tile

- [x] 3.1 Redesign `packages/web-ui/src/app/components/DeviceTile.tsx`'s `light` archetype in wall (`size="wall"`) mode: a distinct, touch-sized device-icon on/off affordance, a name and percentage readout, a full-width brightness bar as the value control, an off-state visual that turns the light on when activated, and colour-temperature/colour controls offered only when the device declares the capability. Preserve props/contracts, capability ranking, optimistic override, the glyph-only observation indicator, the other archetypes, and the dashboard rendering (design.md D7, D12)

## 4. Tests

- [x] 4.1 Re-point the wall presentation tests at Hearth and extend them for the redesign, preserving each test's intent: `wall-type-ramp`, `wall-scale`, `wall-frame`, `wall-grid`, `wall-registry` (56 px + temperature descriptor), `wall-card-archetypes` (redesigned readout), `wall-single-surface`, `wall-read-only`, the per-widget tests that assert presentation, and new coverage for the temperature widget, the light card's controls (including omission when a capability is absent), the scene/readout redesign, and cover transport (position-less cover renders transport; a cover that cannot stop omits Stop). Update `capability-ranking.test.ts`'s cover-stop expectations for the newly expressible stop.
- [x] 4.2 Run `bun run --filter @ts-ha/web-ui test` and `bun run --filter @ts-ha/web-ui typecheck`; verify all pass

## 5. Documentation, changeset, and verification

- [x] 5.1 Rewrite `design-system/ts-ha/pages/wall.md` for Hearth (true-black dark + designed light, the distance ramp and re-derived floor, 56 px targets, the widget card vocabulary, and the divergence-from-Lumen note); keep `MASTER.md` unchanged
- [x] 5.2 Add a Changeset covering `@ts-ha/shared` (the temperature widget type/config/schema), `@ts-ha/core` (the cover transport action), and `@ts-ha/web-ui` (Hearth and the widget redesign)
- [x] 5.3 Run the workspace gate `bun run typecheck && bun run check && bun run test`; verify it is green, the dashboard's first-paint budget is unchanged, and the wall stylesheet is excluded from it
- [ ] 5.4 Manual verification: the wall in dark and light at 375 px / 768 px / ≥ 1024 px and portrait + landscape; verify 56 px touch targets, the redesigned widgets, the light card's toggle/brightness/colour controls and its off-state behaviour, a shutter's up/down/stop transport (including stopping a running shutter), no hover-required interaction, reduced-motion behaviour, and that loading the dashboard does not fetch the wall stylesheet

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
