## Context

See `proposal.md` — Why. What shapes the approach is that the wall now has a
card system and does not use it everywhere.

`mushroom-device-cards` left the wall with:

- `packages/web-ui/src/app/wall/cards/card-anatomy.tsx` — the ported anatomy
  (`WallCardIcon`, `WallCardText`, `WallCardActions`, `WallCardSlider`, plus
  `WallCardIconButton`, `WallCardOption`, `WallCardDropdown`,
  `WallCardEnumControl`, `WallCardObservation`), drawn from
  `wall/cards/metrics.ts`;
- `packages/web-ui/src/app/wall/cards/metrics.ts` — `WALL_CARD_METRICS`
  (icon 36 px / glyph 24 px / circle, primary 14/500/20/0.1, secondary
  12/400/16/0.4, control 42 px at a 12 px radius with 12 px spacing, card padding
  10 px, card radius 12 px, slider 42 px), mirrored once as the `--hearth-card-*`
  tokens in `wall/hearth.css` and asserted by `tests/wall-tokens.test.ts` against
  the design-system page;
- `packages/web-ui/src/app/wall/widgets/card-vocab.tsx` — the wall's earlier
  vocabulary, still used by every non-device widget *and* by the frame, the grid
  and the wall view: `WallCardGlyph` (a bare 24 px glyph), `WallCardLabel`
  (18 px, uppercase, 0.04 em), `WallCardMetric` (the readout ramp),
  `WallCardStat` / `WallCardHead`, `WallCardAffordance` + `WallButton` /
  `wallAffordanceStyle` (a 42 px pill on `--hearth-radius-pill`),
  `wallControlGapPx()` (8 px) and `WallCardMessage`.

Three constraints from the existing code:

- **The frame's geometry is derived, not decorative.** `wall/pages.ts`'s
  `WALL_FRAME_INSET_PX` (16 px, `--hearth-space-4`) becomes
  `WALL_FRAME_RESERVED_PX`, which feeds `WALL_PAGE_RESERVED_PX`, the paging plan,
  `wallGridMetrics`' fit verdict, the editor's reported floors and the harness
  fixtures. Changing the frame's padding is a geometry change, not a CSS tweak.
- **The design-system page is a declared site.** `tests/wall-tokens.test.ts` and
  `tests/wall-type-ramp.test.ts` read `design-system/ts-ha/pages/wall.md` and
  assert its table against the CSS tokens and the ramp module, so the page and the
  code move together.
- **The temperature widget's plumbing already exists.** `humidity` is a ranked
  readout in `lib/capability-ranking.ts`, `flattenCapabilities` reads any leaf
  property, and the sensors declare humidity on the temperature device's own
  capability tree — so the reading needs a model change, not a data change.

## Goals / Non-Goals

**Goals:**

- One card vocabulary on the wall: a widget's icon, surface, text and controls
  are the ported ones, so a panel reads as one system rather than two layers.
- The wall's distance guarantee survives where it matters: the value of a readout
  keeps its own tiers.
- The frame/band geometry stays derived in code and asserted by tests, so no
  number is restated in a second place.
- The temperature widget presents what its sensor declares, with no new config,
  no schema change and no profile migration.
- The wall's own tests are the check: every change here is reachable by
  `bun test` without a DOM, except the visual pass the harness covers.

**Non-Goals:**

- Any dashboard, editor, shared-contract, core or CLI change.
- A configurable humidity reading, or humidity on any other surface.
- Reaching the six Mushroom device classes still pending from the device-card
  change.

## Decisions

### W1 — The ported anatomy becomes the wall's only widget vocabulary

`wall/widgets/card-vocab.tsx` retires rather than being restyled in place: what
the non-device widgets need is declared once, in the ported module, drawn from
`WALL_CARD_METRICS`. The mapping is one-for-one, so no widget invents a part:

| `card-vocab.tsx` | ported replacement |
|---|---|
| `WallCardGlyph` — a bare 24 px muted glyph | `WallCardIcon` — the 36 px circular tinted shape (`--hearth-card-icon-size` / `-shape`) |
| `WallCardLabel` — 18 px, uppercase, 0.04 em | the primary line of `WallCardText` — 14 px/500, 0.1 px tracking, sentence case |
| `WallCardMetric` — the readout ramp | the readout's value, which keeps the wall's own readout tier (`wallReadoutFontSize`) |
| `WallCardStat` / `WallCardHead` | the widget state item: `WallCardIcon` beside a label-over-value block |
| `WallCardAffordance` + `WallButton` / `wallAffordanceStyle` — a 42 px pill | the ported control treatment: a `WallCardActions` row at the ported control spacing, with `WallCardIconButton` / `WallCardOption` at the ported control height and radius |
| `wallControlGapPx()` — 8 px | `WALL_CARD_METRICS.controlSpacing` — 12 px, still ≥ the wall's `WALL_MIN_CONTROL_GAP` floor |
| `WallCardMessage` | moved to the ported module, unchanged |

The widget-level parts the ported module gains are **new declarations in an
existing module**, not a new module: a widget state item (an icon affordance
beside a label over a reading) and a labelled control affordance (a scene's
button, a link's route, a room's command) modelled on `WallCardOption`'s
treatment, plus the message form. `wall/cards/card-anatomy.tsx`'s own doc comment
gains the sentence that it is the wall's *widget* vocabulary, not only its device
cards'.

*Alternatives.* Restyling `card-vocab.tsx` in place leaves two modules owning one
table — the split this change exists to close — and each of its parts would be a
second declaration of a value `WALL_CARD_METRICS` already owns. Wrapping
`card-vocab`'s parts around the ported ones keeps a second vocabulary by name and
drags the pill affordance along with it.

*Consequence to state plainly.* Every non-device widget changes appearance. The
zone caption, the opt-in widget title and the panel's explanations move too,
because they are drawn through the same vocabulary. The editor is not affected:
it is a Lumen surface by rule (`design-system/ts-ha/pages/wall.md`).

### W2 — A readout's value keeps the wall's tiers; supporting text takes the ported sizes

`mushroom-device-cards`' D2 said the wall's 18 px body floor became Mushroom's
12/14, but the ramp kept `bodyMin: 18` because the device cards' text is drawn
from `WALL_CARD_METRICS` and never consults the ramp. Applying the ported sizes to
a widget's label *does* cross the ramp's declared floor, so this change
re-declares it. Two tiers are kept exactly as they are, because they carry what is
read at distance:

| tier | today | after |
|---|---|---|
| hero | `clamp(36px, 5vmin, 76px)` | unchanged — a readout's dominant value |
| metric | `clamp(26px, 3.6vmin, 54px)` | unchanged — a readout's value |
| band | `clamp(20px, 2.4vmin, 32px)` | unchanged — a grouped/short reading |
| title | `clamp(18px, 1.8vmin, 22px)` | unchanged — the wall's own chrome headings |
| label | 18 px | **14 px** — the ported primary size, for a widget's label and every caption |
| body floor | 18 px | **12 px** — the ported secondary size |
| chip | 16 px | **retired** — with the floor at the ported secondary size there is nothing left below it to except |

The chip tier's single consumer (`RoomWidget`'s member count) draws on the
secondary size like every other caption, so the exception has no remaining
purpose. `--hearth-text-chip` goes with it.

*Alternatives.* Keeping the 18 px floor and adopting only the icon shape, surface
and controls was the smaller change and was rejected by the author: supporting
text at 18 px next to a device card's 14 px name is the same mismatch in
typography that the pill affordance is in controls. *Trade-off, recorded rather
than hidden.* Text at 12–14 px is materially smaller than 18 px at three metres.
What is read at distance — a readout's value — is untouched, and every label it
supports was already the smaller element; the harness is the check, and the
fallback if it shows the wall is unreadable is to raise the two values above
Mushroom's while keeping the anatomy.

### W3 — The frame and the band adopt the ported surface, and the frame inset is re-derived

`frame.ts`'s `wallFrameChrome` returns `--hearth-radius-md` (16 px) for a control
widget's surface and `WidgetFrame` pads at `--hearth-space-4` (16 px), while a
device card's own surface is `WALL_CARD_METRICS.radius` (12 px) at
`WALL_CARD_METRICS.padding` (10 px). On one panel those are visibly different
cards, so the frame and the band move onto the ported tokens:

- `wallFrameChrome`'s radius → `--hearth-card-radius`; the band's radius in
  `wallBandChrome` → `--hearth-card-radius`;
- `WidgetFrame`'s surface padding → `--hearth-card-padding`;
- `WALL_FRAME_INSET_PX` (`wall/pages.ts`) 16 → the ported card padding (10), so
  `WALL_FRAME_RESERVED_PX` becomes `2 × 10`.

Every derived number follows from that one constant and is asserted rather than
restated: `WALL_PAGE_RESERVED_PX`, `wallPagination`'s plans, `wallGridMetrics`'
fit verdict, `span.ts`'s floors and `WALL_TITLE_ROWS`, the editor's reported
floors and page counts, and `wall/harness/**`'s fixtures. `WALL_TITLE_ROWS` stays
1 (`ceil(29 / 50)`), so the editor's span floors do not move with it.

*Alternatives.* Keeping Hearth's 16 px frame inset leaves the frame's padding
larger than a device card's on the same panel — the mismatch this change removes —
at the cost of a geometry ripple the tests already enforce. Taking the frame inset
to `--hearth-space-3` (12) rather than the ported padding (10) would split the
difference and satisfy neither table.

### W4 — The wall's chrome adopts the ported treatment, not a card's text roles

The opt-in widget title, the zone caption and the panel's own explanations
("too large for this panel", "too small for its minimum size") are the *wall's*
chrome: they sit outside a widget's content and label containers rather than
readings. They adopt the ported treatment — family, weight, tracking, the ported
surface and the ported control metrics for a route affordance — and keep the
wall's own title/label tiers, which W2 re-derives. A card's anatomy is for widget
content; inventing a card role for the frame's title would give a container label
a card's semantics it does not have.

### W5 — Humidity comes from the bound device, when it declares one

`wall/widgets/temperature-model.ts` resolves a readable `humidity` leaf through
the same `flattenCapabilities` plumbing it already uses for `temperature`, and
exposes it as an optional second reading beside the first. `TemperatureWidget`
draws it under the temperature as the widget's secondary line, one value with its
unit and never split. A device that declares no humidity renders exactly as today;
a device with neither reading keeps the existing contained explanation, and the
"no sensor configured" / "not available" containment is unchanged.

There is no new config field, no editor field, and no profile version: the
requirement is the device's capabilities, and a profile that cannot express
something the hardware already reports is a worse answer than one that simply
shows it.

*Alternatives.* A second bound device (temperature from one sensor, humidity from
another) was rejected: the sensors this home runs report both on one device, and a
second field puts a profile-time decision where the device already answers it. A
config toggle was rejected for the same reason — and would make the wall's
default depend on an edit rather than on the device. A humidity *widget* type was
rejected: it duplicates the temperature widget's whole model for a second reading
of the same device.

### W6 — The change stays inside `@ts-ha/web-ui` and the docs

No widget type, config, schema, profile version or core behaviour moves, so
`packages/shared` and `packages/core` are untouched: `scripts/guard-contracts.ts`,
`scripts/guard-deps.ts` and `scripts/contract-inventory.json` are unaffected, and
there is no persisted-data migration — a version-2 profile written yesterday
loads and renders identically in shape. The only published package that changes is
`@ts-ha/web-ui` (its wall bundle), so exactly one changeset is added.

### W7 — The weather widget composes for the box it is given

The ported anatomy draws every supporting figure's glyph on the 36 px circular icon
affordance, so the weather widget's stacked ambient layout (condition + temperature,
then the humidity/wind detail row, then the forecast) no longer fits its **3 × 3**
minimum-span cell — 182 px at the floors — once it leads with the ported affordance
instead of a bare 18–26 px glyph. The frame is `overflow: hidden`, so the old
composition would clip rather than page.

Rather than clip, or lift the weather widget's minimum span (which would ripple into
`span.ts`'s floors, the editor's reported floors, the registry assertions and the
harness draft), the widget resolves which of its parts to draw from the renderer box
the frame hands it — the pattern the scene tile already uses. The leading condition
affordance and the temperature reading (what is read across a room) always draw; the
humidity/wind detail row draws while the box holds it; the forecast draws only when
the box holds both. The thresholds are the compositions' own budgets derived from
`WALL_CARD_METRICS` and `WALL_TYPE_RAMP`, not literals.

*Consequence to state plainly.* A weather widget at its default 3 × 3 span presents
its current condition, temperature, humidity and wind; the forecast appears from the
span that holds it (5 rows at the floors, where the row unit is at its 50 px
minimum; 4 only at the row unit's 56 px ceiling). A 3 × 3 cell could not show the
forecast un-clipped once the supporting figures took the ported icon size, so the
composition makes the widget's real capacity explicit rather than silently
truncating the forecast against the frame's edge. The widget's declared minimum span
is unchanged (W6: no schema, no profile change).

*Alternatives.* Raising the widget's minimum span was rejected for the ripple above;
keeping the forecast and letting the frame clip was rejected because the wall's
"Panel Fit" guarantee forbids a promised widget clipping its own content.

## Risks / Trade-offs

- **Two guarantees move** (the 18 px body floor becomes 12 px and the label tier
  14 px; the frame inset 16 px becomes 10 px, which re-derives every floor) →
  modified in the spec explicitly with its own scenarios, and every derived number
  is computed in code and asserted by tests. The visual check is the harness.
- **One panel now renders smaller supporting text** → the readout values are
  untouched, so what is read at distance is unchanged; if the harness shows the
  labels unreadable at the wall's distance, the two sizes are raised above
  Mushroom's while the anatomy stays — a small, local change.
- **A wide blast radius across the wall's tests** → the vocabulary, the ramp,
  the frame geometry and each widget have their own test files, so the change can
  land widget by widget with the suite green at every step.
- **A device whose humidity the author does not want shown gets it anyway** →
  accepted deliberately (W5): the reading is the device's, and the escape is to
  bind a different device rather than to encode the same fact twice in a profile.
- **Two declaration sites for the ported table** (`wall/cards/metrics.ts` and the
  `--hearth-card-*` tokens, plus the design-system page) → unchanged by this
  change, and already asserted by `wall-tokens.test.ts`; the new widget parts
  consume `WALL_CARD_METRICS` rather than adding literals.

## Migration Plan

No data migration: the profile contract, its version and the schemas are
unchanged (W6), so a stored wall renders the same composition in the new
vocabulary.

1. **The vocabulary first**: the ported module gains the widget parts, and
   `card-vocab.tsx` retires with every consumer repointed, so the suite is green
   before any widget is recomposed.
2. **The widgets**, group by group (the ambient readouts, then the control
   widgets), each with its own test updated.
3. **The frame, the band and the wall chrome**, including the frame inset
   re-derivation and its dependent floors.
4. **The ramp's floor and label tier**, with the design-system page moved in the
   same step (the page's own tests read it as a declaration site).
5. **The temperature widget's humidity**, with the harness fixture's sensor
   gaining a humidity capability so both the present and absent cases are walked.
6. **The changeset and the documentation**, then the verification gate.

Rollback: revert the change. Nothing persisted changes shape, so there is no
state-file step.
