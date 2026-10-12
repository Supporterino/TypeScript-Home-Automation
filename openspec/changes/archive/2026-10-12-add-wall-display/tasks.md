## 1. Shared contracts

- [x] 1.1 Define the wall-profile contract types in `@ts-ha/shared` — the profile's name (its stable identifier and address), versioned config, widget placements `{x, y, w, h}`, and per-orientation layout — and verify `bun run --filter @ts-ha/shared typecheck` passes
- [x] 1.2 Add the wall-profile Zod schema (bounds on grid cells, known widget types, placement validity) and verify unit tests in `packages/shared/tests/` cover valid and invalid configs
- [x] 1.3 Add the `wall` event to the stream event contract in `packages/shared/src/events.ts` (category, profile name, change kind), and verify the normalized-event test suite recognises it
- [x] 1.4 Export the new types/schema from the `@ts-ha/shared` barrel and verify `bun run --filter @ts-ha/shared typecheck` still passes

## 2. Core: persistence and manager

- [x] 2.1 Implement `WallManager` in `packages/core/src/` mirroring `RoomManager` — `$internal:wall:<name>` keys via `setInternal`/`deleteInternal`/`keysInternal`, create/list/read/update/delete — and verify unit tests cover each operation and restart persistence
- [x] 2.2 Reject duplicate identifiers on create/rename and return a descriptive conflict; verify by test
- [x] 2.3 Validate configs through the shared schema on write and reject invalid input without persisting; verify by test
- [x] 2.4 Emit the `wall` event on create/update/delete and verify no raw state event is emitted for the reserved key (test through the state/event path)

## 3. Core: HTTP endpoints and engine wiring

- [x] 3.1 Add `GET /api/walls`, `GET /api/walls/:name`, `POST /api/walls`, `PUT /api/walls/:name`, `DELETE /api/walls/:name` to `HttpServer`, registered behind the existing `/api/*` auth, and verify endpoint tests cover success, 404, 409, and 400 cases
- [x] 3.2 Wire `WallManager` into the engine and the server's setter wiring (mirroring `setRoomManager`), and verify `bun run --filter @ts-ha/core test` passes
- [x] 3.3 Verify a profile persists across an engine restart using the existing state-persistence path (integration test or documented manual check)

## 4. Web UI: routing and full-bleed render

- [x] 4.1 Add `wall` and `walls` views and path builders to `packages/web-ui/src/app/lib/router.ts`, and verify router tests cover `/wall/:name` and `/walls`
- [x] 4.2 Add `wall` and `walls` to `UI_VIEW_SEGMENTS` in `packages/web-ui/src/web-ui-routes.ts` and verify existing status-page tests assert both serve the shell and an unregistered segment does not
- [x] 4.3 Add a full-bleed branch above `AppShell` in `App.tsx` that renders `WallView` for the `wall` view and keeps `AppShell` for every other view; verify a test asserts the wall renders without chrome and other views still render with it
- [x] 4.4 Add the wall-profile API client functions (`fetchWalls`, `fetchWall`, `createWall`, `updateWall`, `deleteWall`) to `api.ts` and verify `bun run typecheck` passes

## 5. Web UI: widget grid and catalog

- [x] 5.1 Build the declarative widget registry (id, label, defaults, min/max dims, config schema, renderer) and verify a test asserts every registered type resolves a renderer and dimensions
- [x] 5.2 Build the full-bleed 12-column grid renderer that maps a profile's placements (base + orientation override) to CSS grid; verify with a pure-placement unit test in both orientations
- [x] 5.3 Implement the clock/date widget (client clock) and verify it renders correct time with the engine unreachable
- [x] 5.4 Implement the weather widget using `/api/weather` and verify it reports unconfigured within its area when the service is absent, without breaking the profile
- [x] 5.5 Implement the energy widget using `/api/energy` and verify it renders live totals without a manual refresh
- [x] 5.6 Implement the favorites widget (reusing the favorites state key) and verify it reflects a favorite change streamed from another client
- [x] 5.7 Implement the room widget (device tiles plus the room batch command) and verify all-off commands every capable member and skips report-only members
- [x] 5.8 Implement the single-device widget and verify it reconciles and reverts a failed command like the dashboard tile
- [x] 5.9 Implement the status/presence summary widget and verify counts update from streamed events
- [x] 5.10 Implement the scene-button widget using the existing automation manual-trigger path and verify it triggers the bound automation and surfaces a failure without taking down the profile
- [x] 5.11 Implement the scaled wall device tile (size token reusing the existing ranking/optimistic logic) and verify touch targets meet the wall minimum via a test assertion
- [x] 5.12 Wrap the wall grid and all widget renderers in a single lazy `wall` chunk and verify the build's first-paint budget assertion still passes and the chunk is not in first paint

## 6. Web UI: editor

- [x] 6.1 Build `WallsView` (list, create, rename, delete) reachable as an admin navigation entry, and verify CRUD round-trips against the API
- [x] 6.2 Build the profile editor: add a widget of any type, configure it, and place/size it with non-drag cell/span controls, respecting per-type min/max dims; verify a user can compose and save a profile described by the acceptance criteria
- [x] 6.3 Enforce the wall read-only rule — no editing controls on `WallView` — and verify by inspection/test
- [x] 6.4 Surface validation errors in the editor using the shared schema and verify an invalid save is rejected and does not change the stored profile

## 7. Live updates and always-on behaviour

- [x] 7.1 Subscribe the wall to the `wall` event so an open wall re-renders on save, and verify an edit from the editor appears on the open wall without reload
- [x] 7.2 Render an explanatory empty state for an unknown profile and for a profile deleted while open, with a route to the editor; verify both by test
- [x] 7.3 Verify reconnect behaviour: interrupted then restored network resumes updates and re-reads the snapshot without reload
- [x] 7.4 Verify bounded memory over a long high-event session (log ring and device map do not grow without limit)

## 8. Verification and docs

- [x] 8.1 Run `bun run typecheck && bun run check && bun run test` and confirm all pass
- [x] 8.2 Confirm `scripts/guard-deps.ts` and `guard-contracts.ts` still pass (no cross-package import violations, no new contract drift)
- [x] 8.3 Update documentation (README/AGENTS notes as appropriate) to describe wall profiles, the `/wall/:profile` and `/walls` routes, and the kiosk limitations left to host configuration
