## 1. Presentational primitives (pure + tested)

- [x] 1.1 Add a pure card-archetype selector that maps `rankDeviceTile(...)` to `light`/`toggle`/`cover`/`readout`/default, verify with unit tests covering a dimmable light, an on/off-only switch, a cover, a sensor, and an unknown device
- [x] 1.2 Add a pure cover-stop detector that finds a writable transport capability capable of stop (stop-like permitted value or writable `state` enum), verify with unit tests for a Zigbee cover, a Shelly cover (no stop), and a device without any transport property
- [x] 1.3 Update `design-system/ts-ha/pages/wall.md` with the card-archetype grammar, the chrome-less readout card, and the wall-only two-control light rule-break; verify a design-system reviewer can follow ambient/control vs archetype surface

## 2. Single-surface cards

- [x] 2.1 Add a `contained` mode to the shared `DeviceTile` (and `WallDeviceTile`) so it draws no `Paper` of its own; verify the existing dashboard tile tests still pass unchanged
- [x] 2.2 Have `WidgetFrame` pass `contained` to nested device tiles for `control` widgets; verify by rendering the `device`, `room`, and `favorites` widgets and confirming a single border per card (widget test asserting one surface)

## 3. Card archetypes

- [x] 3.1 Render the `light` archetype with a brightness slider (persistent `%` readout) plus an on/off toggle, and no whole-card actuation; verify a widget test toggles and sets brightness independently and both reconcile/revert
- [x] 3.2 Render the `readout` archetype as a chrome-less card (dominant value, quiet label, no surface) and verify a sensor device renders without a control surface
- [x] 3.3 Keep the pure `toggle` archetype as the whole-card toggle and verify the existing "whole tile actuates a toggle" test still passes
- [x] 3.4 Demote the observation channel to a non-textual indicator (`title`/`aria-label` retained, icon shape + token preserved, unreachable marker allowed); verify a test asserts no `live`/`polled ·` text on the card face and that push/polled/unreachable remain distinguishable

## 4. Cover transport

- [x] 4.1 Add a `CoverTransport` control (open → `position.max`, close → `position.min`, stop only when 1.2 detects support); verify a widget test that a stop-capable cover shows three controls and a Shelly-like cover shows two
- [x] 4.2 Wire the transport controls through the same optimistic hook as other controls; verify open/close/stop reflect immediately and revert with a surfaced error on failure
- [x] 4.3 Verify each transport control meets `WALL_MIN_TOUCH_TARGET` and is operable without hover

## 5. Scene button

- [x] 5.1 Replace the bare `Button` with a full-bleed pressable tile (large icon + label, token-driven pressed/active and busy states, no layout shift); verify the existing scene-trigger and error-surfacing tests still pass and the widget renders as a full-bleed surface

## 6. Human-readable device names

- [x] 6.1 Add a pure `humanizeDeviceName` helper (separators → spaces + title-case; already-human names unchanged) and verify with unit tests for `livingroom_couch`, a hyphenated name, an already-spaced name, and an empty string
- [x] 6.2 Apply the helper at every name-presentation site (tiles, `DeviceDetailView`, room membership, room/device select options) and verify a test asserts the humanised label renders while the raw identifier still addresses the device and appears in detail

## 7. Editor layout

- [x] 7.1 Make the editor widget list a responsive grid (`base: 1, md: 2`), each widget staying a self-contained card; verify a test renders ≥4 widgets across two columns at a wide viewport and one column narrow, with no horizontal scroll

## 8. Verification gate

- [x] 8.1 Run `bun run --filter @ts-ha/web-ui test` and `bun run typecheck`; verify all pass
- [x] 8.2 Run `bun run check`; verify Biome and the dependency/contract guards pass
- [x] 8.3 Confirm the lazy `wall` chunk still excludes first paint (`WALL_CHUNK_MARKER` absent from first-paint assets) and no new dependency was added
