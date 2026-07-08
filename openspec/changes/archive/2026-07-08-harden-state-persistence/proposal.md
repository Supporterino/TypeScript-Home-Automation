## Why

State persistence has two silent data-loss bugs. `save()` writes directly to `state.json`, so a crash or power loss mid-write leaves a truncated file that fails to parse on next boot — discarding all persisted state. And because the entire store is serialized in a single `JSON.stringify`, one non-serializable value (a circular reference, `BigInt`, etc.) throws and prevents the whole file from ever being written, losing all state on shutdown. Both are triggerable by automations and by the `PUT /api/state/:key` endpoint.

## What Changes

- Make `save()` an atomic write: serialize to a temp file, `fsync`, then `rename` over the target so a partial write can never corrupt `state.json`.
- Make serialization fault-tolerant per key: a value that cannot be serialized is skipped (and logged) rather than aborting the entire save, so one bad value never loses all other state.
- On `load()`, treat a corrupt/unparseable state file as recoverable: log the error, attempt a `.bak` fallback if present, and start with an empty store instead of only logging.
- Keep a single previous-good copy (`state.json.bak`) so a corrupt primary file can be recovered.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `state-management`: The `save()` and `load()` persistence requirements change — atomic durable writes, per-key serialization resilience, and corruption recovery.

## Impact

- Code: `src/core/state/state-manager.ts` (`save()`, `load()`, add serialization guard + atomic write helper).
- Behavior: on disk there will now be a transient `state.json.tmp` during writes and a persisted `state.json.bak` backup.
- Tests: `tests/state-manager.test.ts` — add cases for atomic write, unserializable-value skip, corrupt-file recovery.
- No API surface change; no breaking change for callers.
