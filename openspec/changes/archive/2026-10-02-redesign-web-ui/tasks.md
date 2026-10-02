## 1. Configuration

- [x] 1.1 Add the `energy` section (`sampleIntervalMs`, `historyMinutes`) to the Zod schema in `packages/core/src/config.ts`, with `ENERGY_SAMPLE_MS`/`ENERGY_HISTORY_MINUTES` mappings and defaults; verify `bun run --filter @ts-ha/core test` config tests pass
- [x] 1.2 Add the `weather` section (`latitude`, `longitude`, `forecastDays`) with `WEATHER_LATITUDE`/`WEATHER_LONGITUDE`/`WEATHER_FORECAST_DAYS` mappings, range validation, and clamping; verify invalid coordinates fail startup with a descriptive error
- [x] 1.3 Document the new variables in `.env.example` and `docs/configuration.md`; verify the values match the schema defaults

## 2. Shared Contracts

- [x] 2.1 Add energy wire types to `@ts-ha/shared` (current power, cumulative total, per-device breakdown with availability, history samples) and export them from the barrel; verify `bun run typecheck` passes
- [x] 2.2 Add weather wire types (current conditions, forecast entry, unavailable marker) reusing the existing weather types; verify the web UI and CLI can import them
- [x] 2.3 Add the room batch-command response types (`applied | skipped | failed` per device); verify a unit test covers each outcome literal

## 3. Device Energy Telemetry

- [x] 3.1 Map Shelly cumulative active energy (`aenergy.total`, Wh) into the Shelly device state; verify a `shelly-capabilities`/source test shows the property present only for metering types
- [x] 3.2 Declare the read-only numeric `energy` capability with a `Wh` unit for metering devices; verify the device descriptor test asserts readable/non-writable and the unit
- [x] 3.3 Verify non-metering devices omit the energy property (no zero), covering the `device-sources` "Cumulative Energy Telemetry" scenarios

## 4. Energy Aggregator And Endpoint

- [x] 4.1 Implement `EnergyAggregator` in `packages/core/src` that samples the aggregate device source on the configured interval; verify a unit test advances a fake clock and asserts sample count and ordering
- [x] 4.2 Normalize each device's declared energy unit to watt-hours and sum power only across reachable devices; verify tests cover mixed units, missing readings, and an unreachable device reported unavailable
- [x] 4.3 Bound the ring by `historyMinutes / sampleIntervalMs` and support `historyMinutes: 0` (disabled, empty series); verify a test runs far beyond the window and asserts the cap
- [x] 4.4 Wire the aggregator into engine construction and register it so the HTTP server can read it; verify engine startup registers it and a shutdown test stops its timer
- [x] 4.5 Add `GET /api/energy` behind the existing `/api/*` auth middleware; verify endpoint tests for populated, empty (no metering), and unauthorized cases
- [x] 4.6 Verify the endpoint's response shape matches the shared energy types (breakdown, availability, history)

## 5. Room Batch Command Endpoint

- [x] 5.1 Add `POST /api/rooms/:id/command` that resolves a room's members and dispatches the command through `DeviceSource.command()`; verify an endpoint test applies it to capable members only
- [x] 5.2 Report `skipped` for members lacking the commanded property and `failed` for dispatch failures, without failing the whole request; verify tests for each outcome
- [x] 5.3 Return `404` for an unknown room, `400` for a malformed body, and `503` when no room manager is configured; verify the corresponding endpoint tests
- [x] 5.4 Verify the endpoint never bypasses per-source command validation (an invalid command for a member surfaces via the existing path)

## 6. Weather Endpoint

- [x] 6.1 Add `GET /api/weather` reading the registry's `weather` service, with the configured default location and a client override; verify a service-mock test returns current conditions and forecast
- [x] 6.2 Respond `404` when no weather service is registered and `400` when no location is resolvable; verify both tests
- [x] 6.3 Clamp requested forecast days to the configured maximum; verify a test requesting more days receives the clamp

## 7. Web UI Design System

- [x] 7.1 Subset the display face and add it under `packages/web-ui/src/app/`, referenced from CSS with a relative `url()`; verify `bun run --filter @ts-ha/web-ui build:web-ui` emits a hashed `.woff2`
- [x] 7.2 Extend `build-web-ui.ts`'s content-type mapping with `font/woff2` and mark the font asset `firstPaint`; verify the built manifest lists it and the budget test still passes
- [x] 7.3 Add a Mantine `createTheme` (Ambient Glass palette, radii, fonts, component defaults) in `index.tsx`; verify no view regresses to a default blue accent
- [x] 7.4 Add the token stylesheet (elevation, hairlines, glass tints, semantic state colors) and wire it into the app entry; verify tokens are the only color source in views
- [x] 7.5 Implement reduced-motion-aware enter/toggle transitions using CSS/Mantine primitives only; verify no layout shift and no motion under `prefers-reduced-motion`
- [x] 7.6 Verify both schemes independently for text contrast and non-color state encoding (icon/label alongside color)

## 8. Navigation, Overview, And Favorites

- [x] 8.1 Add a favorites data helper over the ordinary state key, with optimistic write and stream reconciliation; verify a unit test covers add/remove and a remote update
- [x] 8.2 Add a favorites navigation group rendered when favorites exist; verify it is distinct from rooms and deep-links correctly
- [x] 8.3 Broaden active-state matching so a detail route keeps its collection entry active; verify device-detail and automation-detail highlight their parent
- [x] 8.4 Build the Overview view composing the summary metrics, favorites, and room zones from store data; verify metrics update live from a streamed device event
- [x] 8.5 Make the Overview the landing route and keep the previous grid reachable per the revised IA; verify reloading the base path shows the Overview
- [x] 8.6 Verify an empty home renders the explanatory empty state, not empty zones
- [x] 8.7 Confirm the narrow-viewport bottom bar remains control-only and operator views remain reachable by URL (no operator promotion)

## 9. Device Tile Redesign

- [x] 9.1 Redesign `DeviceTile` with a dominant primary action/readout and an explicit open-detail affordance; verify clicking the embedded control does not open the detail
- [x] 9.2 Encode on/off and reachability with a non-color channel; verify a readability check with color removed still distinguishes states
- [x] 9.3 Preserve the unavailable variant, group marker, and observation mode/age presentation through the new visuals; verify the room view's unavailable and group members still render distinctly
- [x] 9.4 Add the favorite toggle to the tile's action slot without crowding the name; verify long names still truncate and controls remain reachable

## 10. Room-Level Control UI

- [x] 10.1 Add an "all on / all off" action to the room view backed by the batch endpoint; verify a single request is issued and members are commanded
- [x] 10.2 Apply the room command optimistically per member via the app-wide coalescer and reconcile reported state; verify a failed member reverts and surfaces its error while others remain commanded
- [x] 10.3 Surface skipped members distinctly from failures; verify a room of sensors reports them skipped

## 11. Energy And Weather Views

- [x] 11.1 Add the lazy Energy view (current power, cumulative total, per-device breakdown, trend) rendered with an SVG sparkline; verify it is only fetched when opened and the budget excludes it
- [x] 11.2 Verify the Energy view updates live from the stream and works with history disabled and with no metering devices
- [x] 11.3 Add the lazy Weather view (current conditions and forecast) and an explicit unconfigured state; verify no weather service renders "unconfigured" rather than an error
- [x] 11.4 Register energy and weather navigation entries in the operator group; verify both are deep-linkable and update from the stream

## 12. Brand, Docs, And Verification

- [x] 12.1 Retint the PWA manifest theme color and the login shell accent to the Ambient Glass accent; verify the manifest and icon still serve (brand name unchanged)
- [x] 12.2 Update `docs/http/web-ui.md`, `docs/api-reference.md`, and `.env.example` for the new views, endpoints, and variables; verify each documented route matches the implementation
- [x] 12.3 Run `bun run typecheck && bun run check && bun run test`; verify the first-paint budget assertion passes with the font and theme included
- [ ] 12.4 Verify the full dashboard on a narrow viewport and wide viewport, in both schemes, with reduced motion enabled, and with no internet access
