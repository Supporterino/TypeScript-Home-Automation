## Context

See `proposal.md` — Why. The constraints that shape the approach:

- `DeviceRegistry.save()` (`packages/core/src/zigbee/device-registry.ts:171-208`)
  is the only remaining plain `writeFile` JSON store in `core`. It runs once,
  from `engine.stop()` (`packages/core/src/engine.ts:752`), on the shutdown path.
- The shared primitives already exist and are used by the other two stores:
  `readJsonWithBackup()` and `writeJsonAtomically()` in
  `packages/core/src/state/json-persistence.ts:14-86` (temp file → `fsync` →
  `.bak` → atomic rename; corrupt-primary fallback). `StateManager`
  (`state-manager.ts:286-316`) and `DeviceStateStore`
  (`device-state-store.ts:155-192`) are the reference patterns.
- Startup order is already correct for a store seed:
  `stateManager.load()` → `deviceRegistry?.load()` → `deviceStateStore.load()` →
  service plugins → MQTT → `deviceSources.start()` → `deviceRegistry.start()`
  (`engine.ts:624-656`). The store is populated before any source enumerates.
- `DeviceStateStore` is injected into both Zigbee sources
  (`engine.ts:437-452`) and exposes `get(qualifiedId)` returning
  `{ state, observation }` (`device-state-store.ts:82-88`). Both sources
  currently use it only to `record()`, never to seed.
- The deployed `@ts-ha/core@0.7.0` in the cluster has the same code as HEAD, so
  this is a source fix, not an environment-only problem.

## Goals / Non-Goals

**Goals:**

- Make the registry snapshot survive a write that is torn at a filesystem block
  boundary, a failed write, or a process killed during shutdown.
- Make a corrupt registry snapshot recoverable without losing the rest of the
  boot, using the same `.bak` contract as the other two stores.
- Ensure an empty or absent registry snapshot cannot erase last-known Zigbee
  state that the durable store already holds.
- Keep the snapshot format, public API, and startup/shutdown ordering unchanged.

**Non-Goals:**

- Changing the snapshot shape, or removing the registry's `states` map.
- Adding periodic/debounced registry saves.
- Adding a recovery tool for the already-torn file.
- Changing the shared helper's durability contract (directory `fsync` is a
  separate question — see Open Questions).

## Decisions

### D1 — Reuse `readJsonWithBackup` / `writeJsonAtomically`, not a registry-specific writer

`DeviceRegistry.load()` becomes:

```text
readJsonWithBackup(this.filePath, this.logger, "device registry", (parsed) =>
  this.restore(parsed),
)
```

and `save()` builds the snapshot, then calls
`writeJsonAtomically(this.filePath, contents, this.logger, "device registry")`
after `mkdir(dirname(this.filePath), { recursive: true })`.

- Rationale: the two stores that used this path survived the exact shutdown that
  tore the registry snapshot. A second implementation would drift again — that
  drift is the root cause. `json-persistence.ts` is internal to `core` and
  already carries the `ENOENT`/corrupt/`.bak` semantics.
- Alternative: a registry-specific atomic write. Rejected: duplicates the
  primitive, adds a second set of log messages, and guarantees the next fix has
  to touch two places.
- Log labels stay per-store: `"device registry"` produces
  `Failed to load persisted device registry`,
  `Persisted device registry file is corrupt, attempting backup recovery`, and
  `No persisted device registry file found, starting fresh`, matching the
  existing message text.

### D2 — Fault-tolerant serialization per entry

Mirror `StateManager.performSave()`: build `devices` and `states` by attempting
`JSON.stringify(entry)` per device/state, skipping and warning on failure; do
the same per group. This is defensive rather than a known failure (registry
values come from JSON payloads), but it removes the all-or-nothing property and
matches the other two stores.

- Alternative: rely on the fact that registry data is JSON-derived. Rejected:
  the contract and the failure mode should be uniform across the three stores;
  the cost is one `JSON.stringify` per entry.

### D3 — Validate the snapshot shape, skip malformed entries

`JSON.parse` succeeding does not make a file a snapshot. `restore()` guards:

- `parsed` is a non-null plain object;
- `devices` / `states` are plain objects when present;
- `groups` is an array when present;
- each device has a string `friendly_name`; each state key is a string; each
  group has a numeric `id` and string `friendly_name`.

Malformed entries are logged at `warn` and skipped. Unknown top-level keys are
ignored, so a newer/older snapshot remains loadable. The existing `Coordinator`
filter and the "snapshot without `groups`" behavior are preserved.

- Rationale: a valid-JSON/wrong-shape snapshot would otherwise install
  `undefined` keys and subscribe to `zigbee2mqtt/undefined`. This is the same
  class of failure as the torn file, one layer later.
- Alternative: reject the whole snapshot on any shape error and fall back to
  `.bak`. Rejected: a single malformed device should not discard the other 46.

### D4 — Registry `load()` callback must not throw for non-parse reasons

`readJsonWithBackup` wraps `apply()` in the same `try` as `JSON.parse`. The
registry's `apply` registers per-device MQTT handlers
(`device-registry.ts:141-151`). A throw there (e.g., from `mqtt.subscribe`)
would be misclassified as file corruption and trigger backup recovery.

Decision: `restore()` catches per-device subscription errors, logs them, and
continues. The helper's `catch` stays reserved for parse/shape failure.

- Alternative: split the helper into `read()` + `apply()` and change both other
  stores. Rejected: broader churn, no behavior gain for this change.

### D5 — Zigbee device seed: registry state first, then the store

`ZigbeeDeviceSource.toDescriptor()` (`zigbee-source.ts:155-172`) becomes:

```text
const qualifiedId = qualifyDeviceId(this.id, device.ieee_address);
const registryState = this.registry?.getDeviceState(device.friendly_name);
const stored =
  registryState === undefined ? this.deviceStateStore?.get(qualifiedId) : undefined;
const state = registryState ?? stored?.state ?? {};
const observation =
  stored?.observation ?? { mode: "push", observedAt: Date.now() };
```

- Use `=== undefined`, not truthiness: `getDeviceState()` returns `undefined`
  only when the registry has no entry; a real `{}` payload is a fresh
  observation and must win.
- A seeded descriptor carries the store's observation, so `notify()`'s
  `record()` (`zigbee-source.ts:142-147`) writes the same state and the original
  observation. The `{}`-with-`Date.now()` clobbering observed in the incident
  cannot recur for any device the store knows.
- The comment in `notify()` that says the store's seed path is "never consulted"
  is replaced.
- Alternative: always prefer the store and overlay registry. Rejected: the
  registry is the live observation channel; it must win when present.
- Alternative: only fix the registry writer. Rejected by the incident: the
  device-state store had 76 valid records and could not cover the loss, because
  the source did not consult it.

### D6 — Zigbee groups: seed members, report the oldest member observation

`resolveMembers()` (`zigbee-group-source.ts:418-430`) resolves each member to
`{ device, state, observation }` using the same registry-first/store-second rule
as D5. `toDescriptor()` derives the group state from those member states and
sets the group observation to the **oldest** member observation
(`Math.min` over the members that contributed state). When every member is
live, that is effectively "now".

- Rationale: a group is only as fresh as its stalest member. Reporting `now`
  while one member is a restored record would present stale data as live — the
  exact failure mode the observation model exists to prevent.
- Alternative: leave groups out of scope. Rejected: the group source has the
  same store injected and the same `{}` clobbering path; leaving it produces a
  half-fixed surface.
- Alternative: always use `Date.now()`. Rejected: falsifies freshness.

### D7 — Keep the registry save shutdown-only

No debounce/write-behind is introduced. The incident was a durability failure,
not staleness: the write returned successfully, and the page was lost on volume
detach. Atomic + `fsync` addresses it. Adding periodic saves would increase I/O
on a low-churn snapshot and add a save chain for no incident-related benefit.

- Deferred follow-up: if registry snapshots become stale after hard kills, the
  `DeviceStateStore` write-behind pattern is the model to copy.

### D8 — Tests

Extend the existing suites (flat files, silent pino logger, max two `describe`
levels):

- `packages/core/tests/device-registry.test.ts`: save twice → `.bak` present and
  valid; corrupt primary + valid `.bak` → recovered; corrupt primary + corrupt
  `.bak` → empty, no throw; malformed shape entries skipped; unserializable
  entry skipped; round-trip unchanged; `ENOENT` unchanged; snapshot without
  `groups` still loads; `Coordinator` still filtered.
- `packages/core/tests/device-source-zigbee.test.ts`: preload the store, start
  with an empty registry, emit `bridge/devices`, assert the descriptor carries
  the stored state and observation; emit a live device state, assert the
  registry wins and the store updates; assert the seeded notification does not
  advance the stored observation.
- `packages/core/tests/device-source-zigbee-group.test.ts`: preload member
  records, emit groups, assert the derived state includes the seeds and the
  group observation equals the oldest member observation.
- `packages/core/tests/device-event-bridge.test.ts`: a stored Zigbee record is
  retained when the registry has not yet received `bridge/devices`, and pruned
  once the authoritative list omits it (D10).

### D9 — Docs and release

- `docs/device-registry.md`: describe `.bak` and transient `.tmp`, recovery
  behaviour, and that the snapshot is a cold-start seed.
- `docs/deployment.md`: include `device-state.json` in backup guidance and note
  the `.bak` files.
- `docs/configuration.md`: note the backup file beside each persistence path.
- A patch Changeset for `@ts-ha/core`; no API/config change.

### D10 — Gate startup pruning on an authoritative enumeration

`wireDeviceEvents()` (`device-event-bridge.ts:54-58`) runs after
`deviceSources.start()` but before `deviceRegistry.start()` (`engine.ts:646-656`),
so a Zigbee source that restored nothing enumerates nothing while
`ZigbeeDeviceSource.available` is already true (`registry !== null`). The
reconcile then prunes **every** `zigbee:*` record before the retained
`bridge/devices` payload can repopulate the registry, and `prune()` schedules a
flush, so the loss is persisted. The same happens with a snapshot restored from
an older `.bak` that lacks recent joins: the source is "available", its list is a
stale subset, and every record for a device missing from the subset is pruned.

Decision: separate *configured* availability from *enumerated readiness*.

- `DeviceSource` gains `readonly hasEnumerated?: boolean`: implementations report
  `true` only after the source has completed at least one authoritative
  enumeration. Optional to stay source-compatible with external implementations;
  anything other than `true` (including omission) is treated as not yet
  enumerated. Documented as the guard for destructive reconciliation — a source
  that has not enumerated may be transiently empty.
- Readiness per source:
  - `state`: always true (the toggle inventory is in-process and synchronous).
  - `shelly`: true once `start()`'s discovery sweep resolves (inventory is
    config-driven, state polling is irrelevant).
  - `nanoleaf`: true (inventory is registered from config at construction).
  - `zigbee`: true once the registry has received a `bridge/devices` array —
    including an empty one, which is authoritative. A restored snapshot alone is
    a seed, not an enumeration. The flag resets in `DeviceRegistry.stop()` with
    the cleared maps.
  - `zigbee-group`: true once the registry has received a `bridge/groups` array,
    also reset in `stop()`.
- `AggregateDeviceSource.sources()` reports `hasEnumerated` alongside
  `available` (additive; the HTTP status payload gains the field).
- `reconcileStore()` prunes only records whose source is in the **current**
  ready set (`available && hasEnumerated === true`); the accumulated set only
  decides whether a reconcile is due, so a source that later becomes unavailable
  stops pruning. `wireDeviceEvents()` reconciles at wiring, on every descriptor
  notification, and on every applied authoritative list (see below). The
  per-notification tracked-removal prune applies the same reportability rule, so
  a source outage never deletes its records.
- A readiness flip or a removal does not always produce a descriptor
  notification: `onDeviceRemoved` only unsubscribes, and `onGroupsChanged` only
  rebuilds the index. So the registry also emits `onDeviceListApplied` /
  `onGroupListApplied` after a payload is fully applied. Sources expose these as
  an optional `DeviceSource.onDeviceSetChanged`, the aggregate forwards it, and
  `wireDeviceEvents()` runs its topology reconcile on it. This makes a
  removal-only `bridge/devices` payload and a `bridge/groups` change prune
  immediately, as the delta scenarios require, without inventing a descriptor
  for a removed device (which would re-record it and falsify its observation).
- The registry flips `deviceListReceived` only after the complete
  `bridge/devices` payload has been applied, and fires its per-device
  `onDeviceAdded` notifications afterwards. Otherwise the first addition's
  notification would reconcile against a partial enumeration and prune the
  records of devices later in the same payload — the incident symptom one layer
  down. The 5.5 probe caught this; `device-event-bridge.test.ts` pins it.
- Alternative: skip the reconcile whenever the aggregate list is empty.
  Rejected: it fixes the empty-registry case but not the stale-snapshot-subset
  case, which loses exactly the recently-joined devices.
- Alternative: move `wireDeviceEvents()` after `bridge/devices`. Rejected: it
  would delay the whole device event surface and automation discovery on an MQTT
  message, and would still not cover a subset snapshot.
- Alternative: rely on descriptor notifications alone and document
  "pruned at the next reconciliation". Rejected: with no other device traffic a
  removal-only payload could leave the record indefinitely, and the delta
  scenarios promise pruning once the list arrives. The optional signal costs one
  forwarding method per source and keeps the descriptor contract intact.

## Risks / Trade-offs

- [Extra I/O on shutdown: temp write, `fsync`, backup copy, rename] → The
  snapshot is ~400 KB; the observed volume is 1 % used. Acceptable on a
  shutdown-only path.
- [`.bak` doubles the on-disk footprint] → ~800 KB total; one rolling copy, no
  unbounded growth. Document it.
- [The first save after a corrupt primary copies that corrupt file to `.bak`] →
  The primary is valid after the rename; the next save rotates a good backup.
  Recovery from the corrupt primary is not attempted on that first save. This is
  the same trade-off the other two stores already accept.
- [`apply()` inside the parse `try` could misread a subscription error as
  corruption] → Catch per-device errors inside `restore()` (D4).
- [Shape validation could reject a snapshot from a future/older version] → Skip
  only malformed entries, ignore unknown top-level keys, and keep the
  `groups`-optional rule.
- [Group observation becomes older than before] → Intended: a group with a
  restored member is stale. The UI already renders stale observation via the
  existing `deviceTileObservation` path.
- [`writeJsonAtomically` does not `fsync` the parent directory] → A lost rename
  leaves the previous primary intact (valid), and the `.bak` is also present.
  Residual power-loss risk; not expanded here.
- [Registry `states` still duplicate `DeviceStateStore`] → Unchanged for now;
  both write the same values, and the source's seed order makes the store the
  safety net. Follow-up in Open Questions.
- [Pruning is deferred until a source enumerates] → A source whose authoritative
  list never arrives (broker down, empty retained payload) keeps its stored
  records for that boot. Bounded by store size and strictly safer than erasing
  last-known state; the next boot with a live list prunes normally.
- [Readiness is polled at wiring, on notification, and on an applied list] → A
  third-party source that implements neither notification on a set change nor
  `onDeviceSetChanged` can leave its stale records until its next descriptor
  notification. Only affects stale-record cleanup, never the seed path; the five
  built-in sources all report applied lists or notify.

## Migration Plan

- No config or env change. The snapshot shape is unchanged; existing files load
  as before, including snapshots without `groups`.
- First save after upgrade writes through a temp file and creates a `.bak` only
  if a previous primary exists (the helper ignores `ENOENT` from the backup
  copy).
- The already-torn `device-registry.json` is not repaired by the code change:
  the next graceful shutdown replaces it, and the corrupt primary is copied to
  `.bak` once. Operators who want the 33 lost Zigbee states back immediately can
  extract them from the torn file's valid prefix; that is a manual recovery, not
  part of this change.
- Rollback: revert the code. The old loader ignores `.bak`/`.tmp` and reads
  `device-registry.json`, which is valid after any completed save.

## Open Questions

- Should `writeJsonAtomically` also `fsync` the parent directory, affecting all
  three stores? Deferrable: the current failure is a lost data page, which the
  file `fsync` addresses; a lost rename leaves a valid previous primary.
- Should the registry stop persisting `states` now that the device-state store
  is the general seed and the Zigbee source reads it? Deferrable: the duplicate
  is already documented as a known trade-off in
  `2026-10-13-device-state-authority-and-stream-snapshot` (design D2/risks).
