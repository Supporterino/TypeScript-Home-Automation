## Context

See `proposal.md` for motivation. This change spans three packages and reaches
both the frontend rendering layer and the engine's HTTP surface. Constraints
that shape the approach:

- The first-paint budget is **250 KB transferred (gzip)**, asserted at build
  time against the generated asset manifest (`design.md` D24/D26 of the archived
  rebuild). Anything added to first paint is a budget decision.
- The dashboard is reached over **plain HTTP on a local network**, often with no
  internet access. Third-party font/asset origins are not acceptable.
- The frontend is compiled by `Bun.build` into content-hashed, pre-compressed,
  code-split modules embedded in `@ts-ha/web-ui` and served from
  `{basePath}/assets/:fileName` with immutable caching.
- `HttpServer` receives its collaborators through setters
  (`setDeviceSources`, `setRoomManager`, …) and mounts service routes via
  `mountServiceRoutes(serviceRegistry)`; it does not import the engine.
- The device command path validates inside `DeviceSource.command()`, so every
  dispatch path shares one validation rule. A batch endpoint must not bypass it.
- `WeatherService` takes a location per call; there is no engine-level weather
  configuration today, and no API route exposes the service.
- Shelly device state already carries `power`/`voltage`/`current`
  (`shelly-capabilities.ts`); cumulative energy counters are not exposed to the
  device-source layer.

## Goals / Non-Goals

**Goals:**

- A single, centrally-defined Ambient Glass visual system with designed dark and
  light schemes, adopted by every view.
- An overview landing that summarizes live state and exposes favorites.
- Room-level commands with honest per-device outcomes.
- Energy and weather surfaces backed by real endpoints.
- Keep the existing behavioral contracts (tile ranking, optimistic reconcile,
  per-view error isolation, snapshot-then-stream, offline operation) intact.

**Non-Goals:**

- Scene definitions or macros (deferred; not in this change).
- Persisting energy history across engine restarts.
- Promoting operator views into narrow-viewport navigation.
- Rebranding away from `ts-ha`.
- Adding a frontend runtime dependency for animation or styling beyond Mantine.

## Decisions

### D1. Design system as a Mantine theme plus a token layer

Implement Ambient Glass with Mantine v9's `createTheme` (colors, fonts, radii,
component defaults) plus a small global stylesheet that defines CSS custom
properties for tokens not covered by the theme (elevation, hairline borders,
glass tints). Views consume tokens via Mantine props and CSS variables; no view
hard-codes a hex value.

- **Alternative:** swap to Tailwind/shadcn — rejected; it contradicts the
  existing Technology Stack requirement, adds a build dependency, and risks the
  budget for no behavioral gain.
- **Alternative:** raw CSS variables without a Mantine theme — rejected; it
  leaves Mantine components on default styling and produces two systems.

### D2. Translucency only on chrome, solid surfaces for tiles

Backdrop blur is applied to the header, navigation rail, and overlays; device
tiles and content cards use opaque `surface` with a 1px hairline border and a
soft shadow. Blurring dozens of tiles is a GPU and contrast tax with no
legibility benefit.

- **Alternative:** fully glass cards — rejected on performance and WCAG
  contrast grounds, especially on low-end wall tablets.

### D3. Typeface emitted as a content-hashed font asset

The display face (a subset build of Plus Jakarta Sans, weights 500/700) is
referenced from CSS with a relative `url()` and compiled with a `file` loader,
so `Bun.build` emits it as a content-hashed `.woff2`. The CSS url then resolves
to `{basePath}/assets/<hash>.woff2`, which the existing asset route already
serves. `build-web-ui.ts`'s content-type mapping gains a `font/woff2` case and
marks the asset `firstPaint`.

- **Alternative:** inline the font as a base64 data URL in CSS — rejected;
  base64 adds ~33% that gzip cannot recover on already-compressed woff2.
- **Alternative:** system font only — viable fallback, but loses the intended
  identity; the subset cost (~15–25 KB) is affordable within the budget.
- The font is subset to the glyphs the UI uses and self-hosted; no third-party
  origin is contacted.

### D4. Overview is a derived client view, not a new endpoint

The summary metrics are computed in the web UI from data the store already
holds (device descriptors, rooms, status). No overview endpoint is added.

- **Rationale:** the store is already a complete live snapshot; a server endpoint
  would duplicate derivation and add a round trip for data the client must have
  anyway to render tiles.
- **Alternative:** a server-side `GET /api/overview` — rejected as
  indirection; it would not reduce client work, since tiles need the full
  descriptors regardless.

### D5. Room batch command is best-effort and reports per-device outcomes

Add `POST /api/rooms/:id/command`. The handler resolves the room's members,
skips members whose declared capabilities do not permit the requested property,
dispatches the remainder through the existing `DeviceSource.command()` path, and
returns an array of `{ qualifiedId, outcome }` where outcome is one of
`applied | skipped | failed`. It never claims atomicity.

- **Rationale:** MQTT and HTTP transports cannot make a multi-device command
  transactional; a false atomicity promise would be worse than none.
- **Alternative:** N client-side requests (today's only option) — rejected
  because it couples the engine's room membership to the client and multiplies
  round trips.
- The UI applies the command optimistically per member through the existing
  app-wide coalescer and reconciles each member against reported state, reverting
  a failed member and surfacing it.

### D6. Energy aggregation lives in a core service, sampling device sources

Introduce an `EnergyAggregator` that, on `energy.sampleIntervalMs`, reads the
aggregate device source, computes the home's instantaneous power total, and
appends a timestamped sample to a bounded ring sized by
`historyMinutes / sampleIntervalMs`. `GET /api/energy` returns the current
totals, the per-device breakdown, device availability, and the ring as history.

- **Rationale:** cumulative energy counters are monotonic totals, not a time
  series; a bounded sampled ring is the smallest model that yields a trend
  without introducing a persistence layer.
- **Alternative:** persist history to disk / a time-series store — rejected for
  this change; the spec marks restart survival out of scope.
- **Alternative:** compute server-side per request from live descriptors —
  rejected; it cannot produce a trend.

### D7. Canonical energy unit is watt-hours; sources declare their own unit

The device-source vocabulary gains an `energy` numeric, read-only property with
a declared unit. The `ShellyDeviceSource` maps the switch status's cumulative
active energy (`aenergy.total`, Wh) into it. The aggregator normalizes every
contribution to watt-hours before summing, and the UI converts to a
human-friendly unit (kWh) for display.

- **Rationale:** normalizing at the aggregation boundary keeps the device
  descriptors truthful to their source while making totals comparable, which the
  spec requires.
- **Alternative:** require every source to publish kWh — rejected; it forces
  lossy conversion at the source and discards the precision small loads need.

### D8. Weather endpoint resolves location from config with a query override

Add `GET /api/weather`, backed by a new `weather` config section
(`WEATHER_LATITUDE`, `WEATHER_LONGITUDE`, `WEATHER_FORECAST_DAYS`). The handler
uses the configured location by default and accepts a location override. When
no weather service is registered it responds `404`; when neither a default nor
an override location exists it responds `400`. Forecast days are clamped to a
small maximum.

- **Rationale:** the service interface is location-per-call; a default location
  is the least surprising way to expose it to a UI that has nowhere else to get
  coordinates.
- **Alternative:** require the web UI to own the coordinates — rejected; it
  makes the endpoint unusable headlessly and duplicates config.

### D9. Favorites persist as an ordinary state key

Favorites are stored under a single ordinary state key holding a JSON array of
qualified identifiers. The UI subscribes to state events and reflects changes
across clients.

- **Rationale:** state is already the cross-client, persisted, streamed store;
  adding a parallel favorites API would be a new subsystem for one list.
- **Trade-off:** the key is visible and editable in the State view. This is
  accepted; hiding it would require extending the reserved internal namespace,
  which is a separate decision.
- **Alternative:** `localStorage` — rejected; it does not sync across clients,
  which the spec requires.

### D10. Navigation adds a favorites group and correct parent active-state

The control group gains a favorites entry when favorites exist; the operator
group is unchanged. Active-state matching is broadened so an item's detail route
keeps its collection entry active. The narrow-viewport bottom bar remains
control-only (home/rooms/devices); operator views stay URL-reachable.

- **Rationale:** the existing responsive requirement already guarantees URL
  reachability; no spec change is needed there, and the "phone is a control
  surface" discipline is preserved.
- **Alternative:** an operator overflow tab on phones — rejected; it would
  require revising the responsive navigation requirement and dilutes the
  control-surface model.

### D11. Motion is CSS/Mantine transitions, reduced-motion aware

Enter/stagger and toggle feedback use Mantine's transition primitives and CSS.
No GSAP or animation library is added.

- **Rationale:** animation libraries are first-paint weight and a new
  dependency for effects achievable with CSS; the budget is a hard constraint.

### D12. New views are lazy; the overview and theme are first paint

Overview, tiles, navigation, theme, and font are first paint. Energy and weather
views, and any chart rendering, load behind the existing `React.lazy()` split so
they do not count against the budget. A minimal chart is hand-rendered (SVG)
rather than adding a charting library.

- **Rationale:** preserves the budget ratchet while allowing a trend line.

### D13. Brand and PWA identity stay `ts-ha`, retinted

The name is unchanged. The PWA manifest theme color and the login shell accent
are updated to the Ambient Glass accent so the identity is coherent.

## Risks / Trade-offs

- **Budget regression from theme + font** → the budget assertion runs at build
  time; the font is subset and everything non-first-paint is lazy; a build
  exceeding 250 KB fails.
- **Blur performance / contrast on low-end displays** → blur limited to chrome;
  tiles opaque; light/dark contrast verified independently.
- **Batch command partial failure is user-visible** → per-device outcomes drive
  per-member optimistic reconciliation; failures revert and surface, matching the
  single-device behavior.
- **Energy totals drift or mislead when a metering device is offline** →
  unreachable devices are reported unavailable, never counted as zero.
- **Favorites key appears in the State view** → documented and accepted; a user
  editing it changes favorites, which is the same effect as the UI action.
- **New `/api/*` surface** → all new routes sit behind the existing `/api/*`
  auth middleware; the weather/energy reads carry no instance secrets beyond what
  `/api/device-catalog` already returns.
- **Energy unit divergence across sources** → a single aggregation-boundary
  normalizer to Wh, with a test per declared unit.
- **Font build-pipeline change** → the `font/woff2` content type and
  `firstPaint` flag are covered by the existing asset and budget tests.

## Migration Plan

1. Add the `energy` and `weather` config sections and env vars with defaults; no
   existing values change.
2. Add the energy/weather/batch endpoints. Additive; existing clients are
   unaffected.
3. Expose cumulative energy from the Shelly source. Additive capability; devices
   without metering are unchanged.
4. Retheme the web UI and switch the landing view to the overview. This is the
   breaking UI change; it ships as one release. Rollback is reverting the
   release — the API additions are inert and the favorites state key is harmless
   if left behind.
5. Update docs and `.env.example`.

## Open Questions

- Whether favorites should eventually move into the reserved internal namespace
  so they are hidden from the State view. Deferrable; the current behavior is
  specified and acceptable.
- Whether a chart beyond a simple trend line (e.g. per-room energy
  attribution) is worth a dedicated lazy chunk. Deferrable; not required by the
  specs.
