# @ts-ha/core

## 0.7.0

### Minor Changes

- 3e8b7a2: Refine four wall-panel behaviours: a one-row scene tile, windowed energy usage in
  place of the lifetime total, a temperature label that identifies its sensor's room,
  and device-card actions rows that use their card's width.
  
  **`@ts-ha/shared` — `EnergyData` gains a windowed usage reading.** Three optional flat
  fields: `usageWh` (the home's usage over the rolling window, in watt-hours),
  `windowMinutes` (the window's length — `ENERGY_HISTORY_MINUTES`), and
  `coveredMinutes` (the extent the retained samples actually cover, never above
  `windowMinutes`). `usageWh` is the sum, across the devices that report a cumulative
  reading at **both** ends of the retained span, of each device's change; it is absent
  rather than zero when there is no baseline or no device contributes at both ends, so a
  client presents usage as absent instead of as a false zero. The addition is additive —
  an older client simply ignores the fields — but it is **labelled breaking**: it
  changes what the energy widget presents.
  
  **`@ts-ha/core` — the aggregator retains per-device cumulative samples.**
  `EnergyAggregator` keeps a second bounded ring of every reachable device's
  cumulative-energy reading alongside the power ring, and `snapshot()` derives the
  windowed usage, its window, and its coverage from it. A device that is unreachable or
  declares no cumulative reading is absent from the ring rather than recorded as zero,
  so a device that **becomes unreachable mid-window** leaves the window instead of
  subtracting its consumption from it. The window and coverage are reported whenever
  history is enabled; the usage is absent when nothing has been covered.
  
  **`@ts-ha/web-ui` — the wall shows recent usage, identifies a sensor's room, and fills
  its actions rows.** The energy widget presents the windowed usage in place of the
  cumulative lifetime total, labelled with the span the retained samples cover (`last
  24h`, or `last 6h` when partial), and draws the reading as absent when nothing is
  covered. The temperature widget labels its sensor by the device's room where the store
  assigns it one, else by the shortened device name, so identically-named sensors read
  as their rooms. A scene's minimum span drops to `2 × 1`: a one-row scene renders
  chrome-less, so the whole cell is its touch target rather than a tile inset below it,
  and the framed glyph-and-label tile returns at two rows or more. Every typed card's
  actions row uses its card's width — a row of fixed controls distributes across it, and
  a row containing a slider keeps the slider flexible and centres the fixed controls —
  with the ported control height and radius unchanged.
  
  The dashboard's device tile and its own energy view (Current power / Cumulative /
  Metering devices) are unchanged, as are the wall profile shape and version, the scene
  trigger contract, the energy window as a configuration value, energy-history
  persistence, and every other wall widget; `@ts-ha/cli` is untouched.

### Patch Changes

- e7f5a0b: Internal cleanup with no public API or behaviour change.
  
  **`@ts-ha/core`** — the superseded per-family HomeKit factories
  (`homekit-shelly-factory.ts`, `homekit-state-factory.ts`, and the dead
  `createAccessory` path in `homekit-accessory-factory.ts`) are deleted; the live
  `createAccessoryFromDescriptor` and its frozen UUID seeds are unchanged.
  `StateManager` and `DeviceStateStore` now share the JSON-file persistence
  primitives (`state/json-persistence.ts`); log output is unchanged.
  
  **`@ts-ha/web-ui`** — unused API wrappers and `ui/` barrel re-exports and stale
  `eslint-disable` comments are removed; the shared text-input treatment moves to
  `ui/input-classes.ts`; `app/utils/` folds into `app/lib/`. No rendered output or
  asset change.
  
  **`@ts-ha/cli`** — module-local-only symbols lose their `export` (the CLI's
  public surface is unchanged), and `levelName` / `parseCommandValue` gain a
  single definition.
  
  **All packages** — source and test comments are shortened to a short
  description of what each declaration does, dropping internal design/task/spec
  references and long rationale. Comment-only: no code, type, or emitted value
  changes (comments are still emitted into `dist`, so the published files change
  textually but no consumer behaviour does).
- Updated dependencies [3e8b7a2]
- Updated dependencies [e7f5a0b]
  - @ts-ha/shared@0.8.0

## 0.6.0

### Minor Changes

- 2bb0b82: Replace the wall's single generic device card with one typed card per device class,
  ported from `piitaya/lovelace-mushroom` (Apache-2.0; attributed in
  `THIRD_PARTY_NOTICES.md`), and re-derive the wall's card metrics from it.
  
  **`@ts-ha/shared` — the wall contract is per device class, at version 2.**
  `WALL_WIDGET_TYPES` gains `light`, `cover`, `fan`, `climate`, `lock`, `number`,
  `select`, and `entity` in place of the single `device` type, each bound to one device
  and carrying the shared typed device config (`qualifiedId`, `layout`,
  `collapsible_controls`). `WALL_PROFILE_VERSION` becomes `2`: the schema validates a
  version-2 profile on write and still parses a stored version-1 profile, whose shape
  it also exports for the migration.
  
  **`@ts-ha/core` — no saved wall is lost.** A stored version-1 profile is migrated on
  load rather than rejected: a widget that named one device becomes that device's typed
  widget at the same placement and zone, and a widget that named a set of devices keeps
  its selection. A profile that cannot be migrated is reported without preventing the
  wall's other profiles from loading. Rolling back needs the previous revision of the
  state file, since an older build rejects a version-2 profile.
  
  **`@ts-ha/web-ui` — typed wall cards at the ported metrics.** The wall's device
  widgets are the typed catalogue; `lib/card-archetype.ts` and the wall's use of the
  shared device tile retire (the dashboard's tile keeps its own rendering), and each
  card is re-implemented in React from Mushroom's anatomy. The cards draw the ported
  token table declared in `wall/hearth.css` — a 36 px circular icon with a 24 px glyph,
  14 px/500 primary over 12 px/400 secondary type, a 42 px control height at a 12 px
  radius, 10 px card padding and 12 px card radius, 12 px control spacing, and a 42 px
  slider with a 10 px bar thumb — which **lowers the wall's former 56 px touch target
  and 18 px device-card floor**. The row unit, paging density, and the editor's span
  floors are re-derived from the smaller card (`ROW_UNIT_MIN` 50, `ROW_UNIT_MAX` 56),
  and a paged tile row is now bounded at 1.25× its cell with the leftover space centred
  rather than distributed into the tiles.
  
  The dashboard's rendering, the dependency direction, and every other wall widget are
  unchanged.

### Patch Changes

- Updated dependencies [2bb0b82]
  - @ts-ha/shared@0.7.0

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
