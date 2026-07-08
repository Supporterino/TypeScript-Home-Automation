## Context

`StateManager.save()` (src/core/state/state-manager.ts) currently does:

```
await mkdir(dir, { recursive: true });
await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
```

Two failure modes:

1. **Non-atomic write** — `writeFile` opens/truncates `state.json` then streams bytes. A crash mid-stream leaves a truncated file. `load()` then does `JSON.parse` inside a try; the catch logs and the store starts empty → all state gone.
2. **All-or-nothing serialization** — `JSON.stringify(data)` over the whole store throws on the first non-serializable value; the catch logs and nothing is written → all state gone on shutdown.

The store is `Map<string, unknown>`, and values arrive from automations (`set()`) and from `PUT /api/state/:key` (arbitrary client JSON), so untrusted/edge values are expected.

## Goals / Non-Goals

**Goals:**
- No single value can prevent persistence of the rest of the store.
- An interrupted write can never corrupt the durable state file.
- A corrupt file on disk is recoverable (backup) and never fatal to `load()`.

**Non-Goals:**
- No change to the in-memory API (`get/set/delete/onChange`).
- No new serialization format (stay with pretty-printed JSON) — `Date` still becomes an ISO string; round-trip typing is out of scope here.
- No write-ahead log, journaling, or database. This is a lightweight config-style store.
- Concurrency serialization of overlapping `save()` calls is out of scope for this change (shutdown is the primary caller); noted as a follow-up.

## Decisions

### Decision: Temp-file + rename for atomic durable writes

Write to `filePath + ".tmp"`, `fsync` the file descriptor, `rename()` over `filePath`. `rename` within the same filesystem is atomic on POSIX, so readers see either the old or the new file, never a partial one.

- Use `node:fs/promises` `open()` → `writeFile`/`write` → `fh.sync()` → `close()`, then `rename()`. Bun supports these.
- Before the rename, if `filePath` exists, copy/rename it to `filePath + ".bak"` first (best-effort; a failed backup MUST NOT block the primary save).

**Alternatives considered:** plain `writeFile` (rejected — the current bug); `write` with `O_SYNC` only (still non-atomic against truncation). Temp+rename is the standard durable-write idiom.

### Decision: Per-key serialization guard

Instead of `JSON.stringify(entireObject)`, build the output by attempting to serialize each entry. A per-key `try/JSON.stringify(value)` isolates failures; unserializable keys are skipped and logged at `warn`. Assemble the surviving pairs into one object and stringify that (which now cannot throw, since every value already serialized individually).

**Alternatives considered:** a `JSON.stringify` `replacer` that drops throwing values (rejected — `stringify` still aborts on circular refs regardless of replacer). Per-key try/catch is explicit and robust.

### Decision: Backup-based recovery in `load()`

`load()` parses the primary; on parse error it logs and tries `filePath + ".bak"`; on that failing too it starts empty. Keep the existing `ENOENT` debug behavior for the first-run case.

## Risks / Trade-offs

- **Extra disk I/O per save (temp + backup + rename)** → acceptable; saves are infrequent (shutdown / occasional API writes), not a hot path.
- **`.bak` and `.tmp` files appear alongside `state.json`** → documented; `.tmp` is transient, `.bak` is a single rolling backup. No unbounded growth.
- **Silently dropping an unserializable value hides a caller bug** → mitigated by logging the key at `warn` so it is discoverable.
- **`Date`/`Map`/`Set` still round-trip lossily** → out of scope; unchanged from today, explicitly a non-goal.

## Migration Plan

- Backward compatible: an existing `state.json` loads unchanged. No config or env changes.
- First save after upgrade creates `state.json.bak`. No manual migration.
- Rollback: reverting the code leaves any `.bak`/`.tmp` files harmless (ignored by old code).
