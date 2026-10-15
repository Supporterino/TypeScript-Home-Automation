## Why

The wall renders every device through **one generic card**. `components/DeviceTile.tsx`
selects a presentation from a device's capabilities (`lib/card-archetype.ts`) and
`wall/registry.ts` offers a single `device` widget type that points at any device.
Two consequences, both visible in the supplied capture (the harness stage at
1920×1080):

- **No device class gets a card that suits it.** The light is the clearest case:
  the card drew three full-height gradient slabs with the slider handles near the
  bottom and no visible labels, so brightness, colour temperature and colour
  cannot be told apart at a glance. The generic card cannot be fixed for the
  light without becoming wrong for the cover, the switch, and the readout.
- **The card scale is the wall's own invention.** The wall's device cards are
  sized by tokens we invented (a 56 px kiosk touch target, an 18 px body floor, a
  16 px card radius, a 24 px glyph) rather than by a card system that has been
  designed, iterated, and used by other people. The result reads as a control
  panel, not as a card.

The user wants the wall's device cards to be **one per device class**, ported as
faithfully as possible from `piitaya/lovelace-mushroom`, the card set this home's
author wants to match. Mushroom is Apache-2.0 and this repository is GPL-3.0, so
porting is permitted in that direction with attribution; it cannot be an *import*,
because Mushroom's cards are `LitElement` classes bound to Home Assistant's
frontend (they read the `hass` object, render `ha-*`/`hui-*` elements, and depend
on HA's theme variables), and there is no React build usable outside HA.

A separate defect from the same capture — a paged tile row was inflated to 1.74×
the cell its card was composed for (316 px against 181.6 px) — was being fixed by
`redesign-wall-light-card`, which this change supersedes and absorbs.

## What Changes

- **Retire the generic device card on the wall.** The wall's device widgets
  become typed: one widget type per device class, each rendering its own card.
  `lib/card-archetype.ts` and the wall's use of the shared tile retire; the
  dashboard's own Lumen tile and its archetype ranking are untouched.
- **Port Mushroom's device-card catalogue.** One wall card per class, composed
  from Mushroom's own anatomy: a tinted circular icon, a name over a state line,
  and — where the device has controls — an actions row carrying the active
  control as a slider with the other controls beside it as icon buttons.
  The catalogue targets Mushroom's device cards: light, cover, entity, climate,
  fan, humidifier, lock, media player, vacuum, number, select, update, person,
  and alarm control panel. A card is offered for a device whose capabilities can
  drive it; the design records the capability mapping per card and flags any
  class the device sources cannot yet express.
- **Adopt Mushroom's metrics and tokens for wall device cards, literally.**
  Mushroom's own values replace the wall's invented device-card scale: a 36 px
  circular icon with a 24 px glyph, a 42 px control height at a 12 px radius,
  14 px/500 primary over 12 px/400 secondary text, 10 px card padding, 12 px
  control spacing, and a 12 px card radius. **BREAKING** for the wall's
  appearance and for what it guarantees at distance: the wall's kiosk-class
  **56 px** touch minimum and its **≥ 16 px** body floor are lowered to those
  values, and the wall's row unit, tile cell, paging density, and the editor's
  span floors are re-derived from the smaller card.
- **Adopt Mushroom's device-colour handling.** The light card's colour comes from
  Mushroom's own contrast improvement rather than a band this project invented: a
  colour's saturation is raised to a floor when it is washed out and near-greys
  are lifted, then drawn as the glyph colour over a 25 %-alpha fill and as the
  slider's colour over a 20 %-alpha background.
- **Port the two per-card options that mean something on a wall**: `layout`
  (default, vertical, horizontal) and `collapsible_controls` (controls hidden
  while the device is inactive). Mushroom's action configuration
  (`tap_action`/`hold_action`/`double_tap_action`) has no meaning here — the wall
  has no more-info view and never hovers — and its `primary_info` /
  `secondary_info` / `icon_type` pickers are deliberately not ported.
- **Make the wall profile contract per-type.** `WALL_WIDGET_TYPES` gains a widget
  type per device class with its own config, `WALL_PROFILE_VERSION` goes to `2`,
  and a stored version-1 profile is migrated rather than rejected, so no saved
  wall is lost.
- **Land the paged-tile sizing this change absorbs**: a tile row is bounded
  against inflation, a widget centres the space its tiles do not use, and a card
  resolves its composition from the box it is given. The tile-row bound and the
  box-resolved composition are the parts of `redesign-wall-light-card` that
  survive its redesign of the light card.
- **Record the attribution** for the ported design in the repository, and update
  the wall's design-system page and the web-UI documentation.

## Capabilities

### New Capabilities

<!-- None. Every behaviour here is wall behaviour: the catalogue, the card
     anatomy and metrics, the tile sizing, the profile version and its migration
     all belong to the existing wall-display capability. -->

### Modified Capabilities

- `wall-display`: **ADDED** "Paged Tile Sizing" (a paged widget's tiles keep a
  box bounded against inflation and the widget centres what they do not use) and
  "Wall Profile Version and Migration" (a stored profile of an older version is
  migrated rather than rejected); **MODIFIED** "Widget Catalog" (the device
  widget types become one per device class, each with its own config),
  "Wall Device Presentation" (a card is composed from its device class's
  Mushroom anatomy; the generic archetype presentation retires on the wall;
  per-card `layout` and collapsible controls), "Touch Operation" (**the minimum
  touch target is lowered from 56 px to Mushroom's 42 px control height**),
  "Wall Glanceability" (**the body floor is lowered from 18 px to Mushroom's
  type ramp**, and the row unit is re-derived from the smaller card),
  "Wall Visual Language" (wall device cards draw Mushroom's token table and its
  device-colour handling), "Span-Aware Card Presentation" (a card resolves its
  composition from the box it is given in both dimensions), "Device Grid Widget"
  and "Wall Configuration Editor" (tiles and widgets follow the typed cards; the
  editor configures a widget's device, layout and collapsible controls, and
  reports the fit at the re-derived floors).

## Impact

- **Shared contract (`packages/shared/src/wall.ts`, `wall-schema.ts`)**: the
  widget type list becomes per-device-class with a config per type;
  `WALL_PROFILE_VERSION` becomes `2` and the schema accepts a version-1 profile
  for migration; `scripts/contract-inventory.json` is updated for any tracked
  contract that moves. **BREAKING** for the persisted profile shape.
- **Core (`packages/core/src/wall-manager.ts`, `http-server.ts`)**: profile
  records are written at version 2 and a stored version-1 profile is migrated on
  load — a `device` widget becomes its device's typed widget at the same
  placement, and a `devices` widget keeps its selection. This is the first change
  in this area to reach `@ts-ha/core`, so the migration is covered by tests
  (`packages/core/tests/`).
- **Wall presentation (`packages/web-ui/src/app/wall/**`,
  `components/DeviceTile.tsx`)**: `wall/registry.ts` carries the typed widget
  catalogue with its spans; a per-class card module per catalogue entry replaces
  the wall's use of the generic tile; `wall/hearth.css` carries Mushroom's
  token table for device cards; `wall/span.ts`, `wall/pages.ts` and
  `wall/widgets/PagedTileGrid.tsx` carry the absorbed tile sizing;
  `wall/widgets/{Room,Favorites,DeviceGrid}Widget` render typed tiles. The
  dashboard path is untouched and keeps its own tile.
- **Wall editor (`packages/web-ui/src/app/wall/editor/**`)**: a per-type device
  selection plus `layout` and `collapsible_controls`, at the re-derived floors.
- **Design system (`design-system/ts-ha/pages/wall.md`)**: the device-card
  section is replaced by the ported catalogue, the Mushroom metric tables, the
  re-derived row unit, and the attribution.
- **Web-UI documentation (`docs/http/web-ui.md`)**: the wall device-card and
  paging sections.
- **Tests (`packages/web-ui/tests/wall-*.test.ts`, `packages/core/tests/`)**:
  catalogue selection per device class, each card's anatomy and metrics, the
  re-derived floors and row unit, the tile-row bound, and the version-1 → 2
  profile migration.
- **Changeset**: one covering `@ts-ha/shared`, `@ts-ha/core`, and
  `@ts-ha/web-ui`.
- **No `@ts-ha/cli` change**, and the `shared` ← `web-ui`, `shared` ← `core`
  directions and the "no `core` ↔ `web-ui` edge" rule are unchanged.

## Non-Goals

- **No dashboard change.** The shared device tile, `lib/card-archetype.ts` and
  the dashboard's device views keep their current presentation and ranking; only
  the wall's presentation changes. The wall and dashboard therefore render a
  device differently on purpose.
- **No vendored Mushroom source.** The cards are re-implemented in React against
  our own data model; Mushroom's `LitElement` classes, `hass` interactions and
  `ha-*` elements cannot be imported. The design and its tokens are ported, and
  the attribution is recorded.
- **No Mushroom action or info configuration.** No `tap_action`, `hold_action`,
  `double_tap_action`, `primary_info`, `secondary_info`, or `icon_type`; the wall
  has no more-info surface and no hover.
- **No non-device Mushroom cards.** Chips, title, empty and template cards are out
  of scope; this change is about device cards.
- **No new runtime dependency** in any package, and no animation library.
- **No re-theming of the dashboard**, and no change to the wall's non-device
  widgets (clock, weather, energy, status, scene, link) beyond the tiles they
  contain.
