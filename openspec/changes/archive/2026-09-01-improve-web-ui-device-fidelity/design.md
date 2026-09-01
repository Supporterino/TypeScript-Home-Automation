## Context

See proposal.md — Why. Three constraints shape the approach.

**The vocabulary was built to be source-neutral, and it is — but incompletely.**
`2026-08-27-rebuild-web-ui` D22 established `src/types/capabilities.ts` as a
neutral vocabulary that four sources map into. That decision holds. What it did
not settle is *value* neutrality: `valueType: "boolean"` names a type without
naming an encoding, and the four sources disagree.

```
  z2m exposes        state: "ON"    ──┐
  shelly (authored)  on: true       ──┼──► valueType: "boolean" ──► consumer
  nanoleaf           on: true       ──┤     (encoding lost here)     guesses
  state toggle       on: true       ──┘
```

The information exists at the boundary — z2m publishes `value_on`/`value_off` on
every binary expose — and `mapZ2MExpose` drops it (`capabilities.ts:168` reads
`values` but never `value_on`/`value_off`). The one consumer that works today,
HomeKit, works because it carries a private special case
(`homekit-descriptor-factory.ts:121,128`) keyed on `property === "state"`. The
web UI never got one. So this is not a new abstraction; it is finishing D22.

**The `kind` field is already a cross-source contract, and the UI ignores it.**
`shelly-capabilities.ts:18-20` states this outright: `kind` is `"switch"` or
`"outlet"` *"mirroring the same distinction Zigbee2MQTT's own `exposes` makes —
so a HAP projection can tell the two apart without any Shelly-specific
knowledge."* `nanoleaf-source.ts:41` and `state-source.ts:37` author `"switch"`
for the same reason. Tile ranking (D16) was built purely on property names and
never consulted `kind`, which is why its enum/numeric fall-through cannot tell a
light from a motion sensor's sensitivity setting.

**No browser test harness.** D23 stands: components are not rendered in tests, so
every decision worth verifying has to sit in a pure module under `app/lib/` that
`bun test` can reach. That constrains where this change is allowed to put logic.

## Goals / Non-Goals

**Goals:**

- Extend the vocabulary with boolean encoding, and route both the read and write
  paths through it — the write path is confirmed broken, not merely cosmetic.
- Make `kind` the single mechanism behind both the ranking guard and the output
  filter, rather than two independently maintained lists.
- Bring the room view onto the dashboard's layout without inventing a second tile
  component.
- Keep every new decision in a pure, testable module.

**Non-Goals:**

- Collapsing HomeKit's private `readOnOff`/`writeOnOff` into the new fields. See
  R3.
- Normalising Zigbee's `"ON"`/`"OFF"` away at the source boundary. Rejected in D2
  below.
- Any change to the SSE event shape, the REST surface, or persisted state.
- Fixing the `undefined`-lingering defect recorded in proposal.md — Impact.

## Decisions

### D1. Boolean encoding is declared per capability, not inferred per source

`Capability` gains two optional fields carrying the values a boolean property
uses for on and off. They are optional because only `valueType: "boolean"`
capabilities have anything to say, and because an absent declaration must keep
meaning "a real JSON boolean" — that is what three of the four sources already
produce, and what every existing test and consumer assumes.

The defaulting rule is therefore: absent ⇒ `true`/`false`. Zigbee populates them
from the published schema; Shelly, Nanoleaf, and the state source declare them
explicitly rather than relying on the default, so that the declaration is present
uniformly in descriptors and a reader never has to know which sources bothered.

The interpretation and composition rules go in one pure helper — read a reported
value to a boolean, and compose a command value from a boolean — used by
validation and the UI alike. Two call sites implementing the same rule from the
same fields is how the HomeKit special case happened.

Alternative considered: a `booleanEncoding: "boolean" | "on-off-string"` enum.
Shorter, but it enumerates encodings centrally, which is exactly the
source-coupling D22 removed — a source with `"1"`/`"0"` would require editing the
neutral module. Carrying the two literal values costs nothing more and closes the
set.

### D2. Zigbee keeps reporting `"ON"`/`"OFF"`; only the description gets richer

The tempting fix is to normalise at `zigbee-source.ts`, so every descriptor
carries real booleans and the vocabulary needs no new fields. Rejected.
`DeviceState = "ON" | "OFF"` (`src/types/zigbee/common.ts:13`) is load-bearing
across `src/automations/` and `src/core/devices/`, and automations read MQTT
payloads directly rather than through descriptors. Normalising descriptors alone
would put two encodings in play for the same device depending on which API you
read it through — strictly worse than one honest encoding plus a declaration.

The rule this settles: **describe the wire, do not launder it.**

### D3. `command-validation` validates against the declaration, not a convention

`command-validation.ts:58` currently accepts a boolean or the literals `"ON"`/
`"OFF"` for any boolean capability, with a comment acknowledging it as a
Zigbee special case. With D1 in place this becomes: accept a real boolean, or
either of the two values this capability declares. A Shelly `on` property will
then correctly reject `"ON"` — which today it accepts and silently mishandles.

Real booleans stay accepted regardless of declared encoding, so existing callers
(HomeKit, automations, the API) do not break; the source translates. This keeps
the change additive at the boundary while making the UI's outgoing commands
precise.

### D4. One `kind` set drives both the ranking guard and the filter

A single exported set — `light`, `switch`, `outlet`, `cover`, `fan`, `lock`,
`climate` — in `capability-ranking.ts`, used twice:

```
  OUTPUT_KINDS
      │
      ├─► selectPrimaryAction: the enum/numeric fall-through fires only when
      │   the candidate capability sits within an output-kind capability
      │
      └─► filter predicate: a device is operable iff it declares a capability
          of an output kind (equivalently: iff it would offer a primary action)
```

The ranked branches above the fall-through (`on`/`state`, `position`,
`brightness`, setpoint) are **not** gated. Those property names are already
specific enough that a false positive is implausible, and gating them would break
a source that authors a flat capability list without a container — which
`state-source.ts` very nearly does.

Deriving the filter from the same set is what makes the spec's guarantee true:
a device hidden by the filter is exactly one that would not have offered a
primary action. Two separately maintained lists would drift and produce the
absurd result of a device that is filtered out yet has a working control.

Alternative considered: dropping the enum/numeric fall-through entirely. Simpler,
but it removes the tile control from a device whose only actuation is a discrete
choice — a Nanoleaf-style effect selector — which the spec now explicitly
protects.

### D5. The filter is session state in the view, not app state

Session-scoped and reset-on-reload (per the spec) means plain React state. It
does not belong in `data-store.tsx`, which holds server-derived data; it does not
touch `StateManager`, which persists. Placing it in the view that owns the
collection keeps the data layer honest about what it is.

The predicate itself is pure and lives beside the ranking it derives from, so it
is testable under D23 even though the toggle that drives it is not.

### D6. `DeviceTile` grows one optional slot and one unavailable variant

Rather than RoomView wrapping tiles in a `Group` (which is what forces today's
list at `RoomView.tsx:151`), the tile itself takes an optional action node
rendered in a corner, and an optional unavailable mode.

```
  before                              after
  ┌──────────────────┬───┐            ┌──────────────┐
  │ Group            │ X │            │ DeviceTile   │◄─ action slot (opt.)
  │  └ DeviceTile    │   │            │              │
  │    (maxWidth 260)│   │            └──────────────┘
  └──────────────────┴───┘            in a SimpleGrid, same cols as Dashboard
```

Two reasons to put it on the tile rather than in a RoomView wrapper. First, the
tile already owns its entire surface as a click target with a `stopPropagation`
island around its control — a sibling overlay would have to reproduce that, and
get it right a second time. Second, the unavailable variant has to be the same
component or the grid will contain two visually unrelated shapes; once the tile
handles that, the slot is nearly free.

The unavailable variant renders the qualified identifier and an unavailable
marker with no control and no state readout — preserving the existing "stale
state is not presented as current" guarantee that `RoomView.tsx`'s own header
comment already calls out, now through the shared component instead of around it.

### D7. Edit mode is room-level and explicit

One toggle on the room reveals the removal action in every member tile's slot,
including unavailable members. Not hover-reveal: this dashboard is a PWA
(`web-ui` spec — PWA Support) and hover does not exist on the primary device.
Not per-tile: a per-tile disclosure is the same always-present chrome the spec
now forbids, one indirection deeper.

Edit mode is local component state, discarded on navigation. Nothing about it is
worth persisting.

## Risks / Trade-offs

**[R1] The declared encoding might be absent where it matters.** A z2m binary
expose is *not* strictly guaranteed to publish `value_on`/`value_off`, and a
device omitting them would fall back to the `true`/`false` default and stay
broken — the exact bug, narrowed rather than fixed. → The mapper preserves them
only when present; the D1 helper's default is explicit and tested. Verify against
the real device set before closing the change; if omission turns out to be
common, the fallback for the Zigbee source specifically becomes `"ON"`/`"OFF"`
rather than `true`/`false`, which is a one-line change to the mapper and no
change to the vocabulary or the spec.

**[R2] Optional fields mean two code paths forever.** Every boolean read now has
a declared branch and a default branch. → Both live behind the single helper from
D1; no consumer sees the branch. The alternative — mandatory fields — would be a
breaking change to a vocabulary with four implementors and a published type.

**[R3] HomeKit now has a redundant, subtly wrong special case.**
`writeOnOff` keys on `property === "state"`, so a future source using string
encoding on a differently-named property would be mishandled there. → Recorded as
an explicit non-goal, not forgotten. HomeKit's behaviour is unchanged by this
change and its tests keep passing; collapsing it is a follow-up that can be done
under the existing HomeKit test coverage rather than bundled into a UI change.

**[R4] `kind` values are not a closed set.** They are source-authored strings.
A source could author `"lamp"` and be silently filtered out. → The set is one
exported constant in one module, and the three authored sources
(`shelly-capabilities`, `nanoleaf-source`, `state-source`) are in this repository
and already use the z2m vocabulary deliberately. A mismatch is a visible bug in a
tested module, not a silent data problem.

**[R5] The output filter can empty a collection.** Filtering a sensor-only room
leaves it blank, which reads as a loading failure. → The filtered-empty state
needs its own message distinct from the genuinely-empty one. Called out in tasks.

**[R6] Ranking changes are visible on every existing dashboard.** Devices that
today show a config dropdown will change appearance. That is the intent, but it
is not a silent change. → Covered by `capability-ranking.test.ts`, which already
exists and gets cases for the sensor-with-writable-setting shape.

## Migration Plan

No data migration. No persisted-state or API shape changes. `Capability` gains
optional fields, so a descriptor serialised by an older build deserialises
unchanged and falls back to the `true`/`false` default.

Sequence, each step independently shippable:

1. Vocabulary + mapper + validation (server, fully unit-tested).
2. Sources declare their encoding explicitly.
3. Web UI boolean read/write through the helper — **this is the step that fixes
   the reported bug**; verify against real hardware here, before continuing.
4. Ranking guard + filter predicate + filter controls.
5. Tile slot, unavailable variant, room grid, edit mode.

Rollback is per step; steps 4 and 5 are pure presentation and revert cleanly on
their own.

## Open Questions

- Whether `climate` belongs in `OUTPUT_KINDS` for the *filter* as well as the
  ranking guard. A thermostat is operable, so it should — but a
  read-only temperature-only `climate` container would then survive a filter
  whose promise is "devices you can operate". Answerable from the real device set
  during step 4 without touching the specs: the requirement names thermostats as
  visible, and a read-only climate container declaring no writable property is
  arguably a source-side description bug either way.
