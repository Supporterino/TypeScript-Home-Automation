## Why

`mushroom-device-cards` ported Mushroom's device cards to the wall: one card per
device class, composed from the ported anatomy (a tinted circular icon, a name
over its state, an actions row) on Mushroom's own metrics
(`wall/cards/card-anatomy.tsx`, `wall/cards/metrics.ts`). That change scoped
itself to device widgets and said so in its own Non-Goals: "no change to the
wall's non-device widgets (clock, weather, energy, status, scene, link) beyond
the tiles they contain."

The wall therefore carries **two card vocabularies today**:

- a device card draws a 36 px circular tinted icon with a 24 px glyph, 14 px/500
  over 12 px/400 text, a 12 px-radius surface at 10 px padding, and 42 px
  controls at a 12 px radius;
- every other widget still draws the wall's earlier vocabulary —
  `wall/widgets/card-vocab.tsx`: a bare 24 px muted glyph with no shape, an 18 px
  uppercase letterspaced label, and pill-shaped affordances
  (`--hearth-radius-pill`). The widget frame pads at `--hearth-space-4` (16 px)
  and radii at `--hearth-radius-md` (16 px), so a control widget's surface does
  not match a device card's surface on the same panel either.

So one panel mixes a card system that was designed and iterated elsewhere with
the wall's own older invention — the very mismatch the device-card change set out
to remove, left standing for everything that is not a device.

A second, smaller gap from the same area: the temperature widget presents only
temperature. The sensors this home actually runs declare humidity on the same
device (`AqaraTemperatureHumidityPayload`, `TemperatureHumidityPayload`),
`humidity` is already a ranked tile readout in `lib/capability-ranking.ts`, and
the harness already reports a humidity figure — the widget simply drops a reading
the bound device already carries.

## What Changes

- **One card vocabulary on the wall.** `wall/widgets/card-vocab.tsx` retires.
  Every wall widget is composed from the ported anatomy and its ported metrics: a
  leading **circular tinted icon** (36 px shape, 24 px glyph), a **primary line
  over a secondary line** at the ported 14 px/500 and 12 px/400, the **ported
  card surface** (12 px radius, 10 px padding) wherever the wall draws a surface,
  and the **ported control treatment** (42 px control height, 12 px radius, 12 px
  control spacing) for every control.
- **The frame, the zone band and the panel chrome adopt the same table.** The
  widget frame's surface radius and padding, the zone band's radius, the wall's
  route/page affordances and the panel's own explanations move onto the ported
  tokens; `wall/pages.ts`'s frame inset is re-derived from the ported card
  padding instead of Hearth's `--hearth-space-4`, so `WALL_FRAME_RESERVED_PX`, the
  page reservations, the panel-fit verdict, the editor's reported floors and the
  harness geometry all follow from one number.
- **A readout's value keeps the wall's distance scale; supporting text matches the
  ported sizes literally.** The value of a readout (the clock time, a weather or
  energy figure, a temperature) stays on the wall's own hero/metric/band tiers —
  that is the thing read from across a room — while the label above it and every
  caption or secondary figure adopt the ported primary and secondary sizes.
  **BREAKING for the wall's appearance and for what it guarantees**: the wall's
  **18 px** body floor and label tier are given up for the ported **14 px/12 px**,
  and the ramp's compact chip exception retires because there is nothing left
  below the floor to except. The requirement is modified explicitly rather than
  left to disagree with the code, exactly as the device cards' own lowering was.
- **The temperature widget presents the sensor's humidity**, when the bound
  device declares one, as its secondary reading — one non-breaking value with its
  unit. A sensor that declares no humidity renders exactly as today. No new config
  field, no editor change, no profile-version change: the config shape is
  unchanged and `@ts-ha/shared` is untouched.
- **The weather widget composes for the box it is given** (design.md W7). Leading
  with the ported 36 px icon affordance makes its stacked ambient layout taller
  than its 3 × 3 minimum-span cell, so rather than clip against the frame the
  widget resolves which of its parts to draw from the box the frame hands it — as
  the scene tile already does: the condition and temperature always draw, the
  humidity/wind detail row draws while the box holds it, and the forecast draws
  only when the box holds both. The widget's declared minimum span is unchanged.
- **Keep the record in agreement.** The design-system page
  (`design-system/ts-ha/pages/wall.md`) and the web-UI documentation
  (`docs/http/web-ui.md`) are updated for the single vocabulary, the re-derived
  floor and the humidity reading.

## Capabilities

### New Capabilities

<!-- None. Every behaviour here is wall behaviour: the vocabulary, the ramp's
     floor, the frame geometry and the temperature reading all belong to the
     existing wall-display capability. -->

### Modified Capabilities

- `wall-display`: **MODIFIED** "Widget Catalog" (the temperature widget presents
  its sensor's humidity where the sensor declares one), "Wall Visual Language"
  (the wall carries exactly one card vocabulary — every widget, the frame and the
  band are composed from the ported anatomy and its token table, not only device
  cards), "Wall Glanceability" (the ramp's declared body floor becomes the ported
  card's secondary size and the label tier the ported primary size; the readout
  tiers are unchanged and still carry a readout's value), and "Touch Operation"
  (every control is the ported control and every control row is spaced by the
  ported control spacing).

## Impact

- **Wall presentation (`packages/web-ui/src/app/wall/**`,
  `packages/web-ui/src/app/views/WallView.tsx`)**:
  `wall/cards/card-anatomy.tsx` gains the parts the widget chrome needs (the
  readout state item, the labelled control and route affordance, the message
  form, the control-spacing helper) drawn from `wall/cards/metrics.ts`;
  `wall/widgets/card-vocab.tsx` retires; every widget renderer (`Clock`,
  `Weather`, `Energy`, `Status`, `Temperature`, `Scene`, `Link`, `Room`,
  `Favorites`, `DeviceGrid`, `PagedTileGrid`) and the models that carry
  presentation (`link-model.ts`, `temperature-model.ts`) are recomposed;
  `wall/WidgetFrame.tsx`, `wall/frame.ts`, `wall/WallGrid.tsx` (the zone band and
  the panel explanations), `wall/pages.ts` (the frame inset), `wall/span.ts` (the
  floors follow), `wall/type-ramp.ts` (the body floor and the label tier) and
  `wall/hearth.css` (the frame/band/chip tokens) carry the geometry;
  `wall/harness/**` follows the inset.
- **Shared contract (`packages/shared`)**: **no change**. No widget type, config
  field, profile version or schema moves — the temperature widget's config stays
  `{ qualifiedId, title? }` — so `wall.ts`, `wall-schema.ts` and
  `scripts/contract-inventory.json` are untouched.
- **Core (`packages/core`)**: **no change**.
- **CLI (`packages/cli`)**: **no change**.
- **Design system (`design-system/ts-ha/pages/wall.md`)**: the widget vocabulary,
  the frame/band surface, the re-derived ramp floor and the temperature widget's
  humidity. The page is a declared site the wall's own tests read
  (`wall-tokens.test.ts`, `wall-type-ramp.test.ts`), so it moves with the code.
- **Web-UI documentation (`docs/http/web-ui.md`)**: the wall section's widget and
  card presentation.
- **Tests (`packages/web-ui/tests/wall-*.test.ts`)**: the vocabulary test, the
  ramp/token agreement tests, the frame/pages/paging/span/grid/editor derivations,
  the harness walk, and each widget's own test, including the temperature model's
  humidity resolution.
- **Changeset**: one covering `@ts-ha/web-ui` (a published package, whose wall
  bundle changes). No `@ts-ha/shared` or `@ts-ha/core` change, so no changeset for
  them.
- **No new dependency**, no new runtime dependency, and the dependency direction
  (`shared` ← `web-ui`) is unchanged.

## Non-Goals

- **No dashboard change.** `components/DeviceTile.tsx`, `lib/card-archetype.ts`
  and the dashboard's views keep their own presentation; the wall and the
  dashboard render differently on purpose.
- **No editor re-skin.** `/walls` and `wall/editor/**` stay on Lumen — only the
  floors and page counts the editor *reports* change, because they follow the wall
  geometry.
- **No shared-contract, profile-version or migration work.** The temperature
  widget's humidity is a reading, not a setting, so no stored profile changes.
- **No humidity on any other surface.** The entity card, the dashboard tile, the
  weather widget, the energy surface and the HomeKit surface are unchanged.
- **No new widget types.** The six Mushroom classes still pending from
  `mushroom-device-cards` (media player, vacuum, person, alarm control panel,
  update, humidifier) remain pending and out of scope.
- **No off-wall explanation re-skin.** The wall route's "not found" and "deleted"
  states are the dashboard shell explaining a missing profile, not a wall surface;
  they stay on Lumen.
- **No new runtime dependency, and no animation library.**
