## Context

See `proposal.md` for motivation. The relevant current-state facts that shape
the approach:

- `ShellyService` models one registered name as one `ShellyDevice`, and every
  switch/cover RPC hardcodes `{ id: 0 }` (`shelly-service.ts:284,300,316,330,
  345,360,379,398,407,416,427,460,469`).
- `ShellyDevice` carries `{ name, host?, type, transport, topicPrefix? }` — no
  channel. `ShellyDeviceType = "switch" | "outlet" | "cover"` (shelly.ts:28).
- `ShellyDeviceSource.handleNotifyStatus` selects a single component key
  `device.type === "cover" ? "cover:0" : "switch:0"` and drops anything else
  (shelly-source.ts:213). A Pro 4PM publishing `switch:1..3` is silently
  ignored.
- `ShellyDeviceSource` keys its `tracked` map and MQTT subscriptions by
  `device.name` (shelly-source.ts:58-59), so it currently assumes one entry per
  registration; `list()`, `get()`, and `command()` all resolve devices by
  `device.name` straight off `shelly.getDevices()`.
- `ShellyService.register` fires `onDeviceRegistered` synchronously; the source
  consumes it via `addDevice`.
- HomeKit projects one accessory per descriptor via
  `homekit-descriptor-factory.ts`, choosing `Service.Switch` vs
  `Service.Outlet` from capability `kind` (line 340-345), and seeds each
  accessory UUID from `shelly:${descriptor.id}` (line 80).
- The `AggregateDeviceSource` already composes multiple sources and stamps
  `hidden`; qualified IDs are `qualifyDeviceId(sourceId, id)`.

The design therefore has to thread a channel through four layers (registration
→ RPC → source → descriptor/HomeKit) while leaving single-component devices
byte-for-byte compatible.

## Goals / Non-Goals

**Goals:**
- A multi-component device yields N logical devices, each independently
  addressable, described, controlled, and (optionally) visible in HomeKit.
- Single-component behavior, identities, and public method signatures are
  preserved.
- Channel addressing works over both HTTP and MQTT transports.
- Component discovery is best-effort and never blocks registration.

**Non-Goals:**
- Auto-assigning rooms/visibility or naming channels beyond a sensible default.
- Supporting component kinds beyond switch/outlet/cover (e.g. `light`, `rgbw`,
  `input` as a controllable entity, `devicepower`).
- Changing the transport model (still fixed per device, no fallback).
- Exposing an explicit component channel in the public `register()` API.
- Migrating persisted identity on a component rename (see D4).

## Decisions

### D1: One logical `ShellyDevice` per channel, materialized by the source

The physical registration is retained as the device's inventory/device-level
record. The **source** — the layer that already owns enumeration, identity,
state, and observation — runs component discovery and materializes **one
channel record per discovered channel** through an internal (non-public) path on
`ShellyService`. Channel records live in a **separate internal map**, not the
public `devices` map, so `getDevices()` keeps returning registrations only.
Each channel record records its `channel`; the service's command methods read
that channel and thread it into RPC `id`, so **no public method signature
changes**.

- Single-component device: the derived channel-0 id is the registration name,
  so the base registration *is* the sole channel entry — no duplicate, and
  existing identities and behavior are unchanged.
- Multi-component device: the base registration is kept only as the
  inventory/device-level record (`getDeviceInfo`, `reboot`, discovery) and is
  **not** enumerated as a logical device. The source adds one channel entry per
  component in its internal channel map; those entries are what
  `list()`/`get()`/`command()` expose. A command naming the base registration
  is rejected by the source (`not_found`) — the base is not a logical device,
  and only device-level queries resolve against it.
- `getDevices()` MUST remain the public registration-only view; channel records
  are internal to the service and never appear there.
- `onDeviceRegistered` fires once per public registration. The internal
  channel-registration path MUST NOT re-fire those listeners (and the source
  guards against re-entrancy), so discovery → registration cannot loop.
- Rationale: command threading falls out of identity — the channel entry's
  name is the lookup key and its `channel` becomes RPC `id`; per-channel state
  and subscriptions key naturally off the entry.
- Alternative considered: an optional channel argument on each public command
  method. Rejected — `turnOn(name, toggleAfter?)`/`coverOpen(name, duration?)`
  already occupy their optional parameter, and exposing the channel publicly
  would let a caller target a component the device may not have.
- Alternative considered: a new `ShellyHost` aggregate type wrapping N devices.
  Rejected as extra indirection that duplicates what the service's own record
  map already provides.

This supersedes the earlier rejection (approach A) of service-level per-channel
entries: discovery originates in the source, so the caller never supplies the
channel count.

### D2: Component discovery via `Shelly.GetComponents`, awaited at startup

At device registration the source calls `Shelly.GetComponents` (HTTP or MQTT
RPC) with `include: ["status", "config"]` and filters for `switch:*` /
`cover:*` components, recording each component's channel, kind, configured name
(from config), and metering (from status). The response is **paginated** — at
most 10 components per page, sorted alphabetically, so `switch:*` can fall on a
later page than `input:*` — and discovery MUST page on `offset` until
`offset + returned >= total` before concluding the component set. Reading only
the first page would miss switch components on larger devices (a Pro 4PM has
well over 10 components) and silently fall back to a single channel 0,
defeating the feature. `ShellyDeviceSource.start()` **awaits discovery for
every already-registered device before returning**; the aggregate already
awaits `source.start()`, so enumeration is complete and deterministic once the
engine is up. A device is omitted from `list()`/`get()` until its discovery
resolves. A device registered after startup is discovered asynchronously and
materialized when it resolves. If the call fails, returns an unexpected shape,
or yields no recognized components, the source falls back to a single
component at channel 0 using the registration's declared `type`.

- Rationale: `Shelly.GetComponents` is the canonical Gen2 inventory call and
  works over both transports with the existing RPC dispatch; awaiting at start
  removes any boot-time enumeration race.
- Alternative considered: infer the channel count from `Shelly.GetDeviceInfo`
  only. Rejected — device info does not reliably enumerate component instances.
- Alternative considered: hardcode per-model channel counts (Pro 4PM → 4).
  Rejected — brittle, and Pro 2/2PM/4PM differ and firmware can vary.
- Alternative considered: fire-and-forget discovery (do not await `start()`).
  Rejected — leaves a window where a device is silently absent from
  enumeration, and makes late-registration ordering racy.

### D3: MQTT notification keying by actual component → channel entry

`handleNotifyStatus` reads every recognized `switch:N` / `cover:N` key present
in `params` and updates the matching channel entry (physical device + channel),
rather than selecting a fixed key. One MQTT subscription remains per physical
device (its `topicPrefix`), but updates dispatch per component key to the
corresponding channel entry.

- Rationale: Shelly publishes one notification per changed component; the
  component key *is* the channel. This is a strict generalization of the
  current code and is the direct fix for the dropped `switch:1..3` bug.
- Note: MQTT command dispatch already targets a topic prefix; the component
  `id` comes from the RPC `params.id`, taken from the channel entry (D1). No
  per-channel topic is required.

### D4: Logical identity — base name for a single component, component name with numeric fallback for multiple

Identity derivation:

1. If discovery yields exactly **one** component, the channel-0 id is the base
   registration name. Every existing single-channel deployment keeps its
   identity, persisted room/visibility keys, and HomeKit pairing.
2. If discovery yields **multiple** components, each channel's id is the
   component's configured `name` when present and unique **across every
   registered Shelly device**; otherwise `<base>_<channel>`. A configured name
   that collides with another channel of the same device, or with a component
   of a different registered device, falls back to `<base>_<channel>`.
3. `displayName` reflects the channel unambiguously — the configured name when
   present, else `<base> <channel>`.

An id is stable across restarts for the same physical device, channel, and
component name. **Renaming a component on the device is accepted as a new
identity**: persisted room/visibility state for the old id is orphaned and
HomeKit re-pairs (the UUID seed is `shelly:<id>`, D6). This is a conscious
trade-off of using human-meaningful names over opaque numeric ids.

- Rationale: preserves backward compatibility for existing deployments while
  naming channels the way Shelly's own UI does.
- Alternative considered: always suffix with channel, including `:0`. Rejected
  — would silently change every existing device's identity and orphan persisted
  room/visibility state.
- Alternative considered: numeric-only ids (e.g. `<base>_<channel>`) for all
  channels. Rejected — the identity would not match the user-facing component
  name Shelly displays.

### D5: Per-channel capability composition; kind from discovery, outlet from registration

`shellyCapabilitiesFor` is extended to describe a single component channel
(kind + that channel's metering), rather than one device-level type. Discovery
supplies `switch` vs `cover` from the component key; the `outlet` distinction is
taken from the registration's declared `type` (Shelly exposes no outlet flag)
and applied to the device's switch channels. Each channel record's `type` is set
to this **effective kind** — `cover` for a cover component, else
`switch`/`outlet` from the registration — so the service's and source's existing
`device.type` branching (command dispatch, normalization, capability selection)
reads the right kind with no new field. The source computes `metered` per
channel from that channel's own `aenergy`.

- Rationale: a 4PM can have metering on some channels and not others; declaring
  energy device-wide would misdescribe non-metered channels, violating the
  existing "not metered ≠ metered, zero" contract.
- Alternative considered: carry over the current device-level `metered`.
  Rejected — incorrect for mixed-metering multi-component hardware.

### D6: HomeKit fan-out is automatic; identity carries the rename caveat

No HomeKit-specific work beyond identity: because each channel entry is already
a separate descriptor with its own capabilities, `homekit-descriptor-factory`
and `DeviceCatalogSource` create one accessory per channel with no changes to
their selection logic. Accessory persistence keys are the descriptor's
qualified id (`shelly:<id>`), so distinct channel ids yield distinct
accessories — but a component rename (D4) changes the id and therefore produces
a new accessory requiring re-pairing.

- Rationale: the descriptor layer is already device-agnostic; channels are just
  more descriptors. This keeps the change contained to service + source.
- Watch item: the saved HomeKit/visibility state for an old id is not garbage
  collected automatically; document the rename consequence.

## Risks / Trade-offs

- **[Rename changes identity]** (accepted by D4) → orphaning of persisted
  room/visibility keys and a HomeKit re-pair for the renamed component. No
  migration is attempted; documented explicitly.
- **[Duplicate/missing component names]** → fall back to `<base>_<channel>`, and
  a configured name is only accepted as an id when it is unique across every
  registered device (D4).
- **[Inventory pagination truncates discovery]** → `Shelly.GetComponents`
  returns at most 10 components per page, alphabetical, so `switch:*` can sort
  onto a later page; discovery MUST page to the reported `total` or a large
  device silently degrades to channel 0 (D2).
- **[Base inventory entry leaks into enumeration]** → for a multi-component
  device, the source excludes the base registration from `list()`/`get()`; for
  a single-component device the base *is* the channel-0 entry (D1). Channel
  records live in a separate internal map so `getDevices()` is unaffected.
- **[`onDeviceRegistered` re-entrancy]** → the internal channel registration
  used by the source must not re-fire public registration listeners, or
  discovery would loop (D1).
- **[Startup discovery latency]** → awaited, but bounded: the paginated
  inventory calls per device, parallelizable, with a 5s MQTT RPC timeout per
  offline device (D2).
- **[`Shelly.GetComponents` unsupported or slow on some firmware/devices]** →
  D2 fallback to channel 0; a failure degrades to current behavior rather than
  breaking startup.
- **[Channel count changes after physical reconfiguration]** → discovery reruns
  at startup; channels absent from a later inventory keep their entry and are
  marked unreachable (no removal).
- **[MQTT notifications for multiple channels arrive concurrently]** → state is
  tracked per channel entry with listener isolation already present; no shared
  mutable component key remains.
- **[Public API growth]** → none: the channel lives on the service's internal
  record; public method signatures and `register()` overloads are unchanged.

## Migration Plan

1. Extend types (internal `channel` field and effective component `type` on the
   service's device record, a component-inventory response type including key,
   kind, name, channel, and status) with optional fields — no breakage.
2. Add paginated `Shelly.GetComponents` handling (`include:
   ["status", "config"]`), the internal channel map and registration path, and
   channel threading through `ShellyService` commands, defaulting to channel 0.
3. Generalize `ShellyDeviceSource`: await discovery in `start()`, materialize
   channel entries, apply the D4 id scheme (global uniqueness), reject commands
   to the base registration of an expanded device, key `tracked`/dispatch by
   channel entry, generalize `handleNotifyStatus` per component key, poll each
   channel.
4. Extend `shellyCapabilitiesFor` to compose per channel + kind.
5. Docs (`docs/services/shelly.md`) + spec sync, including the rename rule.
6. Rollback: all new fields are optional and the channel-0 default reproduces
   pre-change behavior; reverting the source fan-out restores the old model
   without data migration (single-component identities are unchanged).

## Open Questions

None blocking. Decisions resolved during exploration and folded into the
design above:

- **Discovery pagination and names.** `Shelly.GetComponents` is paginated
  (at most 10 components per page, alphabetical) and returns a component's
  configured `name` only with `include: ["config"]`; discovery requests
  `["status", "config"]` and pages on `offset` to the reported `total` (D2).
- **Base vs channel storage.** Channel records live in a separate internal
  service map; the public `getDevices()` view ("Device Inventory Read Access")
  is unchanged and returns registrations only (D1).
- **Cross-device name collisions.** A configured component name is used as an
  identity only when it is unique across all registered devices; otherwise the
  id falls back to `<base>_<channel>` (D4).
- **Channel kind on the record.** A channel record's `type` is the effective
  component kind — `cover`, else `switch`/`outlet` from the registration (D5).
- **Base-name commands.** For an expanded multi-component device, a command
  naming the base registration is rejected (`not_found`); the base serves
  device-level queries only (D1).
- **A channel disappearing from a later inventory:** its entry is **kept** and
  marked unreachable (no removal).
- **Explicit channel registration:** **not exposed publicly**; the source's
  internal channel path materializes all discovered components.
