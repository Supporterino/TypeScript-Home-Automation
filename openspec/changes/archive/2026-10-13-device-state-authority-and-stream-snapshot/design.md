# Design

## Context

See proposal.md — Why. Constraints that shape the approach:

- Device sources each own an in-memory state map (`DeviceRegistry.deviceStates`
  for Zigbee, `ShellyDeviceSource.tracked`, `NanoleafDeviceSource.tracked`,
  `StateManager` for state toggles) and build descriptors in `toDescriptor()` /
  `list()`.
- Startup order in `engine.ts`: `stateManager.load()` and
  `deviceRegistry?.load()` already run *before* `deviceSources.start()`
  (`engine.ts:779-798`), and `wireDeviceEvents()` runs at `:809`.
- The Zigbee registry already persists device list **and** states
  (`device-registry.ts` `save()`/`load()`), gated by `DEVICE_REGISTRY_PERSIST`.
- `StateManager` already implements debounced write-behind persistence
  (`state-manager.ts`, `flushIntervalMs`) — the pattern to mirror.
- `EventStreamHub` (`http/event-stream.ts`) subscribes to the bus once and fans
  out to `connections`; a connection is registered in the stream's `start()`.

## Goals / Non-Goals

**Goals:**
- One durable, unified home for last-known device state that every source
  records into and seeds from.
- A client that connects to the stream converges on the engine's device set even
  if its REST snapshot was incomplete.

**Non-Goals:**
- Making the store the single authority for *descriptors* (capabilities,
  identity, reachability). Sources still own descriptors; the store owns only
  last-known state + observation.
- History/time-series of device state.
- Changing the meaning of incremental events after connect.

## Decisions

### D1 — A dedicated `DeviceStateStore` in core, loaded before sources start

New module `packages/core/src/device-sources/device-state-store.ts`, keyed by
qualified id, holding `{ state, observation }`. Loaded in `engine.ts` after
`deviceRegistry.load()` and before `deviceSources.start()`, mirroring the
existing ordering so a restored value is available to the first enumeration.

- *Alternative:* extend each source with its own persistence (as Zigbee has).
  Rejected: duplicates load/save/prune logic per family and leaves the next
  source without it.
- *Alternative:* store device state in `StateManager` under a reserved internal
  key. Rejected: mixes automation state with device telemetry in one file and
  one change-listener surface, and device state is higher-churn than the state
  the store is designed for.

### D2 — Sources remain descriptor owners; they write observations and read seeds

A source records each observation into the store and, in `toDescriptor()`, uses
the store's value when it has no fresher in-memory observation. This keeps
`list()`, `get()`, and subscription delivery consistent (device-sources
requirement) and avoids re-architecting descriptors.

- *Alternative:* make the store the single source of truth and assemble
  descriptors from store + capability schema. Rejected as a larger refactor that
  changes every source and the aggregate; can follow later if wanted.

### D3 — Debounced write-behind JSON, mirroring `StateManager`

Persist to `DEVICE_STATE_FILE` (default `./device-state.json`), coalesced by
`DEVICE_STATE_FLUSH_MS`, with saves chained so overlapping writes never race —
the same shape as `StateManager`. `DEVICE_STATE_PERSIST` defaults to true.

### D4 — Restored observations keep their original timestamp

A restored record's `observation.observedAt` is the time it was recorded, never
the read time, so a restored poll-backed value past its refresh interval reads
as stale through the existing `deviceTileObservation` path. The dashboard
already renders "last-known, not live" from the observation; the store must not
falsify it.

### D5 — Prune on device disappearance

When the aggregate reconciles and a device is gone, its store record is removed
so it does not reappear after a restart. This reuses the disappearance detection
`wireDeviceEvents` already performs.

### D6 — Per-connection snapshot emitted before live events

On `EventStreamHub.open()`, enqueue one `device_appeared` frame per device from
the aggregate's total enumeration (`list()`, including hidden devices, matching
the REST snapshot the dashboard already stores) into the connection's outbox
*before* the connection is added to the fan-out set, so a concurrent bus event
cannot interleave ahead of the snapshot. Subsequent device events remain
incremental.

- *Alternative:* have the client refetch on connect. Rejected: leaves the client
  depending on a racing REST call and does not make the server authoritative.
- *Hidden devices included:* the dashboard needs hidden devices to offer
  reveal/unhide, exactly as the REST snapshot provides them, so the snapshot uses
  total enumeration.

### D7 — Client reconciles by identifier and recovers unknown deltas

`data-store.tsx` merges the stream's device snapshot by `qualifiedId` instead of
replacing the map, and on a `device_state`/`device_reachability`/`device_visibility`
event for an unknown id, refetches that device (`fetchDevice`) rather than
dropping it. No `core` import — the client stays a pure API consumer.

## Risks / Trade-offs

- [Zigbee state is now persisted twice (registry + store)] → Treat the store as
  the general path and leave registry persistence as an independent cold-start
  seed; both write the same value, so divergence is not observable. A follow-up
  may retire the registry's state persistence.
- [Snapshot frame could be large with many devices] → One frame per device on
  connect, bounded by device count (~tens); it is a one-time cost per connection.
- [A live event racing the snapshot on connect] → Enqueue the snapshot before
  registering the connection in the fan-out set (D6).
- [Store grows unbounded] → Pruned on disappearance (D5) and bounded by the set
  of known devices.
- [Stale state painted as current] → D4 retains the observation; the client's
  existing stale rendering applies.

## Migration Plan

Persistence defaults to on; an existing deployment begins writing
`device-state.json` after upgrade and gains last-known state on subsequent
restarts. Rolling back removes the file; no other persisted format changes.
