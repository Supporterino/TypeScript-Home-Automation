## Context

See `proposal.md` — Why. What shapes the approach is that the wall currently has
no card of its own: it borrows the dashboard's.

- `packages/web-ui/src/app/components/DeviceTile.tsx` draws every device from a
  ranked capability set, and its `wall` branch is a second presentation of the
  *same* component (`lib/card-archetype.ts` → `light | toggle | cover | readout |
  default`). `wall/registry.ts` offers one `device` widget type pointing at any
  device, and `wall/widgets/WallDeviceTile.tsx` only translates props into it.
- So the wall cannot change how a light looks without changing how a cover looks,
  and every visual decision is a branch inside one 1800-line file.

The port target is `piitaya/lovelace-mushroom` (Apache-2.0). Its cards are
`LitElement` classes bound to Home Assistant's frontend — `src/cards/light-card/light-card.ts`
extends `MushroomBaseCard`, reads a `hass` object, and renders `mushroom-*` and
`ha-*` custom elements — so they cannot be imported. What *can* be ported exactly
is the anatomy (`src/shared/state-item.ts`, `src/shared/shape-icon.ts`,
`src/shared/slider.ts`) and the token table (`src/utils/theme.ts`), which this
design does verbatim.

Two constraints from the existing code:

- **The capability vocabulary is open and source-derived.** `Capability.kind` is
  a `string` (`packages/shared/src/capabilities.ts`) and each source supplies its
  own labels: the Zigbee mapper passes an expose's own type through
  (`packages/core/src/zigbee/z2m-mapper.ts`: `kind: type`), Shelly emits its
  component kinds (`device-sources/shelly-capabilities.ts`), Nanoleaf synthesises
  `light`/`switch`/`numeric`/`enum`. The wall's card set must therefore be keyed
  by a device's *capability profile*, not by a Home Assistant domain.
- **Profiles are persisted by core.** `packages/core/src/wall-manager.ts` writes
  `version` from `WALL_PROFILE_VERSION`, the schema pins it as a literal
  (`packages/shared/src/wall-schema.ts`), and `/api/walls` is served from
  `packages/core/src/http/http-server.ts`. A version bump is therefore a
  shared-contract *and* a core change.

The tile-inflation defect being absorbed (`redesign-wall-light-card`) is already
described in the proposal; its surviving code is live in the tree
(`wall/pages.ts`, `wall/span.ts`, `wall/widgets/PagedTileGrid.tsx`).

## Goals / Non-Goals

**Goals:**

- Each device class has a card of its own, composed from Mushroom's anatomy and
  Mushroom's own metrics, so the wall reads as a designed card system.
- The catalogue a profile can place matches what the device model can actually
  drive, and the gap is named rather than discovered later.
- No saved wall profile is lost by the contract change.
- The card lives in the lazy wall chunk; the dashboard's rendering and its
  first-paint budget are unchanged.

**Non-Goals:**

- Reaching Mushroom's HA-domain classes whose capabilities this codebase cannot
  express (media player, vacuum, person, alarm control panel, update, humidifier).
  They are catalogued as pending, with the source work named, not built here.
- Porting Mushroom's action or info configuration.
- Any dashboard change, or a single device presentation shared by both surfaces.

## Decisions

### D1 — One widget type and one card per device class; the generic card retires on the wall

Each device class the capability model can drive gets a widget type and a card
module under `wall/cards/` (`LightCard.tsx`, `CoverCard.tsx`, `EntityCard.tsx`,
`ClimateCard.tsx`, `FanCard.tsx`, `LockCard.tsx`, `NumberCard.tsx`,
`SelectCard.tsx`). `lib/card-archetype.ts` and `wall/widgets/WallDeviceTile.tsx`
retire, and `DeviceTile`'s `wall` presentation mode — its `size="wall"` branch and
the `wallTier` / `wallCardForm` / `wallLightForm` props — goes with them, leaving
the shared tile dashboard-only and simpler. The dashboard's Lumen rendering is
untouched.

*Alternatives.* Keeping the archetype system and adding "per-type" wrappers around
it leaves the branch pile in place and keeps the wall's card presentation hostage
to the dashboard's. Keeping the generic card for the *tiles* (room, favorites,
device grid) while only the placed widget is typed was rejected: the tiles are the
same cards, and the capture's ugly light control was a tile.

*Consequence to state plainly.* The wall and the dashboard now render a device
differently on purpose. That is the cost of the wall having its own card system,
and it is the same divergence the two surfaces already have in tokens.

### D2 — The anatomy and the metrics are ported literally

Mushroom's card tree, reproduced for the wall:

```
card surface                       radius 12px, padding 10px
+-------------------------------------------------------------+
| ( icon )   Primary text                                       |  state item:
|  36x36     Secondary text                                     |  row, gap 10px
|  circle                                                       |
+-------------------------------------------------------------+
| [ ========== active control ========== ] [btn] [btn]          |  actions row:
+-------------------------------------------------------------+  gap 12px,
                                                                  padding 12px (top 0)
```

The token table is ported verbatim from `src/utils/theme.ts` and
`src/shared/state-item.ts` / `shape-icon.ts` / `slider.ts` / `card.ts`:

| Token | Mushroom default | Replaces on the wall |
|---|---|---|
| icon size / glyph | 36 px / 24 px (`0.667em`) | 56 px affordance, 26 px glyph |
| icon shape | circle (`border-radius: 50%`) | `--hearth-radius-pill` on a bordered button |
| primary text | 14 px / 500 / 20 px / 0.1 px tracking | ramp title / label tiers, uppercase |
| secondary text | 12 px / 400 / 16 px / 0.4 px tracking | ramp band tier |
| control height | 42 px (`--control-height`) | 56 px touch target |
| control radius | 12 px | `--hearth-radius-sm` (10 px) |
| control spacing | 12 px (`--control-spacing`) | 8 px floor |
| card padding / gap | 10 px (`--spacing`) | `--hearth-space-4` (16 px) |
| card radius | 12 px (HA `--ha-card-border-radius`) | `--hearth-radius-md` (16 px) |
| slider | 42 px tall, 12 px radius track, 10 px bar thumb | native range chrome, large knob |

*Alternatives.* Porting Mushroom's *look* onto the wall's existing metrics would
keep the 56 px/18 px floors (no spec change) and would not match what was asked
for. Porting the metrics while keeping the wall's type ramp was rejected: the ramp
is the largest part of why the current card reads as a control panel.

*Trade-off, recorded rather than hidden.* Two `wall-display` guarantees are
lowered: the kiosk-class **56 px** minimum touch target becomes Mushroom's **42 px**
control height, and the **18 px** body floor becomes Mushroom's **12 px** secondary
and **14 px** primary. At three metres this is materially smaller text and a
smaller drag target. The harness is the check, and the requirements are modified
explicitly rather than left to disagree with the code.

### D3 — The catalogue is keyed by capability profile, with the pending rows named

The wall offers a widget per class whose capabilities this codebase's device model
can express today, and a typed `entity` card as the fallback — the wall's
equivalent of Mushroom's own generic card, so "no generic card" does not mean "no
answer for an unclassified device":

| Mushroom card | Wall widget | Driven by | Status |
|---|---|---|---|
| light | `light` | `kind: "light"` (brightness, colour temperature, colour) | in scope |
| cover | `cover` | `kind: "cover"`, or a writable position / transport enum | in scope |
| fan | `fan` | `kind: "fan"` (percentage, presets) | in scope |
| climate | `climate` | `kind: "climate"` (setpoint, mode) | in scope |
| lock | `lock` | `kind: "lock"` | in scope |
| number | `number` | a writable numeric with a range | in scope |
| select | `select` | a writable enum with permitted values | in scope |
| entity | `entity` | any device: name + state, toggle on tap where actuatable | in scope (fallback) |
| switch | `entity` | `kind: "switch"` / `"outlet"` | in scope via `entity` |
| media player | — | no capability kind today | pending |
| vacuum | — | no capability kind today | pending |
| person | — | no capability kind today | pending |
| alarm control panel | — | no capability kind today | pending |
| update | — | no capability kind today | pending |
| humidifier | — | no capability kind today | pending |

A widget of a class the bound device's capabilities cannot drive MUST report that
inside its own area rather than rendering an inert card, which is how the pending
classes behave today.

*Alternatives.* Building the six pending cards against an assumed capability shape
was rejected: they would ship untestable against real devices. Extending the device
sources so all fourteen classes are expressible is a core device-model change and
belongs in its own change, named here so it is not lost.

### D4 — The ported numbers are Hearth tokens whose values come from Mushroom

The metric block is declared in `wall/hearth.css` beside the existing tokens
(`--hearth-card-icon-size: 36px`, `--hearth-card-primary-size: 14px`, …), with the
source recorded in the comment and a mapping table on the design-system page.

*Alternatives.* Naming them `--mushroom-*` would make the lineage unmistakable and
future syncs mechanical, at the cost of a second naming vocabulary inside a system
that documents one. Hearth names win; the lineage is documented instead.

### D5 — The floors are re-derived, not re-chosen

Mushroom's small light card measures `10 + 36 + 10 + 42 + 12 = 110 px` with its
controls shown (card padding, icon row, actions row). The wall's row unit is
derived from its smallest device card exactly as today
(`wall/grid.ts`: `WALL_COMPACT_CARD_HEIGHT_PX = rows · control + 2 · inset`, then
`ROW_UNIT_MIN = (card - gutterFloor) / deviceMinRows`):

```
today:  2·56 + 2·8 = 128,  ROW_UNIT_MIN = (128 - 16) / 2 = 56
ported:         110,        ROW_UNIT_MIN = (110 - 16) / 2 = 47
```

with the ceiling re-chosen so a two-row device cell does not inflate a 110 px card
(proposed 52–56, settled against the harness). The tile cell
(`wall/pages.ts`), the paging density, the editor's span floors
(`wall/span.ts`'s `WALL_TITLE_ROWS` and `composesMinimumSpan`), and the harness
fixtures all follow from those two numbers, which is why they are derived in code
and asserted by tests rather than written down here.

### D6 — Per-card configuration is `layout` and `collapsible_controls`

Each typed device widget's config carries its bound device plus Mushroom's two
meaningful options: `layout` (`default` | `vertical` | `horizontal`) and
`collapsible_controls` (hide the actions row while the device is inactive).
Mushroom's `tap_action` / `hold_action` / `double_tap_action` are not ported — the
wall has no more-info surface and never hovers — and `primary_info` /
`secondary_info` / `icon_type` are not ported either, so a card always draws its
device's name and state.

### D7 — Device colour uses Mushroom's contrast improvement

`improveColorContrast` (`src/cards/light-card/utils.ts`) is ported as a pure
helper: a colour whose saturation is under `0.4` is raised to `0.4`, and one below
`0.1` has its value pushed to `225` instead. It is drawn as the icon glyph colour
over a `25 %`-alpha fill of the same colour, and as the slider's colour over a
`20 %`-alpha background — Mushroom's own treatment.

*Alternatives.* The wall's own bounded-band helper (a saturation *ceiling* and a
lightness window) was invented during the superseded change and does the opposite
of Mushroom's intent: Mushroom keeps a light's colour vivid and makes it legible,
rather than muting it.

### D8 — The profile contract goes to version 2, and version 1 is migrated

`WALL_WIDGET_TYPES` becomes per-device-class; each type carries its own config
(bound device + `layout` + `collapsible_controls`). `WALL_PROFILE_VERSION` becomes
`2`; `wall-schema.ts` accepts a version-1 profile for migration and validates a
version-2 profile on write; `packages/core/src/wall-manager.ts` migrates on load —
a `device` widget becomes the typed widget for its device at the same placement
and zone, and a `devices` widget keeps its selection — so no saved profile is
lost. What migration does not carry over is a v1 `device` widget's optional
`title`: the version-2 typed config has no title field (D6 — a card always draws
its device's own name and state), so the label is deliberately dropped rather
than kept in a field the config does not have. The preservation the migration
guarantees is the spec's own list — each widget's placement, its size, its zone
label, and the devices it references — and a migrated widget binds the same
device.

*Alternatives.* Breaking outright was rejected: profiles are persisted and
authored, and the migration is mechanical. Deprecated aliases (keeping `device` and
`devices` as names that resolve at load time) were rejected as two names for one
thing, forever, in a contract that already carries a version.

### D9 — The tile hosts render the typed cards, and the tile sizing lands

`RoomWidget`, `FavoritesWidget` and `DeviceGridWidget` render the typed card for
each device instead of the generic tile, and each tile's composition is resolved
from the box the grid hands it. This absorbs the surviving work of the superseded
change: a tile row is bounded at `1.25 ×` the tile's own cell (never below it),
the widget centres the space its tiles do not use, and `PagedTileGrid` draws the
row height the page plan resolved rather than stretching it with `1fr`. Page
counts are unchanged by the bound — `tilesDown` still resolves from the pitch.

### D10 — The ported cards stay out of first paint

The cards live under `wall/` and are imported only by the wall registry, so they
land in the lazy wall chunk alongside Hearth, and the SHARED device tile loses its
wall branch rather than gaining one. `components/DeviceTile.tsx` stays first-paint
and becomes smaller. `packages/web-ui/tests/web-ui-assets.test.ts` continues to
assert that neither the wall chunk nor its stylesheet reaches first paint.

### Shared-contract and dependency impact

`wall.ts` and `wall-schema.ts` change (new per-type widget types and configs, a
version bump, a legacy-migration path), so `scripts/contract-inventory.json` and
`guard-contracts.ts` are both in play. `packages/core` gains the migration. The
dependency direction is unchanged — `shared` ← `core`, `shared` ← `web-ui` — and
no `core` ↔ `web-ui` edge is introduced; the wall still renders only from the data
it receives over the HTTP API.

## Risks / Trade-offs

- **Two guarantees are lowered** (56 px → 42 px touch, 18 px → 12/14 px text) →
  recorded as explicit `wall-display` modifications with their own scenarios, and
  checked in the harness on the panel the wall actually runs on. If the harness
  shows it is unreadable at distance, the fallback is to raise the two values
  above Mushroom's while keeping the anatomy — a small, local change.
- **A 42 px control with a 10 px bar thumb is a smaller drag target than the
  wall's current slider** → the actions row is the card's own height, the row is
  the touch target, and the control spans the card's width; the harness is the
  check.
- **Fourteen Mushroom classes, eight buildable** → the pending six are catalogued
  in the design and the spec's catalogue requirement, so the gap is visible and
  the source work has a home.
- **Eight cards is a lot of surface to land** → each card is an independent widget
  type and an independent task group, so the change can land incrementally with
  the tests green at every step.
- **A version-2 profile cannot be loaded by older code** → the migration is one
  way, as any persisted-shape change must be; the rollback is to revert the
  change and restore profiles from the state file's previous revision.
- **Licensing** → Mushroom is Apache-2.0 and this repository is GPL-3.0, which is
  the permitted direction; the ported values and anatomy are attributed in the
  design-system page and the repository's notices.

## Migration Plan

1. **Shared first**: the per-type widget types, their configs, `WALL_PROFILE_VERSION = 2`,
   and a schema that validates version 2 and still parses version 1.
2. **Core second**: `wall-manager` migrates a version-1 profile on load and writes
   version 2, with tests over a stored version-1 fixture (`packages/core/tests/`).
3. **Web UI third**: the registry and cards, then the editors, then the tile hosts.
   The editor reads and writes version 2 only.
4. **Then the absorbed tile sizing** (`pages.ts`, `PagedTileGrid`, the hosts).
5. Rollback: revert the change. Profiles already migrated to version 2 need the
   previous revision of the state file, since older code rejects version 2.

## Open Questions

- The row unit's exact ceiling after the re-derivation (the floor is derived: 47)
  is a density choice between roughly 52 and 56 px, settled by looking at the
  harness at 1920×1080. It changes no requirement and no task.
- Whether the six pending classes get one follow-up change that extends the device
  sources, or one change per class, is a planning question for after this lands.
