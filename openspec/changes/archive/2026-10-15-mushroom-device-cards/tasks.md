## 1. Shared contract — the typed widget catalogue and version 2

- [x] 1.1 In `packages/shared/src/wall.ts`, add one widget type per device class the capability model can drive (`light`, `cover`, `fan`, `climate`, `lock`, `number`, `select`, `entity`) to `WALL_WIDGET_TYPES`, keeping the existing non-device types, and bump `WALL_PROFILE_VERSION` to `2`. Verify `bun run --filter @ts-ha/shared test` passes with the version and type-list assertions updated.
- [x] 1.2 In `packages/shared/src/wall.ts`, add the typed device widget's config — its bound device plus `layout` (`default` | `vertical` | `horizontal`) and `collapsible_controls` — declared once and shared by every device widget type. Verify the contract inventory script still passes: `bun run scripts/guard-contracts.ts`.
- [x] 1.3 In `packages/shared/src/wall-schema.ts`, validate the typed device widget configs, accept a version-1 profile for migration while validating a version-2 profile on write, and export the version-1 shape the migration reads. Verify `bun run --filter @ts-ha/shared test` covers a valid version-2 profile, a version-1 profile that parses, and an invalid config that is rejected.
- [x] 1.4 Update `scripts/contract-inventory.json` for any tracked contract that moved or was added, and verify with `bun run scripts/guard-contracts.ts`.

## 2. Core — migrate a stored profile

- [x] 2.1 In `packages/core/src/wall-manager.ts`, migrate a stored version-1 profile on load: a widget that named one device becomes that device's typed widget at the same placement and zone, and a widget that named a set of devices keeps its selection. Verify a test in `packages/core/tests/` loads a stored version-1 fixture and asserts the migrated widgets' types, placements, zones, and referenced devices.
- [x] 2.2 In `packages/core/src/wall-manager.ts`, write profiles at the current version and report a profile that cannot be migrated instead of dropping it, leaving the wall's other profiles loadable. Verify `bun test packages/core/tests --conditions=development` covers the write path and the unmigratable case.

## 3. Wall card foundations

- [x] 3.1 In `packages/web-ui/src/app/wall/hearth.css`, declare the ported card token table as the wall's own tokens (icon size and shape, primary and secondary type, control height and radius, control spacing, card padding and radius, slider metrics), each with the ported source recorded in the comment. Verify `bun test packages/web-ui/tests/wall-tokens.test.ts --conditions=development` (or that file's equivalent) asserts the values against the design-system page's table.
- [x] 3.2 Add the pure device-class resolver and the ported contrast improvement as dependency-free modules under `packages/web-ui/src/app/wall/cards/`: a capability profile maps to exactly one device class, and a colour's saturation is raised to the ported floor with near-greys lifted. Verify unit tests cover each class selection, the fallback class, and the contrast improvement's boundaries.
- [x] 3.3 Build the shared card anatomy components under `wall/cards/`: the circular icon affordance with its tinted shape, the name-over-state text block, the actions row, and the slider with the ported track and thumb. Verify a test asserts each meets the wall's minimum touch target and that adjacent controls keep the wall's separation floor.
- [x] 3.4 Remove the wall presentation from the shared device tile: `components/DeviceTile.tsx`'s `size="wall"` branch and its `wallTier` / `wallCardForm` props, so the tile is dashboard-only. Verify `bun run typecheck` passes and `bun test packages/web-ui/tests --conditions=development` shows the dashboard's tile tests unchanged.

## 4. The cards

- [x] 4.1 Implement the light card: the icon affordance as its on/off control, the name and brightness reading, and an actions row carrying the active control (brightness, colour temperature, colour, whichever the device declares) with the other controls beside it. Verify `bun test packages/web-ui/tests/wall-card-light.test.ts --conditions=development` covers on/off/unreachable, each declared control, and the off state turning the device on.
- [x] 4.2 Implement the cover card: its position as the primary reading and discrete open/stop/close transport in the actions row, with stop offered only when the device can express it. Verify tests cover a position-less cover, a stop-capable cover, and a transport failure reverting inline.
- [x] 4.3 Implement the entity card as the typed fallback: the icon affordance, name and state, whole-card actuation where the device's primary action is a toggle, and no control where the device has none. Verify tests cover a switch, a read-only sensor, and an unclassified device.
- [x] 4.4 Implement the number and select cards: a slider with the value for a bounded numeric control, and the permitted values for an enumerated control, each as the sole action in the actions row. Verify tests cover both, including a device whose range or permitted values are absent.
- [x] 4.5 Implement the fan, climate and lock cards: a percentage with presets for a fan, a setpoint with its mode for a climate, and lock/unlock for a lock. Verify `bun test packages/web-ui/tests --conditions=development` covers each card's controls and its class selection.
- [x] 4.6 Wire each card's per-card options: `layout` (default, vertical, horizontal) and controls hidden while the device is inactive, with the composition resolved from the box the card is given. Verify tests assert each layout's composition, that hidden controls keep the non-control composition, and that a taller box composes a richer form rather than inflating the smaller one.

## 5. Registry and catalogue

- [x] 5.1 In `packages/web-ui/src/app/wall/registry.ts`, register the typed device widgets with their spans, labels and config, and retire the single generic `device` type. Verify `wall-registry.test.ts` (or its equivalent) asserts the catalogue, each type's default span, and that every type's card exists.
- [x] 5.2 Retire the wall's use of `lib/card-archetype.ts` and `wall/widgets/WallDeviceTile.tsx`, and re-derive `wall/grid.ts`'s `ROW_UNIT_MIN` and its ceiling from the ported card's height. Verify `bun test packages/web-ui/tests/wall-grid.test.ts packages/web-ui/tests/wall-span.test.ts --conditions=development` asserts the derivation against the ported card's real height, and that `wall/span.ts`'s floors follow it.
- [x] 5.3 Show a widget of a class its device cannot drive as an explanation inside the widget's own area rather than an inert card. Verify a test covers a device whose capabilities drive no class.

## 6. Tiles and the absorbed tile sizing

- [x] 6.1 In `wall/pages.ts`, bound a tile row at 1.25× the tile's own cell and never below it, leaving `tilesDown` and the page count exactly as the pitch resolves them. Verify `wall-pages.test.ts` asserts the cap, the floor, and the unchanged page count at the harness's geometry.
- [x] 6.2 In `wall/widgets/PagedTileGrid.tsx`, draw each row at the resolved height and centre the space the tiles do not use, handing each tile the box it resolved. Verify `wall-device-grid.test.ts` asserts the drawn height equals the plan's for a one-row and a several-row page.
- [x] 6.3 In `wall/widgets/RoomWidget.tsx`, `FavoritesWidget.tsx` and `DeviceGridWidget.tsx`, render the typed card per device and resolve each tile's composition from the box the grid hands it. Verify `wall-paging.test.ts` covers the page count, and that a tile in a short box composes a lighter form than the same card in a tall box.

## 7. Editor

- [x] 7.1 In `packages/web-ui/src/app/wall/editor/**`, configure a typed device widget: bind its device, with only the devices whose capabilities can drive that class offered, plus the card's layout and inactive-controls setting. Verify the editor tests cover binding, the offered-device rule, and persistence of both options.
- [x] 7.2 Re-derive the editor's height floor and fit report from the ported card's row unit, and keep refusing to save a draft that cannot fit. Verify the editor tests assert the new floor and the refusal, and that the reported page count matches the wall's.

## 8. Documentation, attribution and changeset

- [x] 8.1 Replace `design-system/ts-ha/pages/wall.md`'s device-card section with the ported catalogue, the metric tables, the re-derived row unit, and the recorded attribution, keeping the page's table and `hearth.css` in agreement. Deliverable: the page states every value the tokens declare.
- [x] 8.2 Record the attribution for the ported design and its licence in the repository's notices, and update `docs/http/web-ui.md`'s wall section for the typed catalogue, the cards, the re-derived floors and the paging rule. Deliverable: no remaining reference to the generic device card on the wall.
- [x] 8.3 Add a Changeset covering `@ts-ha/shared`, `@ts-ha/core` and `@ts-ha/web-ui`. Deliverable: the changeset file exists and `bun run check` passes.

## 9. Verification gate

- [x] 9.1 Run `bun run typecheck` and confirm every package plus `docs/examples` passes.
- [x] 9.2 Run `bun run check` and confirm Biome, `guard-contracts` and `guard-deps` pass with no new dependency edge.
- [x] 9.3 Run `bun run test` and confirm the full suite passes, including the catalogue, card, migration, tile-sizing and editor cases.
- [x] 9.4 Walk the harness for each card in both wall schemes and both orientations at 1920×1080, confirming every card composes at the ported metrics without overflow at its minimum span. Record the outcome on this task.
  - **Outcome (recorded).** No browser/DOM is available to this agent, so the harness was verified programmatically: the harness draft now places a typed device widget for every class (light, cover, fan, climate, lock, number, select, entity), and `wall-harness-walk.test.ts` resolves each card at its type's minimum span through the wall's own chain (`wallGridMetrics → rendererBoxHeightPx → placedDeviceCardBox → resolveDeviceCardComposition`) on both the 1920×1080 and 1080×1920 panels across `[ROW_UNIT_MIN, ROW_UNIT_MAX]`, asserting the composed card fits its box in both the vertical and horizontal directions with no clipped control. Both wall schemes share one composition (the metric/composition modules are scheme-free; the scheme is an `html` `data-theme` attribute), so a dark/light flip changes colour tokens only. The verification found a real horizontal overflow (a 3-control actions row exceeding a 2-column minimum cell on the portrait panel); it was fixed by deriving each typed device widget's minimum COLUMN span from its widest bounded control row (`WALL_MIN_DEVICE_COLUMNS = 3`, device min/default spans 2×2 → 3×2; the whole-row/`devices` minimum → 6×4) and bounding enum option labels, with the tile cell split into `WALL_TILE_CELL_COLUMNS`/`WALL_TILE_CELL_ROWS`. What remains for a human visual pass: rendered-pixel legibility at distance and scheme contrast.
- [x] 9.5 Confirm the change's scope held: no dashboard rendering change and no `@ts-ha/cli` change, with `git diff --stat` limited to `packages/shared`, `packages/core`, `packages/web-ui`, `design-system`, `docs`, `scripts/contract-inventory.json` and the changeset.
