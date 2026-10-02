## Why

The web UI is functionally complete but visually and experientially stock: it
runs on unmodified Mantine defaults (accent `#228be6`, system type, no theme),
its landing view is a vertical stack of room grids with no at-a-glance status,
and it offers no room-level control — the single most expected action in a home
appliance. It reads as an internal tool rather than a control surface for a
home. At the same time, three capabilities that a control surface should have —
whole-room commands, an energy view, and weather — are absent from both the UI
and the API. This change gives the dashboard an identity ("Ambient Glass"), a
control-surface information architecture, and the backend endpoints those
surfaces need, in one coherent move rather than a reskin followed by a separate
feature project.

## What Changes

- **Ambient Glass visual system**: a designed dark-first Mantine theme (deep
  slate surfaces, status-green "on", soft hairline elevation), a self-hosted
  subset display face, and reduced-motion-aware transitions. Light mode is
  designed, not an inversion. Brand remains `ts-ha`.
- **Overview landing**: the dashboard opens on an at-a-glance surface — summary
  metrics derived from device state (lights on, unreachable, stale, active
  motion), user favorites, and per-room zones — rather than a raw grid stack.
- **Room-level control**: an "all on / all off" action per room, backed by a new
  **atomic-per-room batch command endpoint** so a room command is one request,
  not N.
- **Device tile redesign**: one primary verb, state encoded by color **and** icon
  **and** label, an explicit detail affordance, and visibility controls that do
  not crowd the name.
- **New views**: an energy view (instantaneous power, cumulative consumption,
  per-device breakdown, rolling recent trend) and a weather view (current
  conditions and forecast, or an explicit "not configured" state).
- **Backend endpoints**: a room batch-command endpoint, `GET /api/weather`, and
  `GET /api/energy`.
- **Energy telemetry**: Shelly cumulative energy counters are exposed as a
  source-neutral capability/state property alongside the existing instantaneous
  `power`.
- **Energy history**: the engine samples and retains a bounded rolling energy
  series, with its window and interval configurable; history is in-memory.
- **Navigation refinement**: the control/operator split is retained, a session
  favorites group is added, active states follow detail routes, and operator
  views stay reachable by URL on narrow viewports (control-only bottom bar is
  kept — no operator promotion).
- **Favorites** are persisted as a cross-client ordinary state key.
- **BREAKING**: the dashboard's landing route renders a new Overview view rather
  than the old room-grid dashboard; the previous dashboard presentation is
  replaced, not retained behind a flag.
- **BREAKING**: a `.woff2` font asset joins the build output; the build script
  must classify and budget a font asset type it does not currently handle.

## Capabilities

### New Capabilities

- `energy-monitoring`: aggregation of instantaneous power and cumulative energy
  across device sources, its HTTP read contract including a bounded rolling
  history, and the dashboard's energy surface.

### Modified Capabilities

- `web-ui`: Ambient Glass design system (theme, type, tokens, motion), overview
  landing, device-tile redesign, navigation refinement with favorites and
  URL-reachable operator views, room-level control, favorites persistence,
  weather and energy views, and the self-hosted font asset pipeline.
- `http-server`: room batch-command endpoint; `GET /api/weather`; `GET /api/energy`.
- `device-sources`: expose cumulative energy counters from Shelly alongside the
  existing instantaneous power telemetry.
- `weather-services`: expose current conditions and forecast through the HTTP API
  when a weather service is registered.
- `configuration`: schema and environment variables for the energy sampling
  interval and history window, and for the default weather location and
  forecast horizon.

## Impact

- **`@ts-ha/web-ui`**: theme/token layer, all views, navigation, tiles, and the
  asset build script (`packages/web-ui/scripts/build-web-ui.ts`) gain a font
  asset type and a self-hosted face. First-paint budget (250 KB gzip) is
  re-measured against the added type.
- **`@ts-ha/core`**: `HttpServer` gains room batch-command, weather, and energy
  routes; an energy aggregator (sampler + bounded ring) is introduced;
  `ShellyDeviceSource`/`shelly-capabilities` expose cumulative energy.
- **`@ts-ha/shared`**: new wire contracts for energy and weather payloads, and a
  capability/state convention for cumulative energy.
- **`@ts-ha/cli`**: unaffected, but the energy/weather API contracts are shared
  wire types.
- **Docs**: `docs/http/web-ui.md`, `docs/api-reference.md`, `docs/configuration.md`
  and `.env.example` gain the energy/weather endpoints and env vars.
- **Tests**: budget assertion re-run; new endpoint, aggregator, and capability
  tests; web-ui typecheck includes the revised app.
- No new runtime dependency is required for the frontend; the design system is
  built on Mantine's theming and CSS.
