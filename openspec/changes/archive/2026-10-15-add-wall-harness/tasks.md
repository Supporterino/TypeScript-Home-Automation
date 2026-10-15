## 1. Fixture seam in the data layer

- [x] 1.1 Add a `DataStoreFixtures` interface to `packages/web-ui/src/app/lib/data-store.tsx` covering `devices`, `state`, `rooms`, `automations`, and `transport`, typed against the same `DeviceDescriptor`, `StateMap`, `Room`, `Automation`, and `TransportState` types the store already consumes. Verify `bun run --filter @ts-ha/web-ui typecheck` passes and that no `@ts-ha/shared` contract is declared or re-declared here.
- [x] 1.2 Add an optional `fixtures?: DataStoreFixtures` prop to `DataStoreProvider` that seeds the store from the fixture set and skips the snapshot fetch and the event-stream subscription, leaving the no-prop path byte-for-byte unchanged. Verify a new test in `packages/web-ui/tests/` asserts that with `fixtures` supplied no `fetch` call and no `EventSource` subscription occurs, and that with no prop the existing data-layer tests still pass.
- [x] 1.3 Verify the fixture seam is not selectable at runtime: assert in the same test file that no environment variable, query parameter, or config key is read on the fixture path. Confirm by inspection that `fixtures` is reachable only as a React prop.
- [x] 1.4 Extend the fixture seam to the two wall widgets that source their own reading: add optional `weather` and `energy` readings to `DataStoreFixtures`, expose them read-only through `DataStoreProvider` so `WeatherWidget` and `EnergyWidget` prefer a supplied reading over their own fetch, and leave the no-fixture path byte-for-byte unchanged. Verify `bun run --filter @ts-ha/web-ui typecheck` and `bun run --filter @ts-ha/web-ui test` pass, with a test asserting neither widget fetches when its reading is supplied and both fetch when it is not.

## 2. Harness fixtures

- [x] 2.1 Create `packages/web-ui/src/app/wall/harness/fixtures.ts` with one device per archetype from design D6 — a full light (on/off, brightness, colour temperature, colour), a plain switch, a cover with position and stop, a read-only sensor, a value device, a selection large enough that the device grid must page, and an identifier deliberately absent from the map — plus one scene automation, one room with members, and the weather and energy readings those two widgets consume. Verify `bun run --filter @ts-ha/web-ui typecheck` passes, proving the fixtures satisfy the store's own types.
- [x] 2.2 Verify coverage by rendering each archetype once through the harness control panel (available after group 4) and confirming every wall widget type renders a real composition rather than a contained explanation (with the weather and energy fixtures supplied), except the deliberately absent identifier, which renders `DeviceWidget`'s "is not available" message.

## 3. Dev server and harness shell

- [x] 3.1 Create `packages/web-ui/scripts/harness.ts` that builds and serves the harness HTML entrypoints — design D8's documented fallback (an in-memory `Bun.build` with `conditions: ["development"]` plus a static server and a watch/rebuild loop), because the fullstack HTML-import server ignores Tailwind's `@source` globs on the installed Bun — and add `"harness": "bun --conditions=development run scripts/harness.ts"` to `packages/web-ui/package.json`. Verify the script starts and serves the shell, and that `@ts-ha/shared` resolves to `packages/shared/src` with `packages/shared/dist` absent (confirm by removing `dist` locally and reloading).
- [x] 3.2 Add the control-document shell (`wall/harness/harness.html` and `wall/harness/main.tsx`) importing both `styles/app.css` and `wall/hearth.css`. Verify the imported stylesheet compiles under the dev server, and that a throwaway element using a Hearth token and a Tailwind utility (for example `flex` plus `var(--hearth-canvas)`) renders styled in the browser. Verify by re-running the script and reloading after a source edit that hot reload applies without a restart.

## 4. Stage mode

- [x] 4.1 Add the stage document (`wall/harness/stage.html` and `stage.tsx`) that accepts a draft `WallProfileConfig` over `postMessage` and mounts the production `WallGrid` with it. Verify the stage renders a multi-widget composition with its zone bands and that no harness-local layout code exists — grep the stage for `gridPlacementStyle`, `resolveRowUnit`, and `resolveBands` and confirm it imports none of them.
- [x] 4.2 Size the stage to the panel and scale it in the parent: an `<iframe>` whose layout size is 1920 x 1080 (or 1080 x 1920) with the parent applying a CSS `transform: scale()` to fit. Verify the type ramp resolves above its floor — on the landscape stage a clock hero must compute above 36 px, which fails on a `transform`ed div in a smaller window — and verify `useOrientation()` reports portrait inside a 1080 x 1920 stage by checking that a profile's orientation override applies.
- [x] 4.3 Add the panel selector (landscape, portrait) and confirm no reload is needed for a config change, only for a mode or panel change. Verify by editing a widget's span in the panel and watching the stage update without a page reload.

## 5. Control panel

- [x] 5.1 Build the draft editor panel over the draft config: add and remove a widget of any registered `WALL_WIDGET_TYPES` type, and set its `x`, `y`, `w`, `h`, `zone`, and title. Verify each control respects the type's registry `min`/`max` from `WALL_WIDGET_REGISTRY`, and that a span the editor would refuse is either prevented or visibly flagged. Verify against `bun run --filter @ts-ha/web-ui test` so no existing editor rule regresses.
- [x] 5.2 Add the presentation controls: scheme toggle (dark/light) and the fixture selectors from group 2 (which device, its switch state, its brightness/temperature, whether a device is present), plus a control for whether the weather and energy readings are supplied, so both the fixture path and those two widgets' own fetch path are reachable. Verify each control changes the stage, and that the scheme toggle switches the wall's Hearth tokens rather than applying an ad-hoc class.
- [x] 5.3 Show the Stage-computed values for the selected widget — `tier`, `cardForm`, and `rendererHeightPx` — in the panel. Verify they match design D2's sources by computing them through `resolveSpanTier` and `rendererBoxHeightPx` rather than by duplicating their formulas; confirm no arithmetic is re-implemented in the harness.

## 6. Bench mode

- [x] 6.1 Add a mode switch that replaces the Stage with a Bench surface rendering `getWidgetDescriptor(type).renderer` directly, with `contained`, `tier`, `cardForm`, `rendererHeightPx`, and `rowUnit` supplied by the panel. Verify the renderer is called without `WidgetFrame` in the path — grep the Bench module for `WidgetFrame` and confirm it is absent — and that a card flips between its compact and full forms as `rendererHeightPx` is crossed.
- [x] 6.2 Show the Stage-computed `rendererHeightPx` beside the manual override so a hand-set budget no legal span produces is visibly an artifact of the bench. Verify by setting an override the registry cannot produce (for example a `device` card at a height below its minimum) and confirming the panel marks it as unreachable.

## 7. Guards against first paint

- [x] 7.1 Add a `WALL_HARNESS_MARKER` constant under `wall/harness/` and assert it is absent from every first-paint asset in `packages/web-ui/tests/web-ui-assets.test.ts`, in the same style as the existing `WALL_CHUNK_MARKER` and `--hearth-canvas` assertions. Verify the assertion fails if the marker string is placed in `src/app/index.tsx` and passes once removed.
- [x] 7.2 Add `packages/web-ui/tests/wall-harness-guard.test.ts` that walks imports from `src/app/index.tsx` and asserts nothing under `wall/harness/` is reachable. Verify the test fails when a temporary `import { … } from "./wall/harness/main.js"` is added to `App.tsx` and passes once removed.
- [x] 7.3 Confirm the shipped build is unaffected: run `bun run --filter @ts-ha/web-ui build:web-ui` and verify the emitted asset count, the first-paint budget check, and the existing asset tests are unchanged from before the harness was added.

## 8. Integration verification

- [x] 8.1 Run the workspace gate — `bun run typecheck && bun run check && bun run test` — and confirm all three pass, including `guard-deps` (the harness imports no `@ts-ha/core`) and `guard-contracts` (no shared contract was moved or re-declared).
- [x] 8.2 Manually exercise the full matrix in one session: Stage and Bench; landscape and portrait; dark and light; every widget type; and a composition the fit verdict rejects so the too-large explanation renders. Confirm each is reachable without an engine, broker, or saved profile running.

## 9. Bookkeeping

- [x] 9.1 Add one line for `bun run --filter @ts-ha/web-ui harness` under Build/Lint/Test Commands in `AGENTS.md`. Verify no `docs/` file and no `docs/zensical.toml` entry was added, matching the agreed minimal-surface scope.
- [x] 9.2 Add a patch Changeset for `@ts-ha/web-ui` recording that the shipped frontend assets changed with no public API change. Verify `bun run version` is not run and the Changeset file is the only release artifact added.
