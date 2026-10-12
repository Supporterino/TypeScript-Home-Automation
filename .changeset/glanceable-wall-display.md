---
"@ts-ha/web-ui": minor
---

Make the wall surface glanceable from across a room.

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
