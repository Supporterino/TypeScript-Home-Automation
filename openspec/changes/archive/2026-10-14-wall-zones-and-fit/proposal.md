# Proposal

## Why

The wall has been redesigned four times in three days (`add-wall-display` →
`improve-wall-display` → `wall-card-archetypes` → `redesign-wall-display`) and
still does not look good on the panel. Investigation points at three coupled
causes, none of which the previous changes addressed:

- **Card presentation ignores the widget's span.** `widget.w`/`widget.h` are
  consumed only by `gridPlacementStyle()` (`wall/grid.ts`) to place the CSS box —
  nothing else reads them. So a card's *content* is identical at 2 columns and 6
  columns. A wall light card grows a colour-temperature and a colour control when
  the device declares them, but its 2-row cell does not, and the card overflows
  its own cell (clipped by `WidgetFrame`'s `overflow-hidden`); a tall scene card
  keeps a fixed 56 px glyph row and reads as 80 % empty; a 2-column temperature
  readout wraps its unit onto a second line.
- **Composition is authored blind.** The editor (`walls/editor/**`,
  `views/WallsView.tsx`) is a Lumen surface on a different device and has no
  wall preview or fit indicator, so a profile is placed without ever seeing it at
  the panel's aspect ratio. The supplied capture is 1674×1212 (ratio 1.38) while
  the panel is 1920×1080 (1.78): the `°C` wrap visible in it is a
  capture-viewport artifact, and the composition being evaluated is not the one
  that runs.
- **The wall's scale is oversized for its panel.** When the composition fits, it
  is still drawn at the ramp's full distance scale: the row unit rises to its
  112 px ceiling on a short composition and the ramp resolves at its `vmin` term
  (a ~76 px hero, a ~54 px metric on the 1080 px-tall panel), so a handful of
  cards fill the panel as very large blocks rather than a dense, glanceable
  composition.
- **The wall is a single surface with no dense layout and no route to another
  one.** Zones group a handful of cards well, but a device-dense home cannot
  express "every light" or "every cover" as a curated composition without
  exceeding the panel, and a wall offers neither a route to a second wall nor a
  way back — so a home either crowds everything onto one panel or has no path
  between panels.

The result is a panel of fifteen near-identical near-black rectangles with no
container hierarchy, a hacked-in giant "Off", and hollow scene boxes.

## What Changes

- **Add zones to the wall composition.** A widget MAY carry an optional `zone`
  label; the wall renders each zone as a labelled band. This is an additive
  `@ts-ha/shared` change (`WALL_PROFILE_VERSION` stays 1). A zone band draws a
  tinted band surface and a label; member tiles keep their own surface, so the
  wall gains a second container level without nesting one surface in another.
- **Make card presentation span-aware.** A card composes itself for its declared
  span so its content never overflows its cell and a large span is not left
  hollow — the reconciliation is bidirectional, not just "shrink to fit".
- **Reduce the wall's component scale.** Lower the row unit's ceiling and the
  distance ramp's bounds and `vmin` coefficients so a card renders ~25–30 %
  smaller on the panel, while holding the wall's floors (≥ 56 px touch target; a
  body floor above the dashboard's 16 px body scale).
- **Redesign the wall light card into a compact form** that fits the type's fixed
  minimum span: the brightness, colour-temperature, and colour controls adopt
  span-appropriate control forms rather than assuming a full slider each. The
  control set stays the one the device declares (a device's declared controls are
  never dropped for want of room); the *form* adapts.
- **Add a fit resolver that never exceeds the panel.** The composition is
  resolved to the panel at the wall's floors (≥ 56 px touch target, ≥ 18 px body
  text). A profile that still cannot fit renders a contained "too large for this
  panel" state instead of degrading to a scroll, and the editor refuses to save
  it. A widget whose own content cannot fit its span — the device grid, and the
  favorites and room tile grids, which previously scrolled their tile area — pages
  rather than scrolling, so the **wall never scrolls anywhere**. **BREAKING** for
  the wall's appearance: the wall no longer scrolls.
- **Add a device-grid widget.** A profile MAY place a widget whose device set the
  author selects explicitly; it renders the selected devices as a uniform grid of
  simple tiles and pages within its span when they do not all fit, so it never
  overflows or scrolls. The favorites and room tile grids adopt the same
  pagination so no wall widget scrolls. This is the full-device layout a device-dense home
  reaches for, and it is deliberately not an enumeration of the whole inventory.
- **Add cross-wall navigation.** A profile MAY place a link widget that opens
  another named wall profile; a wall opened from a link presents a way back, so
  walls form a walkable hierarchy of separate profiles. A link whose target does
  not exist is explained, not blank.
- **Re-derive the wall's readout hierarchy.** A **band-readout** tier is added to
  the wall ramp so grouped readouts (the climate band) do not compete with the
  hero; a readout's value never splits from its unit, and a device name shortens
  rather than ellipsizing to a prefix several cards share.
- **Add a target-panel fit indicator and preview to the editor** so a profile is
  authored and evaluated against the panel's aspect ratio (1920×1080 landscape),
  not the editing viewport's, and reports a device grid's page count.
- **Extend the editor for the two new widget types**: a link's target profile and
  a device grid's explicitly selected devices are configured like any other
  widget option.
- **Update the design-system documentation** (`design-system/ts-ha/pages/wall.md`)
  for zones, span-aware cards, the compact light card, the band tier, the link
  and device-grid types, and the fit rule.

## Capabilities

### New Capabilities
<!-- None. Zones, span-aware presentation, fitting, navigation, and the device
     grid are wall behaviors the existing wall-display capability owns. -->

### Modified Capabilities

- `wall-display`: **ADDED** "Wall Zones" (a widget MAY carry a zone label and the
  wall groups labelled widgets into a band with its own surface and label),
  "Span-Aware Card Presentation" (a card's content is reconciled with its
  declared span, in both directions), "Panel Fit" (the wall never scrolls; a
  device grid pages rather than overflowing, and an unfittable authored profile
  is explained), **"Wall Navigation"** (a link widget opens another named profile
  and a wall reached from a link offers a return), and **"Device Grid Widget"**
  (the author's explicitly selected devices render as a uniform grid that pages
  rather than scrolling); **MODIFIED** "Widget Grid Layout" (a widget MAY declare
  a zone as part of its placement), "Wall Glanceability" (the ramp gains a
  band-readout tier; a readout's value never separates from its unit; a name
  shortens instead of ellipsizing to a shared prefix; a readout and a control are
  also distinguished by which container level they occupy), **"Widget Catalog"**
  (the catalog gains a link type and a device-grid type), "Wall Device
  Presentation" (the wall light card is a compact form that fits its type's
  minimum span while still presenting every control its device declares), and
  "Wall Configuration Editor" (the editor configures a link's target and a device
  grid's selection, presents the draft at the target panel's aspect ratio, reports
  the grid's page count, and refuses to save an authored profile that cannot fit).

## Impact

- **Shared contract (`packages/shared/src/wall.ts`, `wall-schema.ts`)**: an
  optional `zone` is added to the widget type, `WALL_WIDGET_TYPES` gains `link`
  and `devices`, and the widget type's configs gain `WallLinkWidgetConfig`
  (`target`, `label?`) and `WallDeviceGridWidgetConfig` (`qualifiedIds`,
  `title?`), each validated in the profile schema;
  `scripts/contract-inventory.json` is updated if the widget type is a tracked
  contract. Additive — `WALL_PROFILE_VERSION` is unchanged and an existing
  profile keeps loading.
- **Wall presentation (`packages/web-ui/src/app/wall/**`)**: `grid.ts` and
  `WallGrid.tsx` group widgets into zones and resolve the panel fit;
  `WidgetFrame.tsx` and `frame.ts` gain the band surface and its label; a band
  token is added to `hearth.css` and a band-readout tier to `type-ramp.ts`;
  `widgets/**` become span-aware; a new `widgets/DeviceGridWidget.tsx` and
  `widgets/LinkWidget.tsx` join the catalog with a pure `pages.ts` pagination
  resolver, and `WallGrid`/`WallView` navigate between profiles through the
  existing router; `widgets/FavoritesWidget.tsx`/`widgets/RoomWidget.tsx` page
  their tile grids through the same resolver instead of scrolling; the wall
  `light` archetype in `components/DeviceTile.tsx` is
  redesigned into the compact form (its props, capability ranking, optimistic
  override, and state encoding are unchanged, and the dashboard's rendering is
  unaffected).
- **Scale (`packages/web-ui/src/app/wall/grid.ts`, `type-ramp.ts`,
  `hearth.css`)**: the row unit's ceiling is lowered and its floor re-derived
  against the smaller compact card; the ramp's hero/metric/title bounds, `vmin`
  coefficients, and label tier are reduced. The touch-target (56 px) and body
  (18 px) floors are unchanged.
- **Wall editor (`packages/web-ui/src/app/wall/editor/**`,
  `views/WallsView.tsx`)**: zone configuration per widget, a link's target and a
  device grid's device selection, and a target-panel fit indicator with a preview
  of the draft at the panel's aspect ratio that reports a device grid's page
  count.
- **Design system (`design-system/ts-ha/pages/wall.md`)**: rewritten for zones,
  the span-aware card grammar, the compact light card, the band-readout tier, the
  link and device-grid types, and the fit rule.
- **Web-UI documentation (`docs/http/web-ui.md`)**: updated to the landed wall
  behaviour (the never-scrolling fit rule and reduced row unit, zones, the
  band-readout tier, the compact light card, and the link and device-grid
  types).
- **Tests (`packages/web-ui/tests/wall-*.test.ts`)**: new tests for zone
  grouping, the fit resolver and its unfittable state, span-aware card
  composition, the compact light card, no-wrap value/unit, link navigation and
  its return, a broken link's explanation, device-grid selection and pagination,
  and the editor fit check and page-count report; existing wall tests are
  re-pointed where a presentation changed.
- **Changeset**: one is added covering `@ts-ha/shared` and `@ts-ha/web-ui`.
- **No `@ts-ha/core` or `@ts-ha/cli` change**, and the `shared` ← `web-ui`
  direction and the "no `core` import" rule are unchanged.

## Non-Goals

- **No new widget type beyond the link and the device grid, and no new runtime
  subsystem.** The two new types render existing data; no backend, service, or
  endpoint is added.
- **No layout modes inside a profile and no auto-enumeration of the inventory.**
  Widgets are still placed by hand on the fixed 12-column grid; the device grid
  renders only the devices the author explicitly selects, and multiple layouts
  are separate wall profiles reached by links — not a new composition model,
  auto-composition, or content-first packing.
- **No profile-format migration.** `zone` and the two new widget types are
  additive; the version stays 1.
- **No dashboard change.** The wall's card vocabulary, zones, compact light card,
  device grid, navigation, and fit rule are wall-only; the dashboard keeps its
  Lumen surfaces and its shared device tile.
- **No change to the wall's remaining behaviour.** Navigation aside, named
  profiles, the editor flow, scene triggers, live updates, orientation overrides,
  and always-on/reconnect behaviour are retained.
- **No change to the HTTP API or event-stream shape.** Zones, the new widget
  types, navigation, and the fit rule ride the existing wall-profile contract;
  none adds an endpoint.
- **No new runtime dependency** in any package, and no animation library.
