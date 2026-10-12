## Context

See `proposal.md` for motivation. Constraints that shape the approach:

- The dashboard is a single React + Mantine SPA (`packages/web-ui/src/app`) built
  by `Bun.build` into content-hashed, code-split assets, with a **250 KB gzip
  first-paint budget** asserted against the asset manifest. Anything reaching
  first paint is a budget decision.
- Every routed view renders inside one `AppShell` (`App.tsx:146`) with a 52px
  header, a 220px navbar, and a 56px footer. There is no chrome-less render path
  today.
- Rooms are the existing template for owner-managed, reserved-namespace data:
  `RoomManager` stores definitions under `$internal:room:<id>`
  (`room-manager.ts:14`) using `StateManager.setInternal()`/`deleteInternal()`,
  and exposes them through their own `/api/rooms` routes
  (`http-server.ts:723`) — because the public state API refuses reserved keys
  (`http-server.ts:584`). Reserved keys persist under the existing
  `STATE_PERSIST` mechanism.
- The client data layer is snapshot-then-stream (`data-store.tsx:188`): a REST
  snapshot, then a long-lived SSE stream with a fallback poll and re-snapshot on
  reconnection. Room definition/membership changes arrive as typed events.
- The last redesign set a non-goal of adding any frontend runtime dependency
  beyond Mantine (`redesign design.md:44`), and deferred scenes (`:39`).
- The device-tile presentation and its optimistic/coalescing behaviour are
  specified as the single device presentation everywhere.

## Goals / Non-Goals

**Goals:**

- A profile-addressed, full-bleed wall surface that reuses the existing theme,
  data layer, endpoints, and view-segment registration pattern.
- A widget grid the owner composes in the admin UI without adding a dependency.
- Everything the wall needs lands in one lazy chunk, leaving first paint
  untouched.
- Device controls on the wall behave exactly as they do elsewhere, only larger.

**Non-Goals:**

- A drag-and-drop layout engine or any frontend dependency beyond Mantine.
- A scene subsystem (scene buttons trigger existing automations).
- Screen wake-lock, a wall-specific fullscreen PWA manifest, or burn-in
  mitigation (left to the host/tablet).
- A wall-specific long-lived auth token (session cookie is reused as-is).
- Promoting the wall into ordinary navigation.

## Decisions

### D1. The wall is a view in the existing SPA, not a separate application

A `/wall/:profile` view is added to the client route table and the server's
`UI_VIEW_SEGMENTS` allowlist, reusing the theme, `data-store`, `api`, and asset
pipeline. A separate bundle would fork the data layer and the budget story for
no behavioural gain.

- **Alternative:** a standalone embedded app — rejected; duplicate data layer and
  a second build target.

### D2. Profiles persist in the reserved namespace via a new `WallManager`

A `WallManager` mirrors `RoomManager`: profile configs are stored under
`$internal:wall:<name>`, written and deleted through the state store's internal
API, and enumerated with `keysInternal()`. Because the public state API refuses
reserved keys, the manager is paired with its own `/api/walls` CRUD routes.

- **Rationale:** profile config is precious, owner-authored data that must
  survive a restart and must not be clobbered from the State view. The reserved
  namespace already exists for exactly this ("rooms, membership, enabled flags")
  and is already non-streamable and non-enumerable through the public API.
- **Trade-off:** the editor needs a dedicated endpoint instead of reusing
  `PUT /api/state/:key`; accepted, and it turns out to be the same surface the
  editor needs for validation anyway.
- **Alternative:** an ordinary state key like `favorites` (design D9 of the
  prior redesign) — rejected; that exposes the config to arbitrary edits and
  deletion in the State view, which is the failure the reserved namespace exists
  to prevent.

### D3. Full-bleed render is a branch above `AppShell`

`App.tsx` resolves the route and, when the view is `wall`, renders `WallView`
directly, without `<AppShell>`. All other views keep the existing shell. This
keeps the chrome-less path to a single explicit branch rather than a shell that
conditionally hides its regions.

- **Alternative:** keep `AppShell` and hide header/navbar/footer for the wall —
  rejected; conditional chrome produces layout thrash and leaves the shell's
  220px assumptions in the wall's rendering path.

### D4. A 12-column CSS grid with per-widget spans and per-breakpoint layouts

Each widget stores `{x, y, w, h}` on a 12-column grid. The profile stores a base
layout plus orientation overrides, and the renderer maps it to CSS grid
placement; the wall reflows between portrait and landscape without a second
profile.

- **Rationale:** a fixed column model gives predictable placement and resize
  while remaining pure CSS, consistent with the Mantine-only constraint.
- **Alternative:** auto-flow columns (order only) — rejected; it cannot express
  the side-by-side compositions a wall needs and cannot resize a widget.

### D5. The editor is a form, not a drag canvas

Arrangement is done with an add-list plus row/column/span controls (a cell
picker), not drag-and-drop. This satisfies the "change placement without a drag
interaction" requirement, is keyboard-accessible, and adds no dependency.

- **Alternative:** `react-grid-layout` — rejected; it adds a runtime dependency
  the previous redesign explicitly ruled out, for an admin-only convenience.
- **Alternative:** hand-rolled pointer drag — rejected; a large, accessibility-
  fragile component to own indefinitely for no behavioural requirement.

### D6. A declarative widget registry, loaded as one lazy `wall` chunk

Widgets are described by a registry of type descriptors — id, label, default and
min/max dimensions, config schema, and a renderer. The wall grid shell and every
widget renderer load together in one lazy chunk, off first paint, alongside the
editor.

- **Rationale:** the wall is a device's landing surface, so it loads when opened,
  but it is never first paint; one chunk keeps request count and chunk
  bookkeeping low while keeping all of it out of the budget.
- **Alternative:** one lazy chunk per widget type — rejected; many small
  requests for little benefit at this scale.

### D7. Wall device widgets scale the existing tile by a size token

Device-control widgets reuse the existing tile ranking, optimistic override, and
coalescing logic, rendered through a size token that enlarges touch targets.
There is no second device presentation.

- **Rationale:** the spec forbids a device looking different in one collection
  than another, and the optimistic/revert behaviour is already specified and
  tested; only scale differs on a wall.
- **Alternative:** a dedicated wall tile — rejected; it recreates the split the
  spec disallows.

### D8. Scene buttons fire automations

A scene button stores an automation name and a label and calls the existing
manual-trigger path (`POST /api/automations/:name/trigger`). No scene model is
introduced.

- **Rationale:** automations already express multi-device intent with triggers
  and history; a scene concept would duplicate them.
- **Alternative:** a first-class scene subsystem — rejected for this change;
  deferred until a demonstrated need.

### D9. A typed `wall` event drives live profile updates

`WallManager` emits a `wall` event on create/update/delete, delivered through the
existing stream. An open wall re-renders on it; because profiles live in the
reserved namespace, no raw state event is emitted for the backing key.

- **Rationale:** mirrors the `room` event and the existing "reserved keys are not
  streamed" rule; reuses the stream the wall already holds open.
- **Alternative:** re-fetch on window focus — rejected; a wall on a desk may
  never regain focus, and the edit would appear stale for hours.

### D10. Profile configuration is validated at the boundary

A shared schema defines the profile and widget-config shapes and is validated by
the server on write; the editor reuses it for client-side validation. The profile
carries a `version` field so the shape can evolve.

- **Rationale:** the editor is not a trust boundary; persistence must reject a
  malformed config, and a version now avoids a migration later.
- **Alternative:** rely on the editor — rejected; the API is directly reachable.

### D11. Kiosk behaviour reuses existing resilience; the rest is host config

The wall relies on the data layer's existing reconnect-then-resnapshot and
bounded buffers; the clock is derived from the client clock and needs no
connection. Wake-lock, fullscreen manifest, and burn-in handling are explicitly
out of scope.

- **Rationale:** the resilience already exists and is exercised by every view;
  the remaining concerns are properties of the hosting tablet, not the app.

## Risks / Trade-offs

- **Full-bleed branch regresses other views** → the branch is isolated in
  `App.tsx` and covered by a test that the wall renders without chrome and
  ordinary views still render with it.
- **Reserved-namespace config is invisible/undiscoverable** → intended privacy,
  but a bug could orphan a profile; mitigated by dedicated CRUD routes and tests
  over create/read/rename/delete.
- **Budget regression from the wall feature** → wall grid, widgets, and editor
  are all in lazy chunks; no new runtime dependency; the build-time budget
  assertion guards the first paint.
- **Touch targets vs tile density** → a size token enlarges controls; the
  requirement sets a minimum, and the grid's min dimensions per widget type keep
  controls from being shrunk below usability.
- **Dual-layout (per-breakpoint) complexity** → start with a base layout plus
  orientation overrides rather than arbitrary breakpoint sets, and only add
  breakpoints if needed.
- **Kiosk loses its session on reboot** (session cookie is session-scoped,
  `web-ui-routes.ts:190`) → documented; a wall-specific long-lived token is a
  follow-up, not part of this change.
- **A wall with a sleeping screen is the most common real-world complaint** →
  explicitly deferred to host configuration; documented as a known limitation.

## Migration Plan

1. Add the shared profile contract and the `wall` event type. Additive.
2. Add `WallManager` and the `/api/walls` routes; wire into the engine. Additive;
   existing clients are unaffected.
3. Add the `wall` and `walls` client segments and the full-bleed branch. The wall
   is new and unreferenced by existing views, so existing navigation and views
   are unchanged.
4. Add the widget registry, grid renderer, widget renderers, and editor.
5. Update docs and add tests at each layer.

Rollback is reverting the release: no existing behaviour changes, the new routes
are inert, and any leftover `$internal:wall:` keys are harmless.

## Open Questions

- Whether a wall should eventually get a long-lived, revocable credential so a
  rebooted panel does not require re-login. Deferrable; the current session
  cookie works for a browser kept open.
- Whether wake-lock or a fullscreen manifest should be offered as an opt-in wall
  mode. Deferrable; out of scope here.
