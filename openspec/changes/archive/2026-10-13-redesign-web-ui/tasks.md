# Tasks — Web UI Redesign (Lumen)

> Delivery is a single pass (user decision): the whole frontend is migrated
> before the review gate. Tasks are grouped for delegation, not for partial
> review.
>
> **Staging note.** To keep the app building between delegations, the new stack
> is added *alongside* Mantine first: `@mantine/*` stays installed,
> `index.tsx` keeps `MantineProvider`, and every not-yet-migrated view keeps
> compiling. Mantine, `theme.ts`, `tokens.ts`, and `tokens.css` are removed only
> in the **final cutover** (task 9.6), after no view or component imports them.

## 1. Foundation — toolchain and tokens

- [x] 1.1 Add to `packages/web-ui/package.json`: `tailwindcss`, `bun-plugin-tailwind`, `lucide-react`, `clsx`, `tailwind-merge`, and the `@radix-ui/*` primitives in use. **Keep** `@mantine/*` and `@tabler/icons-react` installed until the cutover (9.6); verify `bun install` succeeds
- [x] 1.2 Add `src/app/styles/app.css` (the Tailwind entry: `@import "tailwindcss";` + `@theme` Lumen tokens + base/layer overrides) and a `src/app/ui/cn.ts` helper (`clsx` + `tailwind-merge`); verify the token block declares dark (`:root`) and light (`[data-theme="light"]`) values for every colour token in design.md D3
- [x] 1.3 Add a `src/app/lib/theme.tsx` `useTheme()` hook (light/dark/system, persisted to `localStorage["ts-ha-theme"]`, reads/writes `document.documentElement.dataset.theme`) and a no-flash inline bootstrap in the app entry; verify manual: reload keeps the chosen scheme with no wrong-scheme flash
- [x] 1.4 Rework `scripts/build-web-ui.ts` to register the Tailwind plugin and point at the new CSS entry, keeping content-hash, `splitting`, the `development` condition, the self-hosted-font emission/rewrite, gzip, `firstPaint` flagging, and the first-paint budget assertion; verify `bun run --filter @ts-ha/web-ui build:web-ui` succeeds and no Mantine CSS remains in the manifest
- [x] 1.5 Update `src/components/html-shell.ts`: load the Tailwind-hashed stylesheet, carry the no-flash theme bootstrap, and update `theme-color`/icon metadata to the Lumen palette; verify the shell still references (never inlines) the bundles

## 2. Primitive layer (`src/app/ui/`)

- [x] 2.1 Build the layout/display primitives (`Card`, `Stack`, `Row`, `Grid`, `Badge`, `Chip`, `Divider`, `Spinner`, `EmptyState`, `Stat`, `ScrollArea`); verify they consume only tokens/utilities (no literal hex) and render in both schemes (primitives no view needed — `Skeleton`, `Meter`, `Toast` — were dropped in review rather than shipped unused)
- [x] 2.2 Build `Button`, `IconButton`, and `NavItem` with variants (solid/soft/ghost/danger), visible `:focus-visible` rings, and ≥ WCAG target sizing that enlarges on touch; verify keyboard focus and disabled states
- [x] 2.3 Build the Radix-backed interactive primitives (`Dialog`, `DropdownMenu`, `Switch`, `Slider`, `ToggleGroup`, `Select`, `Tooltip`, `Collapsible`) with Lumen styling and focus trapping; verify each with a small render/keyboard check (unused `Drawer`, `Tabs`, `Popover` were dropped in review along with their Radix deps)

## 3. Shell and navigation

- [x] 3.1 Rebuild `App.tsx` as a mobile-first shell: sticky safe-area-aware app bar, wide-viewport persistent grouped rail, narrow-viewport control-first tab bar with an overflow affordance for remaining control entries; keep the full-bleed wall path chrome-less; verify no scroll content is hidden behind fixed bars at 375 px
- [x] 3.2 Rebuild `components/Nav.tsx` on `ui/NavItem`: control group (favorites sub-list, overview, rooms, unassigned, all devices) and operator group, each collapsible and active-state-correct (`isUnder`, `/devices/unassigned` excluded from "All devices"); verify the active-in-collection and back-navigation scenarios
- [x] 3.3 Wire the theme control (light/dark/system) and the transport indicator into the header using `ui/` primitives; verify both render and the transport copy distinguishes live/polled/stale

## 4. Shared components

- [x] 4.1 Rebuild `components/DeviceTile.tsx` on `ui/*` preserving its props/contracts: one dominant primary action-or-readout, non-colour state encoding, explicit open-detail affordance, favorite/hide corner slot, nested/`contained` and `wall` modes; verify the tile behaviour tests pass unchanged in intent
- [x] 4.2 Rebuild `components/CapabilityControl.tsx` and `components/CoverTransport.tsx` (declared-type-driven controls, range/value constraints, coalescing, transport open/close/stop) with Lumen styling; verify control/deadline tests still pass
- [x] 4.3 Rebuild `components/SourceViewer.tsx` (lazy `prismjs`, Lumen syntax theme) and `components/ErrorBoundary.tsx`; verify the highlighter is still not in first paint and the boundary keeps view-failure isolation

## 5. Control views

- [x] 5.1 Rebuild `views/OverviewView.tsx` (summary stats, favorites, room zones, empty-home explanation) on `ui/*`
- [x] 5.2 Rebuild `views/RoomsView.tsx` and `views/RoomView.tsx` (member grid, unavailable/hidden distinction, reveal + operable filters, membership-management mode reachable without hover, room command with optimistic revert)
- [x] 5.3 Rebuild `views/DevicesView.tsx` (all/unassigned, filters, group identification) and `views/DeviceDetailView.tsx` (capability controls, raw identifier, group membership, hide/unhide)

## 6. Operator views

- [x] 6.1 Rebuild `views/AutomationsView.tsx` (enabled toggle) and `views/AutomationDetailView.tsx` (triggers, enabled, manual run, source, executions with errors, filtered logs, required services, related devices, watched/observed state keys, declared-vs-observed distinction)
- [x] 6.2 Rebuild `views/StateView.tsx` (list + inspect/write/delete, reserved namespace excluded), `views/LogsView.tsx` (level + text filter, live append), and `views/HomekitView.tsx` (bridge/pairing/accessories, unconfigured state)
- [x] 6.3 Rebuild `views/EnergyView.tsx` (instantaneous power, cumulative consumption, per-device breakdown, trend when history enabled, history-disabled usefulness) and `views/WeatherView.tsx` (current + forecast, unconfigured state)
- [x] 6.4 Rebuild `views/NotFoundView.tsx` and `views/WallsView.tsx` (profile list + create/rename/delete/edit)

## 7. Wall surface

- [x] 7.1 Rebuild `wall/WallGrid.tsx`, `wall/WidgetFrame.tsx`, `wall/scale.ts` consumers, and the nine widgets on Lumen tokens/`ui/*`, preserving the clamped row unit, single gutter, type ramp, ambient-vs-control grammar, and the wall device-tile mode; verify wall grid/frame/scale/type-ramp tests pass
- [x] 7.2 Rebuild `wall/editor/WallEditor.tsx` and `wall/editor/WidgetConfigFields.tsx` (responsive multi-column widget list, per-widget config) on `ui/*`

## 8. Documentation and metadata

- [x] 8.1 Rewrite `design-system/ts-ha/MASTER.md` for Lumen (palette, typography, spacing/radius/elevation, motion, component rules, anti-patterns) and update `design-system/ts-ha/pages/wall.md` to the Lumen tokens
- [x] 8.2 Update `packages/web-ui/README.md` and any `docs/` page that names Mantine or Ambient Glass so the documentation matches the new stack
- [x] 8.3 Add a Changeset for the `@ts-ha/web-ui` change

## 9. Tests and verification

- [x] 9.1 Rebind `tests/theme.test.ts` to the Lumen token source (parse the Tailwind entry `:root`/`[data-theme="light"]` blocks; assert the same contrast rules and the non-Mantine accent)
- [x] 9.2 Re-point presentational tests that asserted Mantine internals at the new primitives/labels, preserving each test's intent; add tests for the theme hook (default/persist/apply) and the no-flash bootstrap
- [x] 9.3 Run `bun run --filter @ts-ha/web-ui test` and `bun run --filter @ts-ha/web-ui typecheck`; verify all pass
- [x] 9.4 Run the workspace gate `bun run typecheck && bun run check && bun run test`; verify all pass and the first-paint budget still holds
- [ ] 9.5 Manual verification: dark/light/system across overview, a room, device detail, logs, energy, and the wall at 375 px and ≥ 1024 px; verify no theme flash, safe-area inset, and reduced-motion behaviour
- [x] 9.6 Cutover: remove `@mantine/core`, `@mantine/hooks`, `@tabler/icons-react` from `package.json`; delete `src/app/theme.ts`, `src/app/tokens.ts`, `src/app/styles/tokens.css`; drop the `MantineProvider` and Mantine stylesheet imports from `index.tsx` and update the package `description`; verify no `@mantine`/`@tabler` import remains under `src/app/**` and the full gate is green
