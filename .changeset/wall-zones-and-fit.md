---
"@ts-ha/shared": minor
"@ts-ha/web-ui": minor
---

Give the wall zones, span-aware cards, cross-wall navigation, and a fit rule
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
