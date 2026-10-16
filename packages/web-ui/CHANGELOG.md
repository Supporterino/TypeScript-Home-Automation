# @ts-ha/web-ui

## 0.11.0

### Minor Changes

- 7c99c17: Let a `link` and a control-less device widget sit on a single wall row.
  
  A `link` and a typed device widget whose bound device's card draws **no control of
  its own** are now authorable at one grid row, beside the one-row scene the wall
  already draws. The link's minimum drops to `2 × 1` and a read-only device's effective
  minimum to `3 × 1`, so a dense row can carry a route and a read-only reading where it
  previously forced two rows.
  
  **The one-row rule is declared once.** Each widget type declares its slim behaviour in
  the registry descriptor as `slim?: { min, when: "always" | "read-only" }`; the frame's
  surface decision and the effective-minimum resolver both read that one declaration,
  replacing the scene-specific branch. At one row the frame draws no surface and the
  link draws a **flush** route — no border, no raised background, no inset — so the
  whole cell is the link's touch target, at or above the wall's 42 px floor; at two rows
  or more the framed labelled route returns.
  
  **The minimum is device-aware.** A widget whose bound device's card draws no control
  of its own — an `entity`, or a device whose only writable state is its on/off toggle
  — is authorable at one row and composes a shared **slim** card form: a single inline
  line, whole-cell actuation where the primary action is a toggle, and no observation
  indicator. A widget whose card draws a control keeps its two-row minimum. The
  same resolver drives the editor's placement clamp and the save validation, so
  authoring and validation agree, and a hand-authored sub-minimum cell still renders the
  wall's contained explanation rather than a clipped card.
  
  This is not a wire or profile change: `WALL_PROFILE_VERSION` and the profile config
  shape are untouched — a one-row link or read-only device is newly *authorable*, not
  newly *loadable*. `@ts-ha/shared` and `@ts-ha/core` are unchanged.

## 0.10.0

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

## 0.9.0

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
- 76f076d: Give the wall one card vocabulary, and present a temperature sensor's humidity.
  
  The wall carried two card vocabularies: the ported Mushroom anatomy for device
  cards, and `wall/widgets/card-vocab.tsx` — a bare glyph, an 18 px uppercase label,
  and pill affordances — for every other widget, the frame, the zone band and the
  panel chrome. `card-vocab.tsx` retires: every widget, the widget frame, the zone
  band and the panel's own explanations are now composed from the ported anatomy
  (`wall/cards/card-anatomy.tsx`) and its token table, so a panel reads as one
  designed whole.
  
  **Two guarantees move with it.** The wall's type ramp gives up its **18 px** body
  floor for the ported card system's secondary size (**12 px**) and its label tier for
  the ported primary size (**14 px**), and the compact status-chip exception retires
  with its `--hearth-text-chip` token, because nothing is left below the floor to
  except. The frame's inset follows the ported card surface's own padding
  (**16 → 10 px**), which re-derives the frame and page reservations, the page plans,
  the fit verdict, the editor's reported floors and page counts, and the harness
  fixtures. The readout tiers are untouched, so a readout's value keeps the wall's
  distance scale and what is read across a room is unchanged; the harness at
  1920 × 1080 is the check on the smaller supporting text.
  
  **The temperature widget presents its sensor's humidity** where the bound device
  declares a reading, as the widget's secondary reading — one value with its own unit,
  never split. The reading is the device's own capability, so there is no new config
  field, no editor field and no profile version: the profile shape is unchanged, a
  sensor that declares no humidity renders exactly as before, and `@ts-ha/shared`
  and `@ts-ha/core` are untouched.
  
  **The weather widget composes for the box it is given.** Leading with the ported
  condition affordance makes its stacked layout taller than its 3 × 3 minimum-span
  cell, so the widget draws what the box holds — the condition, temperature, humidity
  and wind always render, and the forecast appears from the span that holds it. Its
  declared minimum span is unchanged.

### Patch Changes

- e311100: Change the shipped frontend assets with no exported API change.
  
  The dashboard's data layer gains an explicit fixture seam, and the wall's weather
  and energy widgets prefer a caller-supplied reading over their own fetch, so the
  assets compiled into the package by `prepublishOnly` change. The development-only
  wall render harness under `wall/harness/**` is not an entrypoint of the shipped
  build and contributes no asset.
- Updated dependencies [2bb0b82]
  - @ts-ha/shared@0.7.0

## 0.8.0

### Minor Changes

- d9d2f64: Give the wall zones, span-aware cards, cross-wall navigation, and a fit rule
  that never exceeds the panel.
  
  - `@ts-ha/shared`: an optional `zone` joins `WallWidget` (trimmed, non-empty,
    length-bounded) and `WALL_WIDGET_TYPES` gains `link` and `devices`, with
    `WallLinkWidgetConfig` (`{ target, label? }`) and `WallDeviceGridWidgetConfig`
    (`{ qualifiedIds, title? }`) validated in the wall-profile schema. Additive:
    no existing contract changes and `WALL_PROFILE_VERSION` stays 1, so a profile
    written before this release keeps loading unchanged
  - `@ts-ha/web-ui`: the wall groups labelled widgets into a zone band that draws
    its own tinted surface and label behind the member tiles, so the wall gains a
    second container level without nesting one surface in another
  - `@ts-ha/web-ui`: a card composes itself for its declared span — a
    `compact | regular | roomy` tier resolved from a placement and its descriptor
    bounds — so content no longer overflows its cell and a large span is not left
    hollow, in both directions rather than only shrinking to fit
  - `@ts-ha/web-ui`: the wall light card is redesigned into a compact form that
    presents every control its device declares (brightness, colour temperature,
    colour) at the type's re-derived minimum span, adapting each control's form
    instead of dropping it; the dashboard's `size="default"` rendering is
    unchanged
  - `@ts-ha/web-ui`: the wall's scale is reduced — a lower row-unit ceiling, a
    floor re-derived against the compact card, and lower hero/metric/title bounds,
    `vmin` coefficients, and label tier — while the 56 px touch-target and 18 px
    body floors hold
  - `@ts-ha/web-ui`: a `band` readout tier joins the wall ramp so grouped readouts
    (the climate band) do not compete with the hero, a readout's value never
    splits from its unit, and a device name shortens rather than ellipsizing to a
    prefix several cards share
  - `@ts-ha/web-ui`: a new `devices` widget renders the devices the author selects
    explicitly as a uniform grid of wall device cards, paging within its span with
    touch page controls — and a new `link` widget opens another named wall
    profile, with the opened wall offering a back affordance and a link to a
    missing profile explained rather than blank
  - `@ts-ha/web-ui`: a fit resolver holds the wall to the panel — the wall no
    longer scrolls anywhere (a deliberate change to the wall's appearance), every
    wall tile grid that overflows its span pages rather than scrolling (the device
    grid, favorites, and room grids), and a profile that still cannot fit at the
    floors renders a contained "too large for this panel" state
  - `@ts-ha/web-ui`: the editor gains per-widget zone configuration, a link's
    target and a device grid's selection, and a target-panel (1920 × 1080) preview
    with a fit verdict and a device grid's page count — refusing to save a draft
    that cannot fit

### Patch Changes

- Updated dependencies [d9d2f64]
  - @ts-ha/shared@0.6.0

## 0.7.0

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

- a2ac4ae: Preserve a capability's declared on/off encoding through dashboard ingestion and
  reconcile a settled command.
  
  The dashboard's descriptor normaliser now carries `valueOn`/`valueOff` through
  `normalizeCapability`, so every device — including those delivered by the event
  stream's per-connection device snapshot — keeps the encoding its capability
  declares, and a control no longer misreads a reported `"ON"` or composes a bare
  `true`. The optimistic override now reconciles a device report by the value it
  carries — it clears the override only when that value matches what the newest
  request asked for — and reverts an unconfirmed command at its deadline by
  request identity, instead of gating both on whether the send is still in
  flight. A command that is neither confirmed nor rejected within its deadline
  therefore reverts instead of reporting an actuation that did not happen.
- Updated dependencies [1293ec4]
  - @ts-ha/shared@0.5.0

## 0.6.0

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
- 5371c54: Redesign the dashboard on the Lumen design system and migrate the frontend off
  Mantine.
  
  - `@ts-ha/web-ui`: replace Mantine v9 and `@tabler/icons-react` with Tailwind
    CSS v4 (via `bun-plugin-tailwind`, no PostCSS pipeline), Radix UI headless
    primitives, and `lucide-react`, keeping React 19, `Bun.build`, the
    content-hashed/split/pre-compressed asset pipeline, and the ≤250 KB gzip
    first-paint budget
  - `@ts-ha/web-ui`: replace the "Ambient Glass" system with **Lumen** — the
    semantic tokens (colour, typography, spacing, radius, elevation, motion) are
    declared once in the Tailwind entry stylesheet (`src/app/styles/app.css`) and
    consumed only through utilities/tokens, so no view carries a literal hex; dark
    is authoritative and the light scheme is designed in its own right, not
    inverted
  - `@ts-ha/web-ui`: an explicit light / dark / **system** theme selection is
    persisted and applied to `data-theme` before first paint by an inline shell
    bootstrap, replacing Mantine's colour-scheme manager and removing any flash of
    the wrong scheme
  - `@ts-ha/web-ui`: the application shell becomes mobile-first — a persistent
    collapsible nav rail on wide viewports, and a safe-area-aware app bar plus a
    control-first bottom bar with an overflow affordance on narrow viewports,
    with operator views reachable by URL
  - `@ts-ha/web-ui`: every view and shared component (device tile, capability
    controls, cover transport, source viewer, error boundary, navigation) is
    rebuilt on a token-driven `ui/*` primitive layer; the data layer
    (snapshot-then-stream reconciliation, optimistic actuation, per-property
    coalescing, revert deadlines) and the full-bleed wall's grammar are unchanged
    in behaviour

## 0.5.0

### Minor Changes

- d939550: Give wall device cards capability-driven archetypes instead of one template.
  
  - `@ts-ha/web-ui`: the wall selects a card shape from a device's ranked
    capabilities — a `light` card carries both an on/off toggle and a brightness
    slider (a deliberate, wall-only departure from MASTER's one-dominant-action
    rule), a `toggle` card keeps whole-card actuation, a chrome-less `readout`
    card presents a sensor's value with no control surface competing with it, and a
    `cover` card shows transport controls
  - `@ts-ha/web-ui`: cover cards use Open/Close/Stop transport in place of the
    position slider; Open writes `position.max` and Close `position.min`, and Stop
    is progressive — rendered only when a writable transport property can express
    it, so a Shelly-like cover keeps Open and Close alone (no `shared`/`core`
    contract change)
  - `@ts-ha/web-ui`: a nested wall device tile draws no `Paper` of its own, so a
    card rendered inside a widget frame is a single surface rather than a tile in
    a tile
  - `@ts-ha/web-ui`: the wall's observation channel is demoted to a non-textual
    indicator — icon shape and token still distinguish push, polled/stale, and
    unreachable, and the state name stays in `title`/`aria-label`, but the
    `polled · 3m` text no longer competes with the card's control
  - `@ts-ha/web-ui`: the scene button becomes a full-bleed, pressable tile with a
    large icon and label and an explicit active/pressed state
  - `@ts-ha/web-ui`: device names are presented readably (`livingroom_couch` →
    "Livingroom Couch") via a pure helper at every name-presentation site — tiles,
    detail view, room membership, and select options — while the raw identifier
    stays the wire value and still appears in the detail view
  - `@ts-ha/web-ui`: the wall editor's widget list becomes a dense responsive grid
    (one column narrow, two on wide screens)

## 0.4.0

### Minor Changes

- 62407e3: Make the wall surface glanceable from across a room.
  
  - `@ts-ha/web-ui`: card heights follow each widget's declared span through a
    bounded row unit (`clamp(72px, (panelHeight − chrome) / occupiedRows, 112px)`)
    instead of stretching to fill the panel, so a small control is never inflated;
    a short composition is centered and a taller one top-aligns and scrolls, with a
    single `clamp(16px, 2vmin, 24px)` gutter separating and insetting cards
  - `@ts-ha/web-ui`: a larger distance-readable type ramp (no wall body text below
    16 px) and an `ambient` (chrome-less readouts) vs `control` (opaque surface
    tiles) grammar fixed per widget type, with widget titles opt-in via profile
    config and retuned registry defaults
  - `@ts-ha/web-ui`: a wall kiosk mode on the shared device tile
    (`size="wall"`) that suppresses the favorite, hide/unhide, and open-detail
    affordances and makes a toggle primary's whole card the actuation target — a
    wall-only revisit of `add-wall-display` design D7; capability ranking,
    optimistic override, and non-color state encoding stay single-source, and the
    dashboard tile is unchanged

## 0.3.1

### Patch Changes

- Updated dependencies [63816ad]
  - @ts-ha/shared@0.4.0

## 0.3.0

### Minor Changes

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
