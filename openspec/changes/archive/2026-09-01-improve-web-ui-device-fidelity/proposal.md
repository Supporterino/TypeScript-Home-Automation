## Why

A Zigbee light shown in the web UI is always displayed as **on**, and toggling it
does nothing to the physical device. Zigbee2MQTT encodes a binary on/off property
as the strings `"ON"`/`"OFF"`, while Shelly, Nanoleaf, and state-toggle devices
encode it as a real boolean — yet all four declare the same `valueType: "boolean"`
in the shared capability vocabulary. The vocabulary states a property's *type* but
never its *encoding*, so the web UI reads `"OFF"` as truthy and writes a JSON
boolean the Zigbee transport ignores. The dashboard is therefore actively lying
about device state, which is the one thing a control surface must not do.

The same under-specification shows up a second way: `access.writable` conflates
"actuate this device" with "configure this device", so a motion sensor's
`sensitivity` dropdown is promoted to its tile's primary control, and the
dashboard offers no way to see only the devices a user can actually operate.

Separately, the room view never adopted the grid layout the dashboard already
uses, because a per-row unassign control forces a list.

## What Changes

**Device state fidelity**

- The capability vocabulary gains an explicit on/off encoding for boolean
  capabilities, so a source declares how its booleans appear on the wire.
- The Zigbee2MQTT expose mapper stops discarding `value_on`/`value_off` and
  carries them into the vocabulary.
- The web UI reads and writes boolean properties through the declared encoding
  instead of coercing with `Boolean(value)` and sending a raw JSON boolean.
- Command validation validates a boolean against the target capability's declared
  encoding rather than a hardcoded `"ON"`/`"OFF"` special case.

**Tile semantics**

- A source-neutral set of output-device kinds (`light`, `switch`, `outlet`,
  `cover`, `fan`, `lock`, `climate`) becomes the basis for two behaviours. This
  reuses the existing cross-source `kind` contract that Shelly, Nanoleaf, and the
  state source already author deliberately; it is not new vocabulary.
- Primary-action ranking no longer promotes an arbitrary writable enum or numeric
  to a tile's primary control unless that capability belongs to an output-kind
  capability. A motion sensor stops rendering a configuration dropdown as its
  primary control and renders its reading instead.
- Device collections gain a control to show only output devices. The preference
  is session-scoped and resets on reload.

**Room presentation**

- The room view renders its members as a grid matching the dashboard's, rather
  than a list.
- The device tile gains a generic optional action slot.
- Unassigning moves into a room-level edit mode that reveals the action in that
  slot, replacing the always-visible per-row control.
- An unavailable room member renders as a ghost variant of the device tile
  instead of a parallel bare-panel layout, preserving the existing guarantee that
  its stale state is not presented as current.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `device-sources`: **Rich Device Descriptor** — a capability describing a boolean
  property MUST declare the values representing on and off, so a consumer can
  interpret and command it without source-specific knowledge. **Command Dispatch**
  — a boolean command MUST be validated against the declared encoding rather than
  a fixed convention. **Zigbee Device Source** — the derived capability
  description MUST preserve the encoding the published schema declares.
- `web-ui`: **Device Tiles** — primary-action ranking MUST NOT promote a
  configuration property to a tile's primary control, and a device collection MUST
  offer a session-scoped filter to output devices only. **Device Control
  Interface** — a boolean control MUST reflect and command state through the
  capability's declared encoding. **Room Management Interface** — a room's members
  MUST be presented as a grid consistent with other device collections, and an
  unavailable member MUST use the same tile presentation in an unavailable state.

## Impact

**Affected code**

- `src/types/capabilities.ts` — `Capability` gains the boolean encoding fields;
  `mapZ2MExpose` populates them.
- `src/core/device-sources/command-validation.ts` — boolean validation reads the
  declared encoding.
- `src/core/device-sources/shelly-capabilities.ts`, `nanoleaf-source.ts`,
  `state-source.ts` — declare their (boolean) encoding explicitly.
- `src/core/web-ui/app/components/CapabilityControl.tsx` — boolean read/write path.
- `src/core/web-ui/app/lib/capability-ranking.ts` — output-kind set and the
  fall-through guard.
- `src/core/web-ui/app/components/DeviceTile.tsx` — action slot, unavailable variant.
- `src/core/web-ui/app/views/RoomView.tsx` — grid, edit mode.
- `src/core/web-ui/app/views/DashboardView.tsx`, `DevicesView.tsx` — filter control.

**Tests** — `tests/capabilities.test.ts`, `tests/capability-ranking.test.ts`,
`tests/device-source-zigbee.test.ts`, and the command-validation coverage extend
to the new behaviour.

**Not affected** — Automations continue to read and write `"ON"`/`"OFF"` directly
over MQTT; the `DeviceState = "ON" | "OFF"` type and every automation using it are
unchanged. This change adds a declaration alongside the existing wire format
rather than normalising it away.

**Explicit non-goal** — `homekit-descriptor-factory.ts` keeps its private
`readOnOff`/`writeOnOff` helpers, which key on `property === "state"`. Once the
vocabulary declares encoding, those become redundant and subtly over-narrow, but
collapsing them is deferred to keep this change reviewable.

**Known adjacent defect, not fixed here** — `device-event-bridge.ts` signals a
removed state property as an `undefined` value, which the web UI's data store
merges in rather than deleting, leaving a lingering `undefined` entry. Unrelated
to the reported symptoms; recorded so it is not lost.
