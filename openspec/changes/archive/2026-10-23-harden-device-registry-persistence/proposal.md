## Why

On 2026-10-22 a pod restart tore the final partial 4 KB page of
`state/device-registry.json`: `DeviceRegistry.save()` uses plain `writeFile` with
no `fsync`, and the volume was detached and re-staged for the replacement pod
302 ms later. The file's first 397312 bytes (97 × 4096) were the new snapshot;
the last 2490 bytes were stale bytes from the previous one, so `JSON.parse`
rejected the whole file and the registry booted empty.

The other two JSON stores written in the same shutdown survived, because they
use the shared `writeJsonAtomically` / `readJsonWithBackup` primitives. The
registry is the last JSON store in `core` without them. The damage did not stop
at a cold-start seed: the empty registry enumerated nothing, and the Zigbee
source then recorded `state: {}` over the restored last-known values, leaving
33 of 47 Zigbee devices with no state in the live catalog *and* in
`device-state.json`. Both gaps must be closed: the snapshot must survive a torn
write, and an empty registry must not be able to erase state the durable store
already knows.

## What Changes

- **Harden the registry snapshot (A).** `DeviceRegistry.save()` and `load()` use
  `writeJsonAtomically()` and `readJsonWithBackup()` from
  `packages/core/src/state/json-persistence.ts`: temp file → `fsync` → `.bak`
  rotation → atomic rename, and recovery from `device-registry.json.bak` when
  the primary is corrupt. `ENOENT` and pre-`groups` snapshots keep their current
  behaviour. The snapshot JSON shape is unchanged.
- **Keep the store able to cover a lost registry (C).** `ZigbeeDeviceSource` and
  `ZigbeeGroupDeviceSource` seed descriptor state from `DeviceStateStore` when
  the registry has no state for a device/member, carrying the stored
  observation. A first enumeration with an empty registry therefore records the
  restored state instead of `{}`; a live registry state still wins once it
  exists.
- **Do not prune before a source has enumerated (C′).** `wireDeviceEvents()`
  currently reconciles the store at wiring time, before the retained
  `bridge/devices` payload arrives. `ZigbeeDeviceSource.available` is true
  whenever the registry exists, so an empty — or stale, snapshot-subset —
  registry enumerates nothing and every stored Zigbee record is pruned (and
  flushed) before the seed can read it. Add a `DeviceSource.hasEnumerated`
  readiness signal, prune records only for available sources that have completed
  an authoritative enumeration, and re-run the reconcile when a source becomes
  enumerated. This closes the gap that made C unreachable in the incident
  scenario and refines the `device-state-store` lifecycle requirement.
- **Make corruption observable and recoverable.** A corrupt primary logs the
  existing error, recovery from `.bak` logs which file was used, and a missing
  or corrupt backup starts empty — the same contract as the state and
  device-state stores.
- **Tests and specs.** Add coverage for the atomic write, `.bak` rotation,
  corrupt-primary recovery, corrupt-primary-and-backup, and the Zigbee seed path
  with an empty registry; add the missing atomicity/recovery requirement to
  `device-registry` and pin the Zigbee seed scenarios in `device-sources`.
- **Docs / release.** Document the `.bak`/`.tmp` files alongside
  `device-registry.json` and include `device-state.json` in backup guidance; add
  a patch Changeset for `@ts-ha/core`.

### Non-Goals

- Changing the persisted snapshot format or retiring the registry's duplicate
  `states` map in favour of `DeviceStateStore`.
- Periodic/debounced registry saves (the snapshot still writes only on graceful
  shutdown); this incident was a durability failure, not a staleness one.
- A recovery tool for already-torn files, or changes to the `.bak` policy of the
  other two stores.
- Changing how `device-state-store` holds or serializes records — the change only
  narrows *when* a record may be pruned (after its source has enumerated).
- Any `shared`, `web-ui`, or `cli` code.

## Capabilities

### New Capabilities

<!-- none — both behaviours extend existing capabilities -->

### Modified Capabilities

- `device-registry`: persistence gains atomic durable writes, `.bak`
  preservation, corrupt-primary recovery with backup fallback, and per-entry
  serialization resilience; the error-handling requirement covers a corrupt
  snapshot as a recoverable condition rather than a total parse failure.
- `device-sources`: the existing last-known-state requirement is pinned to the
  Zigbee device and group sources — seeding from the store when the registry has
  no fresher state, preserving the stored observation, and not overwriting a
  restored record with an enumeration-only empty state. A source exposes whether
  it has completed an authoritative enumeration so a transiently empty source
  cannot erase the store.
- `device-state-store`: the lifecycle requirement now applies pruning only after
  an available source has enumerated, so a record is not removed merely because
  a push-driven source has not received its first payload yet.

## Impact

- Code: `packages/core/src/zigbee/device-registry.ts`,
  `packages/core/src/device-sources/zigbee-source.ts`,
  `packages/core/src/device-sources/zigbee-group-source.ts`,
  `packages/core/src/device-sources/device-source.ts`,
  `packages/core/src/device-sources/aggregate.ts`,
  `packages/core/src/device-sources/device-event-bridge.ts`,
  `packages/core/src/device-sources/shelly-source.ts`,
  `packages/core/src/device-sources/nanoleaf-source.ts`,
  `packages/core/src/device-sources/state-source.ts`.
- Tests: `packages/core/tests/device-registry.test.ts`,
  `packages/core/tests/device-source-zigbee.test.ts`,
  `packages/core/tests/device-source-zigbee-group.test.ts`,
  `packages/core/tests/device-event-bridge.test.ts`.
- Specs: `openspec/specs/device-registry/spec.md`,
  `openspec/specs/device-sources/spec.md`,
  `openspec/specs/device-state-store/spec.md`.
- Docs: `docs/device-registry.md`, `docs/deployment.md`,
  `docs/configuration.md` (persistence files and backup guidance).
- Release: patch Changeset for `@ts-ha/core`.
- No API contract, config schema, dependency-direction, or web-ui/cli change.
