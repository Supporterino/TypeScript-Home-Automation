# Tasks

## 1. Shared contract — the zone label and the new widget types

- [x] 1.1 Add an optional `zone` to `WallWidget` in `packages/shared/src/wall.ts` and validate it in `packages/shared/src/wall-schema.ts` (optional, trimmed, non-empty, length-bounded); update `scripts/contract-inventory.json` only if `WallWidget` is a tracked contract. Verify `bun run --filter @ts-ha/shared typecheck` passes and a `bun test packages/shared/tests --conditions=development` run is green.
- [x] 1.2 Add shared-schema tests: a profile with a valid `zone` parses, an invalid `zone` (wrong type / empty) is rejected, and an existing profile without `zone` still parses unchanged. Verify the new tests pass.
- [x] 1.3 Add `link` and `devices` to `WALL_WIDGET_TYPES` in `packages/shared/src/wall.ts` with `WallLinkWidgetConfig` (`target`, `label?`) and `WallDeviceGridWidgetConfig` (`qualifiedIds`, `title?`), and validate both in `packages/shared/src/wall-schema.ts`; update `scripts/contract-inventory.json` only if the widget type or its type list is a tracked contract. Verify `bun run --filter @ts-ha/shared typecheck` passes and shared-schema tests cover a valid `link` and `devices` and reject an invalid one.

## 2. Pure wall layout — bands, span tiers, fit resolver

- [x] 2.1 Add `packages/web-ui/src/app/wall/bands.ts`: group widgets by `zone` and return each zone's bounding box `{zone, x, y, w, h}`. Verify with tests covering a single zone, several zones, an unzoned widget, and a disjoint zone.
- [x] 2.2 Add `packages/web-ui/src/app/wall/span.ts`: map a placement plus its descriptor `min`/`defaults`/`max` to a `compact | regular | roomy` tier. Verify with tests at each boundary.
- [x] 2.3 Rework `wall/grid.ts`: return an explicit `fits`/`tooLarge` outcome, set `overflowY: "hidden"` in every case (remove the `auto` branch), lower `ROW_UNIT_MAX` to the reduced scale (D10), and re-derive `ROW_UNIT_MIN` so a minimum-span light cell holds the compact composition at the touch/type floors. Verify with resolver tests for a fitting profile, an exactly-fitting profile, and a too-large profile, plus a floor test and a bounds test asserting the lowered ceiling and the re-derived floor.
- [x] 2.4 Document the resolver outcome and the re-derived `ROW_UNIT_MIN` in the module header comment, citing the spec's "Panel Fit". Verify the comment names the requirement and `bun run lint` passes.
- [x] 2.5 Add `packages/web-ui/src/app/wall/pages.ts`: a pure resolver mapping a widget's span and a content count to tiles-per-page and a page count (for the device grid, D12). Verify with tests at several spans: a selection that fits is one page, a larger selection pages, and the page count is exact.

## 3. Wall surface — band rendering, the unfittable state, readout text

- [x] 3.1 Add the band token to `wall/hearth.css` (`--hearth-band`, dark and light) and the band-readout tier to `wall/type-ramp.ts` (`WALL_TYPE_RAMP.bandMin/bandMax`, `WALL_BAND_FONT_SIZE`, mirroring `--hearth-text-band`). Verify the ramp test asserts the tier sits above the body floor and below the hero, and the CSS and TS bounds agree.
- [x] 3.2 Render the band layer in `wall/WallGrid.tsx` from `resolveBands`, behind the widget cells, with the zone label, and render the contained "too large for this panel" explanation when the resolver reports `tooLarge`. Verify with tests: a zoned profile renders a labelled band, an unzoned widget renders none, and a too-large profile renders the explanation rather than a scrolling grid.
- [x] 3.3 Ensure a readout's value and unit render as one non-breaking unit and add a short-name helper to `packages/web-ui/src/app/lib/humanize-name.ts` used by wall cards when the full name does not fit. Verify with tests: the value and unit are not split, and two long device names that share a prefix render distinguishing short forms.
- [x] 3.4 Rescale the wall's type ramp (D10): lower the hero/metric/title bounds and `vmin` coefficients and the label tier in `wall/type-ramp.ts`, mirror the values in `wall/hearth.css`, and hold the body floor at 18 px (above the dashboard's 16 px body scale) and the chip at 16 px. Verify a ramp test asserts the tablet-effective sizes are reduced, the body floor holds, and the hero/metric readouts stay above the dashboard's 34 px ceiling.

## 4. Span-aware widgets

- [x] 4.1 Expose the span tier through `WallWidgetProps` (`wall/registry.ts`) and have the widget renderers consume it. Verify `bun run --filter @ts-ha/web-ui typecheck` passes and the existing wall widget tests stay green.
- [x] 4.2 Recompose the scene tile (`wall/widgets/SceneWidget.tsx`) for a large span so it does not repeat its minimum-span composition. Verify with a test that the large-span composition differs from the minimum-span one while pressed/busy/error states are preserved.
- [x] 4.3 Move grouped readouts (`wall/widgets/TemperatureWidget.tsx`, the wall readout in `components/DeviceTile.tsx`) onto the band tier, chosen by span, with the value/unit kept together. Verify with tests: a grouped readout uses the band tier, and a value at the minimum span stays on one line.
- [x] 4.4 Redesign the wall `light` card (`components/DeviceTile.tsx`, `size="wall"`) into the compact form: form-per-tier controls that present every declared control at the type's re-derived (lower) minimum span without overflow (D10). Verify with tests: a light declaring brightness + colour-temperature + colour at the minimum span renders all three within its cells and does not overflow; the dashboard (`size="default"`) rendering is unchanged.

## 5. Navigation and the device grid

- [x] 5.1 Add `packages/web-ui/src/app/wall/widgets/DeviceGridWidget.tsx` and its `devices` descriptor (`wall/registry.ts`, with a `min` span that holds at least the first page's row of tiles at the floors): render the configured `qualifiedIds` as a uniform grid of the shared wall device card (`components/DeviceTile.tsx`, `size="wall"`), one page at a time from `wall/pages.ts` with touch page controls and no scroll. Verify with tests: the grid renders exactly the selected devices; a selection larger than the span pages and presents page controls; a tile actuates like a wall device card.
- [x] 5.2 Add `packages/web-ui/src/app/wall/widgets/LinkWidget.tsx` and its `link` descriptor (`wall/registry.ts`): render a touch target carrying the label (or the target profile's name) and navigate to the target with `wallPath`. Verify with tests: activating the link resolves its target profile.
- [x] 5.3 Add the on-screen back affordance for a wall reached from a link (`wall/WallGrid.tsx` / `views/WallView.tsx`) using the shared router's history, and confirm a link to an unknown profile renders the existing not-found explanation. Verify with tests: a wall reached from a link offers a back control; an unknown target renders the explanation.
- [x] 5.4 Page the favorites and room tile grids rather than scrolling them: re-point `wall/widgets/FavoritesWidget.tsx` and `wall/widgets/RoomWidget.tsx` off their inner `overflowY: "auto"` onto the shared pure pagination layer (`wall/pages.ts` / a shared page planner) with touch page controls, satisfying the spec's "Panel Fit" ("a widget pages rather than scrolls"). Verify with tests: a favorites/room selection larger than its span pages and presents page controls rather than scrolling, and the wall never scrolls.

## 6. Editor — zone field, draft preview, fit gate

- [x] 6.1 Add per-widget `zone` configuration to `wall/editor/model.ts` and `wall/editor/WidgetConfigFields.tsx`. Verify with editor tests that a zone is set, cleared, and round-trips through save validation.
- [x] 6.2 Add a pure draft-preview module and render it in `wall/editor/WallEditor.tsx`: the draft's composition at the 1920 × 1080 panel ratio, using the resolver, with a fit verdict and a device grid's page count, and refuse to save an unfittable draft. Verify with tests: the preview resolves at the panel ratio; an unfittable draft is reported and not saved; a device grid's page count is reported.
- [x] 6.3 Add link-target configuration (a profile-name field) and device-grid device-selection configuration to `wall/editor/model.ts` and `wall/editor/WidgetConfigFields.tsx`. Verify with editor tests: a link target and a device selection each round-trip through save validation.
- [x] 6.4 Confirm the editor preview does not pull Hearth into the editor chunk or first paint: extend `packages/web-ui/tests/web-ui-assets.test.ts`. Verify the wall-stylesheet-absent-from-first-paint assertion still passes.

## 7. Documentation and release

- [x] 7.1 Rewrite `design-system/ts-ha/pages/wall.md` for zones, the span-aware card grammar, the compact light card, the band-readout tier, the link and device-grid types, and the fit rule, keeping the token tables and the row-unit bounds in sync with `hearth.css` and D10. Verify no table contradicts `hearth.css` and `bun run lint` passes on the changed files.
- [x] 7.2 Add a Changeset covering `@ts-ha/shared` and `@ts-ha/web-ui`. Verify `bun run version` (or the Changesets status command) lists exactly those two packages.
- [x] 7.3 Update `docs/http/web-ui.md` to the landed wall behaviour (the never-scrolling fit rule and reduced row unit, zones, the band-readout tier, the compact light card, the link and device-grid types, and favorites/room paging), so no wall claim contradicts `hearth.css`, `wall/grid.ts`, `type-ramp.ts`, or D10; amend `.changeset/wall-zones-and-fit.md`'s web-ui text so it names every wall tile grid that pages (device grid, favorites, room) rather than scrolling. Verify no stale row-unit or scroll claim remains and `bun run lint` passes on the changed files.

## 8. Integration verification

- [x] 8.1 Run the workspace gate `bun run typecheck && bun run check && bun run test` and confirm it passes.
- [x] 8.2 Run `bun run build` and confirm the wall stylesheet is emitted as its own content-hashed asset and excluded from the first-paint budget. Verify via the build output and `web-ui-assets.test.ts`.
- [ ] 8.3 Manually open a wall at 1920 × 1080 against a profile shaped like the observed one (clock, weather, a climate group, light/scene controls) and confirm: nothing clips or scrolls, cards render at the reduced component scale (D10), zones render as labelled bands, the light card fits at its re-derived minimum span with every declared control, and a deliberately oversized profile shows the explanation.
- [ ] 8.4 Manually confirm the new surfaces: a link widget opens its target wall and a wall reached from a link offers a back control, a link to a deleted profile shows the not-found explanation, and a device grid with more tiles than fit its span pages with page controls rather than scrolling.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
