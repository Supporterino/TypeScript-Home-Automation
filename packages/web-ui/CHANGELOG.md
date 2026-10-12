# @ts-ha/web-ui

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
