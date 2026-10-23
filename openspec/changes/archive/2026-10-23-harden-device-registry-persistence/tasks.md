## 1. Registry snapshot durability (A)

- [x] 1.1 Replace `DeviceRegistry.load()`'s `readFile` + `JSON.parse` with `readJsonWithBackup(this.filePath, this.logger, "device registry", …)`; move restoration into a `restore()` that validates the snapshot shape (plain object; `devices`/`states` objects; `groups` array; per-entry `friendly_name`/`id` checks), skips malformed entries with a warning, preserves the `Coordinator` filter and the "snapshot without `groups`" behaviour, and catches per-device subscription errors so they are not misread as file corruption. Verify with `bun test packages/core/tests/device-registry.test.ts --conditions=development`.
- [x] 1.2 Replace `DeviceRegistry.save()`'s `writeFile` with `writeJsonAtomically(this.filePath, contents, this.logger, "device registry")` after `mkdir(dirname(...), { recursive: true })`, guarding each device, state, and group serialization individually and logging a warning for a skipped entry. Verify the round-trip, backup rotation, and unserializable-entry tests pass.
- [x] 1.3 Add tests for a second save creating a valid `.bak`, corrupt primary recovering from a valid `.bak`, corrupt primary plus missing/corrupt `.bak` starting empty without throwing, and valid-JSON/wrong-shape entries being skipped. Verify with `bun test packages/core/tests/device-registry.test.ts --conditions=development`.

## 2. Zigbee seeding from the durable store (C)

- [x] 2.1 Update `ZigbeeDeviceSource.toDescriptor()` to prefer the registry state, fall back to `deviceStateStore.get(qualifiedId)` when the registry has no entry (`=== undefined`), and carry the stored observation; update `notify()`'s comment to reflect that the store is now the seed path. Verify with the new device-source tests and `bun test packages/core/tests/device-source-zigbee.test.ts --conditions=development`.
- [x] 2.2 Update `ZigbeeGroupDeviceSource.resolveMembers()` and `toDescriptor()` to seed each member the same way and to set the group observation to the oldest member observation it aggregates. Verify with the group-source tests and `bun test packages/core/tests/device-source-zigbee-group.test.ts --conditions=development`.
- [x] 2.3 Add a test that starts the Zigbee source with an empty registry and a preloaded store: the descriptor carries the stored state/observation, the seeded notification does not advance the stored observation, and a later live registry state supersedes the seed. Add a group test asserting the derived state includes member seeds and the oldest observation. Verify both suites pass.

## 3. Documentation and release

- [x] 3.1 Update `docs/device-registry.md` with the `.bak`/transient `.tmp` files, recovery behaviour, and the cold-start-seed contract; update `docs/deployment.md` backup guidance to include `device-state.json` and the `.bak` files; note the backup file beside the persistence paths in `docs/configuration.md`. Verify the rendered pages are consistent with `openspec/specs/device-registry/spec.md`.
- [x] 3.2 Add a patch Changeset for `@ts-ha/core` describing the registry durability fix and the Zigbee seed fallback. Verify the Changeset file parses and lists only `@ts-ha/core`.

## 4. Workspace verification

- [x] 4.1 Run `bun run typecheck && bun run check && bun run test` and fix any findings. Verify all three pass.
- [x] 4.2 Run `bun run build` (or `bun run --filter @ts-ha/core build` if the full workspace build is unnecessary) and verify `@ts-ha/core` emits without errors.
- [x] 4.3 Sanity-check the durability path in a temp directory: write a snapshot, corrupt the primary, restore from `.bak`, and confirm the registry loads the expected devices/states/groups without throwing. Verify the observed log lines name the corrupt file and the backup used.

## 5. Startup reconciliation readiness (C′)

- [x] 5.1 Add an optional `readonly hasEnumerated?: boolean` to `DeviceSource` and `hasEnumerated` to `DeviceSourceStatus`; implement it per source: `state` and `nanoleaf` always true, `shelly` true once `start()`'s discovery sweep resolves, `zigbee` true once the registry has received a `bridge/devices` array, `zigbee-group` true once it has received a `bridge/groups` array. Expose the two readiness flags on `DeviceRegistry` so both Zigbee sources can report them. Verify with the device-source suites and the aggregate/source tests.
- [x] 5.2 Gate `reconcileStore()` in `wireDeviceEvents()` on `available && hasEnumerated`, and re-run the reconcile when a source newly becomes enumerated (at wiring and after each notification), so a device removed while stopped is still pruned once the retained list arrives. Verify with `bun test packages/core/tests/device-event-bridge.test.ts --conditions=development`.
- [x] 5.3 Add tests: a stored Zigbee record is retained while the registry has no `bridge/devices` yet and seeds the first enumeration; it is pruned once the authoritative list omits it; a stale snapshot subset does not prune records for devices missing from the snapshot but present in the retained list. Verify with the event-bridge and Zigbee source suites.
- [x] 5.4 Confirm the cold-start-seed claim in `docs/device-registry.md` is now accurate; add the readiness gating to the Changeset summary if the current wording does not cover it. Verify the Changeset still lists only `@ts-ha/core` at `patch`.
- [x] 5.5 Re-run `bun run typecheck && bun run check && bun run test` and `bun run --filter @ts-ha/core build`, and sanity-check the engine startup ordering (empty registry + preloaded store + delayed `bridge/devices`) in a temp directory. Verify records survive wiring and are pruned only after the list arrives.
- [x] 5.6 Pin the ordering defect the 5.5 probe exposed with a regression test: a single `bridge/devices` payload with several new devices must register all of them before readiness flips, so every descriptor seeds from its surviving store record (none is pruned by an earlier device's notification).
- [x] 5.7 Emit an applied-list signal from the registry (`onDeviceListApplied` / `onGroupListApplied`), forward it as an optional `DeviceSource.onDeviceSetChanged`, and reconcile on it, so a removal-only `bridge/devices` payload and a `bridge/groups` change prune immediately rather than waiting for an unrelated descriptor notification.
