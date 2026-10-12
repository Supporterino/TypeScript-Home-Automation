---
"@ts-ha/web-ui": minor
---

Give wall device cards capability-driven archetypes instead of one template.

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
