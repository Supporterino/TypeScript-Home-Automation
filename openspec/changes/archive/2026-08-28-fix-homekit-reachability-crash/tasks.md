## 1. Fix the crash

- [x] 1.1 Remove the `existing.accessory.updateReachability(descriptor.reachable)` call in the existing-accessory update path of `DeviceCatalogSource.addOrUpdate()` (`src/core/services/homekit-sources/device-catalog-source.ts`)
- [x] 1.2 Remove the `created.accessory.updateReachability(descriptor.reachable)` call in the new-accessory path of the same method
- [x] 1.3 Run `bun run typecheck` and confirm no unused-import or type errors result from the deletions

## 2. Add regression coverage

- [x] 2.1 Add a test (e.g. `tests/device-catalog-source.test.ts`) that imports the real `DeviceCatalogSource` and `createAccessoryFromDescriptor` (not the wholesale mock used by `tests/homekit-service.test.ts`) against a real or minimally-faked `hap-nodejs` `Accessory`, and verify `addOrUpdate()` does not throw when adding a fresh device descriptor with `reachable: false`
- [x] 2.2 Extend the same test to cover the existing-accessory update path (call `addOrUpdate()` twice for the same `qualifiedId`) and verify it does not throw
- [x] 2.3 Run `bun test tests/device-catalog-source.test.ts` and confirm both cases pass; run `bun test` for the full suite to confirm no regressions in `tests/homekit-service.test.ts` or `tests/homekit-descriptor-factory.test.ts`

## 3. Verify end-to-end

- [x] 3.1 Run `bun run typecheck && bun run check && bun test` and confirm all pass
- [x] 3.2 Manually confirm (or via existing status API test) that `HomekitService.onStart()` reaches `bridge.publish()` and sets `published = true` when at least one device descriptor is present, per the `homekit` spec's "Startup Behavior" requirement
