## 1. Atomic durable write

- [x] 1.1 Add a private `atomicWrite(filePath, contents)` helper in `state-manager.ts` that writes to `filePath + ".tmp"`, fsyncs, and renames over `filePath`
- [x] 1.2 Before the rename, best-effort preserve the existing `filePath` as `filePath + ".bak"` (a failed backup must not block the save)
- [x] 1.3 Wire `save()` to use `atomicWrite` instead of the direct `writeFile`

## 2. Per-key serialization guard

- [x] 2.1 In `save()`, build the output object by serializing each store entry individually inside a try/catch
- [x] 2.2 Skip and `warn`-log any key whose value cannot be serialized (include the key name, not the value)
- [x] 2.3 Stringify the assembled surviving-pairs object and pass it to `atomicWrite`

## 3. Corruption recovery in load

- [x] 3.1 On `JSON.parse` failure of the primary file, log an error and attempt to read/parse `filePath + ".bak"`
- [x] 3.2 If the backup parses, restore from it; if not, start with an empty store and log an error
- [x] 3.3 Preserve existing `ENOENT` debug-log behavior for the first-run (no file) case

## 4. Tests

- [x] 4.1 Test: a store with a circular-reference value still persists all other keys, and the bad key is skipped
- [x] 4.2 Test: after a successful save, a `.bak` of the prior content exists
- [x] 4.3 Test: `load()` recovers from `.bak` when the primary file is corrupt
- [x] 4.4 Test: `load()` starts empty (no throw) when both primary and backup are corrupt/absent
- [x] 4.5 Test: no `.tmp` file remains after a successful save

## 5. Verification

- [ ] 5.1 Run `bun run typecheck && bun run check && bun test`
