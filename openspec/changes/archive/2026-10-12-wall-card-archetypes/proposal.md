## Why

The wall renders one uniform tile template for every device, so a lamp, a
temperature sensor, a shutter, and a scene button all look structurally
identical — dominated by a connectivity chip, wrapped in double chrome, with the
least design effort spent on the biggest actions. The result reads as noisy,
boxy, and undifferentiated from across a room, which defeats the wall's
glanceability goal. The clock and weather already prove the fix: drop the chrome
and let the content lead.

## What Changes

- **De-nest the card chrome.** A device tile rendered inside a wall widget frame
  no longer draws its own surface, so a card is one surface, not a tile inside a
  tile inside the panel. (Rooms, favorites, and single-device widgets are all
  affected.)
- **Capability-driven card archetypes.** The wall selects a card shape from the
  device's ranked capabilities rather than applying one template:
  - **Light** — a brightness control (slider with a persistent `%` readout)
    **and** an on/off toggle coexisting on one card. This is a deliberate,
    wall-only departure from MASTER's "one dominant primary action" rule.
  - **Sensor** — a borderless readout card: one large value and one quiet label,
    with no control surface and no observation chip.
  - **Shutter** — transport buttons (open / close / stop) replacing the position
    slider. Open and close write `position`; **stop is progressive** — shown only
    when the device declares a writable transport property (Zigbee covers that
    advertise a writable `state` enum), and omitted on sources that cannot stop
    (Shelly covers expose `state` read-only).
- **Demote the observation channel.** The push/polled/stale/unreachable state is
  kept as a non-color channel (icon shape + token) but reduced to a quiet
  indicator with no `live` / `polled · 3m` text, so it stops competing with the
  card's control. The spec's requirement to distinguish these states is
  preserved; only the visual weight changes.
- **Redesign the scene button** as a full-bleed, pressable surface with a large
  icon and label and a clear active/pressed state, proportionate to the action
  it performs.
- **Human-readable device names.** Present a device's name as a readable label
  (e.g. `livingroom_couch` → "Livingroom Couch") wherever a name is shown —
  dashboard and wall — instead of the raw identifier. The raw identifier stays
  the wire value; only presentation is normalised.
- **Two-column wall configure screen.** The editor's widget list becomes a
  responsive multi-column grid (one column narrow, two on wide screens) so a
  profile with many widgets is scannable without excessive scrolling.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `wall-display`: the "Wall Device Presentation" requirement is extended to
  define capability-driven card archetypes (light with both a toggle and a
  value control, borderless sensor readout, shutter transport with progressive
  stop), and to demote the observation channel to a non-textual indicator while
  still distinguishing push/polled/unreachable. The "Wall Glanceability"
  requirement's control-surface expectation is clarified so a nested device
  tile renders a single, not doubled, surface. The "Wall Configuration Editor"
  requirement gains a dense, multi-column widget layout.
- `web-ui`: a new "Device Name Presentation" requirement defines the readable
  name derived for display, applied wherever a device name is presented
  (dashboard tiles, detail view, room membership, and selection controls).

## Impact

- **Web UI (`packages/web-ui/src/app/wall/`)**: `WidgetFrame` (single-surface
  rule), `WallDeviceTile`, the `device`/`room`/`favorites` widgets, and
  `SceneWidget`.
- **Web UI (`packages/web-ui/src/app/components/`)**: `DeviceTile`
  (a "contained"/nested mode so it omits its own surface; archetype dispatch)
  and `CapabilityControl` (transport control for covers).
- **Design system**: `design-system/ts-ha/pages/wall.md` gains the card-archetype
  grammar and the wall-only two-control rule-break; `MASTER.md`'s Device Tile
  rule is referenced, not changed.
- **Web UI (`packages/web-ui/src/app/`)**: a pure `humanizeDeviceName` helper
  and its use at every name presentation — tiles, `DeviceDetailView`, room
  membership, and device/room select options.
- **Web UI (`packages/web-ui/src/app/wall/editor/`)**: `WallEditor` widget list
  becomes a responsive multi-column grid.
- **No core/shared contract change**: names stay raw on the wire; stop is
  progressive, so the existing capability schema (`position` writable, `state`
  enum) is sufficient. Zigbee covers that advertise a writable transport enum
  already pass command validation; Shelly covers simply hide stop.
- **Tests**: wall widget/tile tests and any asset/first-paint gates are
  unaffected structurally; new archetype selection is asserted by unit tests.
