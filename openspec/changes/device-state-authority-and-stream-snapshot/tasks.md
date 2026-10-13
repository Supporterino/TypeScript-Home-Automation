# Tasks

## 1. Device state store module

- [ ] 1.1 Implement `packages/core/src/device-sources/device-state-store.ts`: keyed by qualified id, holding `{ state, observation }`, with `get`, `record`, `prune`, `load`, `save`, and debounced write-behind mirroring `StateManager`; verify unit tests for record/overwrite, seed retrieval, prune, and debounce coalescing
- [ ] 1.2 Verify a restored record keeps its original `observation.observedAt` (not the read time) with a unit test

## 2. Source integration

- [ ] 2.1 Have each device source record observations into the store and seed `toDescriptor()` from the store when it has no fresher in-memory observation; verify per-source tests that enumeration reports last-known state before any observation and that a fresh observation supersedes it
- [ ] 2.2 Verify subscription delivery matches enumeration for the same device (device-sources "Subscription delivery matches enumeration") with a test

## 3. Configuration and engine wiring

- [ ] 3.1 Add `DEVICE_STATE_PERSIST`, `DEVICE_STATE_FILE`, `DEVICE_STATE_FLUSH_MS` to the core config schema with defaults and validation; verify config tests for default-enabled, explicit-disable, and invalid-flush cases
- [ ] 3.2 Load the store in `engine.ts` after `deviceRegistry.load()` and before `deviceSources.start()`, and save it on shutdown; verify an engine test that a restored value is present in the first enumeration
- [ ] 3.3 Prune store records on device disappearance; verify a test that a removed device is not restored on the next start

## 4. Per-connection stream snapshot

- [ ] 4.1 Emit one `device_appeared` per device (total enumeration, including hidden) into a new connection's outbox before it joins the fan-out set; verify a hub test that a connecting client receives the full device set before any subsequent device event
- [ ] 4.2 Verify a per-connection test that the snapshot is bound to the connecting client and does not resend on later events

## 5. Web UI reconciliation

- [ ] 5.1 Merge the stream's device snapshot by qualified id instead of replacing the map, and refetch a device on an event for an unknown id; verify unit tests for by-id merge and unknown-id recovery

## 6. Documentation

- [ ] 6.1 Update `docs/architecture.md`, `docs/configuration.md`, `docs/api-reference.md`, and `docs/device-registry.md` for the store, its settings, and the stream snapshot; verify documented settings and behaviour match the implementation

## 7. Integration verification

- [ ] 7.1 Run `bun run typecheck && bun run check && bun run test` and verify all pass
- [ ] 7.2 Against a running instance, verify a restart exposes last-known state (read-only `GET /api/device-catalog`) and that opening the stream delivers the device snapshot before live events

## Workflow follow-up

- Archive the change after review requirements are satisfied and verify the archived result.
