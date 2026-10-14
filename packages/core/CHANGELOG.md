# @ts-ha/core

## 0.5.1

### Patch Changes

- Updated dependencies [d9d2f64]
  - @ts-ha/shared@0.6.0

## 0.5.0

### Minor Changes

- 1293ec4: Redesign the wall display on **Hearth** and add a temperature widget and cover
  transport.
  
  - `@ts-ha/shared`: `temperature` joins `WALL_WIDGET_TYPES` with a
    `WallTemperatureWidgetConfig` (`{ qualifiedId, title? }`) and its entry in
    `WALL_WIDGET_CONFIG_SCHEMAS`, so the server's write validation and the editor
    resolve the new widget from the same definition. Additive: no existing contract
    changes and `WALL_PROFILE_VERSION` stays 1
  - `@ts-ha/core`: a Shelly cover declares a writable transport action
    (`action: open | close | stop`) beside its writable `position`, and
    `ShellySource.command()` dispatches each declared value to
    `ShellyService.coverOpen` / `coverClose` / `coverStop`
    (`Cover.Open` / `Cover.Close` / `Cover.Stop`), so a shutter's stop is reachable
    through the source-neutral capability vocabulary rather than a source-specific
    code path
  - `@ts-ha/web-ui`: the full-bleed wall moves onto **Hearth**, its own visual
    language in `wall/hearth.css` — a true-black dark scheme and a designed (not
    inverted) light scheme, wall-owned colour, typography, spacing, radius,
    elevation, and motion tokens that never alias the dashboard's Lumen tokens; a
    distance type ramp that re-derives the wall's body floor (18 px); and kiosk-class
    56 px touch targets with ≥ 8 px separation between adjacent controls
  - `@ts-ha/web-ui`: the wall's widgets are redesigned onto one shared card
    vocabulary (glyph, title, metric, affordance) rather than re-skinned — the light
    card gains a distinct device-icon on/off affordance, a full-width brightness bar,
    an off-state that turns the light on, and colour-temperature/colour controls
    offered only where the device declares them; the sensor readout, scene tile, and
    the rest follow the same vocabulary, and a new temperature widget reads a
    configured sensor
  - `@ts-ha/web-ui`: a cover that declares a writable transport action is recognised
    as a cover even without a writable position, and its transport presents
    up/down/stop using the declared action (falling back to the position extremes),
    with Stop omitted for a cover that cannot express it; the dashboard's
    presentation is unchanged
  - `@ts-ha/web-ui`: Hearth ships as its own content-hashed stylesheet, imported only
    by the wall surface and excluded from the dashboard's first-paint budget, and the
    wall editor stays on Lumen

### Patch Changes

- a2ac4ae: Dispatch an accepted boolean command in the capability's declared on/off
  encoding.
  
  The two Zigbee sources translate an accepted real boolean into the target
  capability's declared `valueOn`/`valueOff` before dispatch, through the shared
  `composeBooleanCapabilityValue` rule. A real boolean sent to a string-encoded
  device (a Zigbee2MQTT lamp declaring `"ON"`/`"OFF"`) is no longer published
  verbatim and silently ignored; a value already in the declared encoding is
  unchanged, and a source whose declared encoding is already a real boolean
  (`true`/`false` — Shelly, Nanoleaf, state toggles) is byte-for-byte unchanged. A
  real boolean stays accepted, so existing callers — HomeKit, automations, the
  API, the CLI — keep working.
- Updated dependencies [1293ec4]
  - @ts-ha/shared@0.5.0

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
