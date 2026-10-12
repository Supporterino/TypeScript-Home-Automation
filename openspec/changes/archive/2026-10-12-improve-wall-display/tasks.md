## 1. Registry defaults and descriptor grammar

- [x] 1.1 Add a `grammar: "ambient" | "control"` field to `WallWidgetDescriptor` in `packages/web-ui/src/app/wall/registry.ts` and classify each type (clock, weather, energy, status → ambient; room, favorites, device, scene → control); verify a registry test asserts every type resolves a grammar
- [x] 1.2 Retune registry defaults and min spans per design D5 (clock toward hero sizing, weather `3×3`, device `2×2`, room `6×4`, scene `2×2`) within existing min/max bounds; verify the registry test asserts every default lies within its type's min/max and the existing registry tests pass

## 2. Content-sized wall grid

- [x] 2.1 Add a pure `resolveRowUnit(availableHeight, occupiedRows)` helper in `packages/web-ui/src/app/wall/grid.ts` clamping to `ROW_UNIT_MIN`/`ROW_UNIT_MAX`; verify a unit test covers a short profile (clamps to max), an exact fit, and a tall profile (clamps to min)
- [x] 2.2 Replace `gridAutoRows: "minmax(0, 1fr)"` in `WallGrid.tsx` with the resolved row unit and center the grid block vertically (`alignContent`); verify a layout test asserts a small-span widget's height follows the row unit rather than the panel height
- [x] 2.3 Replace the fixed `GRID_GAP_PX` with a single `clamp(16px, 2vmin, 24px)` gutter/padding and keep `overflow: hidden` with scroll only as a last resort; verify a test asserts the gutter token and that adjacent widgets are separated by at least the minimum

## 3. Card grammar and opt-in titles

- [x] 3.1 Drive `WidgetFrame.tsx` from the descriptor grammar so ambient widgets render without a control surface and control widgets render as a surface tile whose whole card is the target; verify a frame test asserts an ambient widget renders no bordered surface and a control widget does
- [x] 3.2 Render a widget's title header only when `config.title` is set; verify a test asserts no header is rendered when unset and a header when set

## 4. Ambient widget type ramp

- [x] 4.1 Apply a distance-readable type ramp (readouts 32–64px, labels 16–20px, minimum body 16px) to the clock, weather, energy, and status renderers using existing tokens; verify the widget tests pass and text contrast holds in both schemes
- [x] 4.2 Verify no text below 16px remains in the ambient widget renderers, by test or inspection

## 5. Wall device presentation

- [x] 5.1 Add a wall presentation path to `packages/web-ui/src/app/components/DeviceTile.tsx` (keyed off the existing `size="wall"` token) that suppresses the favorite toggle, the hide/unhide toggle, and the open-detail affordance, and makes the whole card the actuation target, without forking the ranking/optimistic/state logic; verify the existing tile tests still pass and a new wall-mode test asserts the wall presentation resolves with no favorite, hide/unhide, or Details affordance
- [x] 5.2 Make a wall read-only device (no actuatable property) render as a readout with no navigation affordance; verify a test asserts the wall presentation resolves with no detail affordance
- [x] 5.3 Select the wall presentation in `wall/widgets/WallDeviceTile.tsx`; verify the room, favorites, and device widgets render it and that the room batch command still applies and reverts optimistic overrides (existing tests)
- [x] 5.4 Verify wall tile actuation still reflects immediately, reconciles against reported state, and reverts with the failure surfaced, reusing the optimistic-override test path

## 6. Editor, docs, and design-system page override

- [x] 6.1 Confirm the editor's non-drag placement still composes and saves a profile with the new defaults and no schema change; verify the editor model tests pass
- [x] 6.2 Add `design-system/ts-ha/pages/wall.md` recording the row-unit bounds, gutter, type ramp, and ambient/control grammar as a MASTER override; verify the file exists and defers to MASTER for shared tokens
- [x] 6.3 Update repository docs (AGENTS notes / README as appropriate) to describe the wall kiosk presentation and the wall-specific tile mode that revisits design D7

## 7. Verification

- [x] 7.1 Run `bun run typecheck && bun run check && bun run test` and confirm all pass
- [x] 7.2 Verify the `wall` chunk is still absent from first paint and the budget assertion passes (`bun run --filter @ts-ha/web-ui build`)
- [x] 7.3 Confirm `scripts/guard-deps.ts` and `guard-contracts.ts` pass (no cross-package import violations, no contract drift)
- [ ] 7.4 Open a wall on a landscape panel and confirm a small control is no longer inflated, titles are opt-in, and device tiles present no management affordances
