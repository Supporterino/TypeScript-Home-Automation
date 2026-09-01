## Context

See proposal.md — Why.

The constraints that shape this design come from three places.

**The device model is source-neutral and deliberately narrow.** `DeviceSource`
(`src/core/device-sources/device-source.ts`) is five methods and a descriptor.
`AggregateDeviceSource` (`aggregate.ts`) owns a fixed set of four sources
constructed by `createEngine()`, holds no other dependency, and is explicitly not a
`ServiceRegistry` registration point. Anything added here has to justify widening
that.

**`list()` has five independent consumers**, and they do not want the same thing:

```
  http-server.ts:607              → web UI       wants hidden marked, not removed
  homekit device-catalog-source   → HomeKit      wants hidden removed
    :50 (start) and :127 (reconcile)
  device-event-bridge.ts:62, :91  → SSE          must see everything, or hiding
                                                  reads as disappearing
  room-manager.ts:198             → rooms        must see everything, or hiding
                                                  silently unassigns
  aggregate.ts:92, :110           → get/command  must see everything, or hiding
                                                  breaks automations
```

**Zigbee2MQTT groups break two assumptions the Zigbee source relies on.** A group
has no `ieee_address` — the identity `ZigbeeDeviceSource` was built around
(`zigbee-source.ts:152`) — and no `definition.exposes`, which is the input to
`validateCommand()`, to every UI control, and to
`createAccessoryFromDescriptor()`. `bridge/groups` gives only
`{ id, friendly_name, members: [{ ieee_address, endpoint }], scenes }`.

There is one existing pattern that fits the visibility half almost exactly:
`RoomManager` stores one reserved state key per device
(`$internal:room-assignment:<qualifiedId>`), which makes each change a single
write with no intermediate inconsistent state and yields a single-key SSE delta.

## Goals / Non-Goals

**Goals:**

- Present a Zigbee group as an ordinary device, so that nothing above the source
  layer needs group-specific handling.
- Make hiding a first-class, persisted, per-device preference that reaches both
  the web UI and HomeKit, and reaches neither automations nor reconciliation.
- Keep the choice between "all devices" and "visible devices" visible at each call
  site rather than buried in a default.
- Add no configuration and no dependency.

**Non-Goals:**

- Group management, source-neutral virtual devices, name-based device lookup, and
  derived hiding are out of scope; see proposal.md — What Changes.
- Group availability tracking. A group has no radio; `reachable` is `true`, the
  same fiction `ZigbeeDeviceSource` already tells (`zigbee-source.ts:159`).
- Group scenes. `bridge/groups` carries them; this change ignores them.
- Reworking `AggregateDeviceSource` into a registration point. It stays
  engine-owned; it just grows from four sources to five.

## Decisions

### D1. Groups are a fifth device source, not a second identity kind inside the Zigbee source

`ZigbeeGroupDeviceSource` with source id `zigbee-group`, sitting alongside
`ZigbeeDeviceSource`, both reading the same `DeviceRegistry`.

The alternative — `zigbee:group/5` inside the existing source — keeps the source
count at four and reuses one command path, but it means `toDescriptor()` branches
on two identity kinds, `findByIeeeAddress()` (`zigbee-source.ts:116`) needs a
group escape hatch, and `available` can no longer be a single boolean if groups and
devices ever diverge. The Zigbee source is currently 164 clean lines; this would
roughly double it with conditionals that exist only because two unrelated things
share a namespace.

A separate source costs one more entry in `createEngine()` and one more line in the
`aggregate.ts` header comment. Everything else — `parseQualifiedId`, room
assignment, the event bridge, HomeKit — already works per-source and needs no
change.

Both sources read the same registry rather than the group source reading the device
source. The group source needs member *capabilities* and member *state*, both of
which live on the registry, not on descriptors. Going through `ZigbeeDeviceSource`
would mean re-deriving from descriptors what the registry already holds.

### D2. Group identity is the numeric bridge id, and the friendly name is only ever a label or a topic

`id = String(group.id)`, so `qualifiedId = "zigbee-group:5"`. `displayName =
group.friendly_name`.

This is the same rule as IEEE identity for devices, for the same reason: a rename
in the Zigbee2MQTT frontend must not detach a room assignment or a hidden flag.
Zigbee2MQTT assigns group ids and keeps them stable across renames.

The friendly name is still needed — it is the MQTT topic a group command publishes
to (D5) — but it is looked up from the tracked group at command time, never stored
as identity.

Accepted cost: `zigbee-group:5` is opaque. An automation author has to look the id
up. That is exactly the ergonomic gap a `devices.byName()` resolver would close,
and it is deliberately deferred (proposal.md — out of scope) rather than solved by
weakening identity.

### D3. Group capabilities are the intersection of member capabilities

For each property every member declares, with compatible `valueType` and `access`,
emit one capability. Numeric `range` is intersected (`[max(min), min(max)]`); a
range intersection that is empty drops the property. `permittedValues` for enums is
intersected. A property absent from any member is absent from the group.

Union is closer to what the transport does — Zigbee2MQTT multicasts and incapable
members ignore what they cannot do — but a declared capability is not a hint here.
It is the input to `validateCommand()`, which will *accept* the command, and to
`CapabilityControl.tsx`, which will *render a slider*, and to
`createAccessoryFromDescriptor()`, which will *tell HomeKit the accessory supports
it*. Declaring colour on a group where two of three bulbs are white is a promise
three subsystems will make on the user's behalf and only the bulbs will break.

For the motivating case — one lamp, three identical bulbs — intersection and union
are the same set. Intersection only costs anything on a deliberately mixed group,
where the member's own detail view remains the place to use the property the group
cannot offer (web-ui spec, "A capability only some members have is absent from the
group").

A group whose members share nothing yields `capabilities: []`. It stays in the
device list — omitting it would make a group the user created invisible with no
explanation — and HomeKit skips it through the existing "no supported capability"
path (`device-catalog-source.ts:100`).

Boolean encoding is the fiddly case: `valueOn`/`valueOff` must match across members
for the property to survive intersection. All-Zigbee members will agree
(`"ON"`/`"OFF"`), so this is a guard rather than a live concern, but it must be
checked or the group would declare one encoding and members would accept another.

### D4. Group state is derived from member state, not read from Zigbee2MQTT's group topic

Zigbee2MQTT publishes group state to `zigbee2mqtt/<friendly_name>`, but it is
*optimistic*: computed from commands the bridge sent, not from what the devices
reported. Subscribing to it would put an optimistic value next to the pessimistic
member values in the same list, and they would visibly disagree the first time a
bulb missed a command.

Derivation rules, from the tracked state the registry already holds:

```
  boolean   any-on     ON if any member is ON
  numeric   mean over members currently ON
  absent    omitted    if no member reports it
```

**any-on over all-on** because it is what Zigbee2MQTT itself reports, so the two
views of the same lamp agree and debugging stays sane. It also behaves correctly
for the operation people actually perform: turn the group off, all members go off,
group reads off.

**Mean over on-members, not over all members,** because a fixture with one bulb off
would otherwise read as dimmer than it looks. Slider position is the whole point of
the number; a value that tracks perceived brightness beats one that is arithmetically
purer. When the user drags the group slider, every member gets the same value and
the mean converges on it, so the rule is stable under its own commands.

**Omitted, not defaulted,** when no member reports the property — a default would be
indistinguishable from a real reading.

Wiring: `DeviceRegistry.onDeviceStateChange` is keyed by `friendly_name`
(`device-registry.ts:327`) while group members are IEEE addresses. The group source
maintains an IEEE → group-ids index rebuilt on each `bridge/groups` update, and
subscribes per member friendly name, resolving IEEE → friendly name through the
registry. A member state change recomputes only the groups containing it and
notifies for each.

Consequence worth naming: one bulb changing emits an event for the bulb *and* for
each group containing it. That is correct — both descriptors changed — and the SSE
diffing in `device-event-bridge.ts:36` keeps the payloads small.

### D5. A group command is published once, to the group's friendly name

`mqtt.publishToDevice(group.friendly_name, properties)`, after
`validateCommand(groupCapabilities, properties)`.

Multicast is the reason groups exist: one radio transmission, so the bulbs change
together rather than cascading visibly. Fanning out to N member commands here would
reproduce the visual artefact groups were invented to avoid, and would take N times
the airtime.

No optimistic state write. The group's state stays derived (D4), so the reported
value follows the members. This is consistent with how the Zigbee source already
behaves and means a member that missed the multicast is visible rather than papered
over.

### D6. Groups ride the existing registry snapshot

`device-registry.json` gains a `groups` key alongside `devices` and `states`,
governed by the existing `DEVICE_REGISTRY_PERSIST`. `load()` treats a missing
`groups` key as `[]`, so an existing snapshot loads unchanged.

Same rationale as devices persisting (design.md D6 of the web UI rebuild): a room
assignment pointing at `zigbee-group:5` must resolve on boot, not thirty seconds
later when the bridge republishes. A group briefly missing from its room on every
restart would be a visible flicker in the dashboard.

No new configuration. Groups and devices come from the same bridge and have the
same freshness characteristics; giving them a separate switch would be a setting
nobody has a reason to set differently.

### D7. Visibility is a reserved-state overlay keyed by qualified id, modelled on room assignment

New `DeviceVisibility` (`src/core/device-visibility.ts`), constructed with a
`StateManager` and a logger:

```
  $internal:hidden:<qualifiedId> → true      hidden
  key absent                                 visible
```

Written with `setInternal`, cleared with `deleteInternal`, enumerated with
`keysInternal(HIDDEN_PREFIX)`. Absence means visible, so unhiding deletes rather
than writing `false` and the store holds only what the user changed.

This is `ROOM_ASSIGNMENT_PREFIX` with a different value type, and inherits its
properties for free: one write per change with no intermediate state, persistence
and debouncing from `StateManager`, exclusion from the public state API
(`state-manager.ts:248`) and from the state SSE stream (`engine.ts:402`), and
recovery of the qualified id by slicing the prefix — which works because the
qualified id's own colon is inside the suffix (`room-manager.ts:215`).

Unlike `RoomManager`, `DeviceVisibility` does **not** take the device sources. It
never needs to enumerate devices — hiding an unknown qualified id is explicitly
allowed (device-visibility spec, "A device MAY be hidden before it is known") — and
keeping it device-free is what makes D8's ordering acyclic.

`DeviceVisibility` exposes `onChange(listener)` for D10.

### D8. The aggregate stamps `hidden`; the sources never see it

`DeviceDescriptor` gains `hidden: boolean`. Sources do not set it —
`ZigbeeDeviceSource` has no business knowing about a user preference stored in the
state manager — so `AggregateDeviceSource` takes a `DeviceVisibility` and stamps
the field on **all three** paths descriptors leave by:

```
  list()      → map(stamp)
  get()       → stamp
  notify()    → stamp before fan-out      ← the one that is easy to miss
```

`notify()` is the trap. Subscriber-delivered descriptors come straight from the
source and bypass `list()` entirely, so HomeKit and the event bridge would see
`hidden: undefined` on every live update while seeing the correct value on every
enumeration. Stamping in one place inside `notify()` (`aggregate.ts:132`) covers
it, and a test asserting `hidden` is present on a subscription delivery is the guard.

The alternative — leaving `DeviceDescriptor` alone and having the HTTP layer join
visibility on the way out — keeps the aggregate dependency-free, but then the
server's `DeviceDescriptor` and the type the web UI re-exports from it
(`web-ui/app/types.ts:12`) diverge, and the client has to maintain a second
`Map<qualifiedId, boolean>` alongside `roomAssignments` and join on every render.
One stamped field costs less than a permanent client-side join.

Ordering in `createEngine()` is acyclic because `DeviceVisibility` depends only on
`StateManager`:

```
  StateManager → DeviceVisibility → AggregateDeviceSource → RoomManager
                                     (+ five sources)         → HomekitService
```

`RoomManager` continues to take the aggregate and continues to use total
enumeration (D9), so its `getUnassignedDevices()` still returns hidden devices —
correct, because a hidden device must remain assignable.

### D9. Two enumerations, chosen at the call site — not one filtered enumeration

`list()` stays total. New `listVisible()` returns `list().filter(d => !d.hidden)`.

Filtering inside `list()` was the tempting one-line version and is wrong in three
places at once: `device-event-bridge.ts:91` would see a hidden device vanish and
emit `device_disappeared` forever, `room-manager.ts:198` would silently drop hidden
devices out of rooms, and `aggregate.get()` sharing the filter would break every
automation addressing a hidden device.

Putting a `hidden` flag on the descriptor and asking each of five consumers to
remember to check it is the opposite failure. `capability-ranking.ts:175-182`
already documents this exact hazard for the operable filter: "two independently
maintained rules would drift."

Two named methods make the choice explicit and greppable:

```
  list()          event bridge, room manager, get/command paths, HTTP
  listVisible()   HomeKit
```

HTTP uses `list()` deliberately — the web UI is the surface that must be able to
*unhide*, so it needs hidden devices in the payload and filters client-side (D12).
HomeKit is the only consumer that wants the set and never needs the complement,
which is why `listVisible()` has exactly one caller today and that is fine.

### D10. HomeKit subscribes to visibility directly

`DeviceCatalogSource` takes `DeviceVisibility` as a second dependency, calls
`devices.listVisible()` in `start()` and in `reconcileRemovals()`, and subscribes
`visibility.onChange` to re-run `addOrUpdate`/`reconcileRemovals` for the affected
device.

Without this, nothing tells HomeKit anything. `reconcileRemovals()` runs only from
`devices.subscribe()` (`device-catalog-source.ts:54`), which fires on device state
notifications. Hiding is a `StateManager` write and produces no device
notification, so a hidden device would linger in the Home app until it happened to
report something — indefinitely for a bulb the user just switched off, which is the
most likely thing to be hiding.

Rejected alternative: have `DeviceVisibility` synthesise a device notification
through `AggregateDeviceSource.notify()`. It is fewer moving parts and
`reconcileRemovals()` would just work, but it emits "this device changed" when no
device changed, which then leaks into `device-event-bridge.ts` as a spurious
`device_state` with an empty diff and into the SSE stream as a state event for a
device whose state is identical. An explicit observer says what actually happened.

Removal on hide goes through the same `sink.remove()` path as removal on
disappearance, freeing the accessory id, so unhiding recreates the accessory with
the same derived UUID and no re-pairing (homekit spec, "Unhiding restores the same
accessory").

### D11. `device_visibility` is its own SSE category

New event `{ type: "device_visibility", qualifiedId, hidden }`, emitted from the
engine on `DeviceVisibility.onChange`, added to the `StreamEvent` union on both
sides.

Reusing `device_appeared`/`device_disappeared` would be a lie the client then has to
un-tell: a hidden device is still enumerable, still commandable, still in its room,
and the client must keep its descriptor in order to render it under "show hidden"
and offer to unhide it. `device_disappeared` deletes it from the store
(`data-store.tsx:252`).

Riding the state-change stream is not available: `$internal:` keys are excluded
from it by design (`engine.ts:402`, realtime-events spec "Reserved State Keys Are
Not Streamed"), and punching a hole for one prefix would undo a deliberate
guarantee.

Single-device delta, mirroring `room_membership`. `applyEvent()` sets `hidden` on
the stored descriptor.

### D12. Reveal is session-scoped client state; hiding is server state

The web UI filters hidden devices out by default and offers a "Show hidden" toggle
next to the existing "Operable only" toggle, as plain `useState(false)` per view —
the same treatment `operableOnly` gets (`DashboardView.tsx:13`, design.md D5 of the
web UI rebuild).

The asymmetry is intentional and matches what each thing is. *Hidden* is a durable
statement about a device, shared across clients, so it lives in the state store.
*Revealed* is what one person is looking at right now, so it resets on reload and is
never sent anywhere.

Because the catalog payload carries every device with `hidden` (D9), reveal is a
pure client-side predicate flip with no refetch, and the hide/unhide action is
available from the tile and the detail view without the user ever seeing a qualified
id.

Empty-state handling reuses the existing `genuinelyEmpty` / `filteredEmpty`
distinction (`DashboardView.tsx:44-49`), extended to name hiding as the cause —
"a room reading 'no devices' when it contains three hidden ones is a bug report
waiting to happen" (web-ui spec).

### D13. Hiding is never derived from group membership

No automatic rule. Discovering a group leaves its members visible; the user hides
them if they want to.

A derived rule looks like it saves work for the motivating case and then needs an
exception immediately: a bulb can be in a group and still worth controlling alone,
a device can be clutter without being in any group, and a device in two groups has
no obvious answer. "Members hidden by default with a per-device pin to override" is
two interacting rules producing a three-valued flag, to save three clicks once per
lamp.

The explicit flag also generalises for free — the vibration sensor nobody controls
is hideable by the same mechanism — which a group-derived rule never would.

### D14. Group membership is metadata on the group, not a parent/child device model

The group descriptor carries no `children` and member descriptors carry no
`parent`. `DeviceDescriptor` stays flat.

A hierarchy in the device model would ripple into every consumer: rooms would need
a policy for assigning a parent versus a child, the event bridge would need to
decide whether a parent change implies child changes, HomeKit would need to know
not to bridge both. None of that buys anything the flat model does not already
give.

The web UI still needs to show membership — a user who hid the bulbs needs a route
back to one — so the group's *detail view* fetches its members by qualified id and
links to them. That is a presentation join over data the client already holds, not
a structural relationship. Membership reaches the client as a property of the group
device (member qualified ids), which is metadata the group source can supply
without changing the descriptor's shape for anything else.

## Risks / Trade-offs

**`AggregateDeviceSource` stops being dependency-free** → It gains one dependency,
`DeviceVisibility`, which itself depends only on `StateManager`. No cycle, and the
header comment's "engine-owned, not a registration point" claim is unaffected. The
alternative (D8) pushed a permanent join into the client.

**`notify()` misses the `hidden` stamp** → The failure is silent and asymmetric:
correct on enumeration, `undefined` on live updates. Mitigated by stamping in one
place and by a test that subscribes and asserts `hidden` is present on the
delivered descriptor.

**Intersection surprises a user with a mixed group** → A colour control they expect
is absent with no on-screen explanation. Mitigated by logging at discovery when
intersection drops a property, and by the group detail view linking to members
where the property is still available. Accepted rather than solved; union's failure
mode (a control that silently does nothing on two of three bulbs) is worse.

**any-on reads "on" for a lamp that is 90% off** → One stuck bulb keeps the group
reporting on, including in HomeKit, so "turn everything off" appears not to have
worked. This is Zigbee2MQTT's own behaviour, so at least the two agree, and the
member tiles show which bulb is the culprit.

**Averaged brightness is a value no member actually has** → The slider shows 132
when members are at 254 and 10. Dragging it sets both to the same value, so it
converges. `undefined` was the honest alternative and produced a slider with no
position that jumps on first touch.

**Group state fan-out amplifies events** → One bulb change emits for the bulb and
for every group containing it. Bounded by group count, and the per-event diff is
small. If it ever matters, the group recompute can be coalesced within a tick.

**HomeKit accessory churn on rapid hide/unhide** → Each toggle removes and re-adds
an accessory. `hap-nodejs` tolerates this and the UUID is stable, but a user
clicking quickly could produce visible flicker in the Home app. Not mitigated;
hiding is not a rapid-fire action.

**Member state resolution depends on two keys** → The registry keys state by
`friendly_name` while group members are IEEE. A rename between the group list
publish and the next device list publish leaves the group briefly unable to resolve
a member's state. It reports the property as absent rather than wrong (D4), and
resolves on the next `bridge/devices` publish.

**A hidden device is still in its room and still commandable** → A user may expect
hiding to be removal. Mitigated in the interface: hiding is presented as a viewing
choice, and the room's empty state names hiding as the cause (web-ui spec).

**Hidden state can accumulate for devices that never return** → `$internal:hidden:`
keys for permanently removed devices are never reaped. They are tiny and harmless,
and reaping risks unhiding a device whose bridge is merely down. `RoomManager` makes
the same trade for stale assignments (`room-manager.ts:179`).

## Migration Plan

No configuration changes. No new dependencies. Group persistence reuses
`DEVICE_REGISTRY_PERSIST`; an existing `device-registry.json` without a `groups`
key loads unchanged (D6).

Nothing is hidden by default, so an upgraded deployment behaves identically until a
user hides something. Groups appear as additional devices immediately, which is
additive — no existing device changes identity, and no room assignment is affected.

`DeviceDescriptor` gaining `hidden` is additive for consumers that read descriptors
and breaking only for code that *constructs* one, which in the published package
means a third-party `DeviceSource` implementation — and those do not set `hidden`
(D8), so the practical break is limited to code building descriptor literals in
tests. All in-tree sources and tests are updated in this change.

Rollback is a revert with no data migration: the `groups` key in the snapshot and
the `$internal:hidden:` keys in the state store are both ignored by the previous
version, which reads only the keys it knows. A user who had hidden devices sees
them all again after a rollback, and their flags are still there if they roll
forward.
