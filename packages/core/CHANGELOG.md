# @ts-ha/core

## 0.4.0

### Minor Changes

- 7c06d1f: Persist last-known device state and send the current device set on every stream
  connect.
  
  - `@ts-ha/core`: a durable device state store holding every device's last-known
    state and the observation that produced it, keyed by qualified identifier —
    loaded before any source starts and written behind a debounced flush, so a
    descriptor reports last-known state from the first read after a restart
    instead of empty, and a live observation still supersedes it
  - `@ts-ha/core`: every device source records its observations into the store; a
    source that does not persist its own state (Shelly, Nanoleaf) seeds a
    descriptor's state from it when it has no fresher observation of its own,
    while a self-persisting source (Zigbee, state toggles) records for
    durability/pruning only — in both cases a descriptor reports last-known state
    from the first read after a restart, keeping enumeration, retrieval by
    identifier, and subscription delivery consistent; a restored record keeps its
    original observation time so a stale value reads as last-known rather than
    live, and records are pruned when a device drops out of enumeration but
    retained while its owning source is unavailable
  - `@ts-ha/core`: `GET /api/events` sends a per-connection initial device
    snapshot on connect — one `device_appeared` event per device carrying its full
    descriptor, from the total enumeration including hidden devices and matching
    `GET /api/device-catalog` — before any later device event, which stays an
    incremental delta
  - `@ts-ha/core`: the new `DeviceStateStore` / `DeviceStateStoreOptions` /
    `DeviceStateRecord` exports, `DEVICE_STATE_PERSIST` / `DEVICE_STATE_FILE` /
    `DEVICE_STATE_FLUSH_MS` config, and the `deviceState` engine option, with
    persistence enabled by default alongside the existing persistence defaults
  - `@ts-ha/web-ui`: the dashboard reconciles the stream's device snapshot into
    its device map by qualified identifier rather than replacing the map, so state
    from the read endpoints or an event is not lost, and refetches a device on a
    delta for an identifier it does not hold instead of dropping the event

## 0.3.1

### Patch Changes

- Updated dependencies [63816ad]
  - @ts-ha/shared@0.4.0

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

### Patch Changes

- Updated dependencies [548a704]
- Updated dependencies [62a39e2]
  - @ts-ha/shared@0.3.0

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

### Patch Changes

- Updated dependencies [dc4afe7]
  - @ts-ha/shared@0.2.0
