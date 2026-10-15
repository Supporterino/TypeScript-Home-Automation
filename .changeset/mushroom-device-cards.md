---
"@ts-ha/shared": minor
"@ts-ha/core": minor
"@ts-ha/web-ui": minor
---

Replace the wall's single generic device card with one typed card per device class,
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
