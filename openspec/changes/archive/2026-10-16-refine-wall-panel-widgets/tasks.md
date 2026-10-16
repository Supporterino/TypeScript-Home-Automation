## 1. Shared contract

- [x] 1.1 Add optional `usageWh`, `windowMinutes`, and `coveredMinutes` to `EnergyData` in `packages/shared/src/wire.ts`, with doc comments; verify `packages/shared/tests/wire.test.ts` still constructs a valid `EnergyData` and `bun run --filter @ts-ha/shared test` passes.
- [x] 1.2 Run `bun run check`; if `guard-contracts` reports `EnergyData` as a tracked contract, update `scripts/contract-inventory.json` to match the new shape (never edit it to silence a violation) and re-run `bun run check`.

## 2. Core aggregator

- [x] 2.1 Retain a bounded ring of per-device cumulative-energy readings in `packages/core/src/energy/energy-aggregator.ts`, sized by the existing `ENERGY_HISTORY_MINUTES` sampling window, alongside the power history; verify new/extended cases in `packages/core/tests/energy-aggregator.test.ts` cover full coverage, partial coverage, and no coverage.
- [x] 2.2 Populate `usageWh`, `windowMinutes`, and `coveredMinutes` in `EnergyAggregator.snapshot()`, summing each device's change over the retained span across the devices that report a reading at both ends, so a device that is unreachable or declares no reading is excluded rather than counted as zero; verify `packages/core/tests/energy-aggregator.test.ts` asserts the change over a window and the exclusion, including a device that becomes unreachable mid-window.
- [x] 2.3 Extend the `GET /api/energy` test in `packages/core/tests/http-server.test.ts` to assert the three fields on the response; run `bun run --filter @ts-ha/core test`.

## 3. Wall energy widget

- [x] 3.1 Map the usage, window, and coverage to a display string and a covered-span label ("last 24h", "last 6h") in `packages/web-ui/src/app/wall/widgets/energy-model.ts`, with an absent value when nothing is covered; verify `packages/web-ui/tests/wall-energy.test.ts` covers full, partial, and absent.
- [x] 3.2 Present the usage in `packages/web-ui/src/app/wall/widgets/EnergyWidget.tsx` in place of the "Total" metric, labelled with the covered span; verify the renderer's structural test still leads with the ported state item and keeps the value on the wall's readout tier.
- [x] 3.3 Add the three fields to the harness energy fixture in `packages/web-ui/src/app/wall/harness/fixtures.ts`; verify the harness (`bun run --filter @ts-ha/web-ui harness`) renders the labelled usage.

## 4. Wall temperature widget

- [x] 4.1 Resolve the bound device's identifier in `packages/web-ui/src/app/wall/widgets/temperature-model.ts`: the device's room name where the store's `rooms[].members` contains it, otherwise the shortened device name; verify unit tests cover an assigned device, an unassigned device, and two same-named devices in different rooms.
- [x] 4.2 Use the resolved identifier on the label in `packages/web-ui/src/app/wall/widgets/TemperatureWidget.tsx`, keeping the readings and the contained unavailable/unconfigured explanations unchanged; verify the widget test and the harness.

## 5. Wall one-row scene

- [x] 5.1 Set `scene.min.h` to 1 in `packages/web-ui/src/app/wall/registry.ts` and update `SCENE_MIN_SPAN` and the compact composition in `packages/web-ui/src/app/wall/widgets/scene-model.ts`; verify the registry/span tests and the editor's size rule accept one row.
- [x] 5.2 Make `wallFrameDrawsSurface` in `packages/web-ui/src/app/wall/frame.ts` placement-aware so a scene at one row draws no surface, leaving `WidgetFrame` to render it chrome-less; verify `wall-frame`/`WidgetFrame` tests cover the one-row and two-row cases.
- [x] 5.3 Confirm the one-row scene stays within its cell with a target at or above the wall's minimum at the row-unit floor; verify `wall-grid`/span tests and the harness at 1920×1080.

## 6. Wall device-card actions row

- [x] 6.1 Add width distribution to `WallCardActions` in `packages/web-ui/src/app/wall/cards/card-anatomy.tsx`: a row of fixed controls spreads across the card, a row containing a flexible control keeps that control's `flex: 1` and centres the fixed controls beside it, and the ported control height/radius are unchanged; verify a card-anatomy test.
- [x] 6.2 Apply the distributed row where each typed card composes its actions (Cover, Lock, Light, Fan, Climate, Select, Number, Room, and the paged tile grid's page row); verify each card's rendering test and that `WALL_CARD_CONTROL_ROW_MIN_WIDTH_PX` and the derived minimum column span are unchanged.

## 7. Docs and changeset

- [x] 7.1 Update `design-system/ts-ha/pages/wall.md`: the scene row in the widget/catalog table and its one-row composition, the temperature label, the energy usage, and the actions row; verify the page renders and matches the code.
- [x] 7.2 Update the energy section of `docs/api-reference.md` to document `usageWh` / `windowMinutes` / `coveredMinutes`; verify `bun run typecheck` (which includes `docs/examples`) still passes.
- [x] 7.3 Add one Changeset covering `@ts-ha/shared`, `@ts-ha/core`, and `@ts-ha/web-ui`; verify the changeset file is valid.

## 8. Verification

- [x] 8.1 Run `bun run typecheck && bun run check && bun run test` and confirm all pass.
- [x] 8.2 In the harness at 1920×1080 in both schemes, confirm: a one-row scene triggers and does not overflow; the energy widget shows labelled usage; four same-named sensors read as their rooms; every device card's actions row fills its width without distorting a control.
