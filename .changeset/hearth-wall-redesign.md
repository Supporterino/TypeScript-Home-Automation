---
"@ts-ha/core": minor
"@ts-ha/shared": minor
"@ts-ha/web-ui": minor
---

Redesign the wall display on **Hearth** and add a temperature widget and cover
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
