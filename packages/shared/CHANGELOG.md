# @ts-ha/shared

## 0.4.0

### Minor Changes

- 63816ad: Bring the CLI up to the redesigned engine: the unified device catalog, rooms,
  energy, weather, wall administration, automation history/relationships, and a
  live stream-backed dashboard.
  
  - `@ts-ha/shared`: **breaking removal** of the legacy Zigbee-only wire DTOs
    `SerializedDevice`, `DeviceInfo`, and `AutomationInfo` — they had no consumer
    once the CLI stopped addressing the removed `/api/devices` endpoints
    (pre-1.0; the CLI now consumes `DeviceDescriptor`, `Automation`, and the
    capability vocabulary)
  - `@ts-ha/cli`: migrates `DebugClient` and the dashboard to
    `/api/device-catalog` (addressed by `qualifiedId`, with a case-insensitive
    display-name fallback), adds device/room control, `automations
    history|relationships`, `energy`, `weather`, and `walls` administration, and
    replaces interval-only polling with a snapshot-plus-stream model over
    `GET /api/events` (re-snapshotting on `fell_behind`)

## 0.3.0

### Minor Changes

- 548a704: Enumerate multi-channel Shelly devices as one logical device per switch/cover
  component.
  
  - `@ts-ha/shared`: wire contracts for the Shelly component inventory
    (`ShellyComponentKind`, `ShellyComponentStatus`, `ShellyComponentsStatus`,
    `ShellyDiscoveredComponent`)
  - `@ts-ha/core`: component discovery via paged `Shelly.GetComponents`, fanning a
    multi-channel device out into one channel-scoped descriptor per switch/cover
    component with per-component metering, and MQTT-first startup so discovery can
    reach a live client
- 62a39e2: Add named wall displays: full-bleed, profile-addressed panels for wall-mounted
  tablets.
  
  - `@ts-ha/shared`: wall-profile contracts (`WallProfile`, `WallWidget`,
    `WallProfileConfig`, `WallChangeKind`), a bounds-checked Zod schema exposed as
    the `wall-schema` subpath, the typed `wall` stream event, and `zod` as its
    first — pure, browser-safe — runtime dependency
  - `@ts-ha/core`: `WallManager` persisting profiles under `$internal:wall:<name>`
    with create/list/read/update/delete, schema validation, `wall` event emission
    (never a raw state event), and `GET/POST/PUT/DELETE /api/walls[/:name]` behind
    the existing `/api/*` auth
  - `@ts-ha/web-ui`: a full-bleed `/wall/:name` surface and a `/walls` editor — a
    12-column widget grid, a widget catalog (clock, weather, energy, room,
    favorites, device, status, scene), a scaled device tile, and live re-render on
    the `wall` event, all in one lazy chunk off first paint

## 0.2.0

### Minor Changes

- dc4afe7: Redesign the dashboard around the Ambient Glass design system and add energy and
  weather surfaces.
  
  - `@ts-ha/web-ui`: designed dark-first Mantine theme, self-hosted display face,
    Overview landing with favorites and per-room zones, redesigned device tiles,
    room-level all-on/all-off control, and lazy Energy and Weather views
  - `@ts-ha/core`: atomic room batch-command endpoint, `GET /api/energy` and
    `GET /api/weather`, a configurable energy sampler with a bounded rolling
    window, and Shelly cumulative-energy telemetry
  - `@ts-ha/shared`: wire contracts for energy aggregation, room commands, and
    weather payloads
