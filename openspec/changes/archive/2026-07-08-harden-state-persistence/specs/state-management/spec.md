## MODIFIED Requirements

### Requirement: Persistence

The system MUST persist and restore state durably: writes MUST be atomic and resilient to individual unserializable values, and loads MUST recover gracefully from a corrupt file.

**`load(): Promise<void>`**
- Only operates when `persist` is `true`
- Reads JSON from `filePath`
- Restores all key-value pairs into the in-memory store
- Logs info with key count on success
- Silently handles `ENOENT` (no persisted file yet — debug log)
- On a corrupt or unparseable primary file, the system MUST NOT throw; it MUST log an error and attempt to recover from the backup file (`filePath` + `.bak`) if present
- If neither the primary nor the backup file can be parsed, the system MUST start with an empty in-memory store and log an error (state is not fatally lost from the process — it simply starts fresh)

**`save(): Promise<void>`**
- Only operates when `persist` is `true`
- Serializes the store to JSON with 2-space indentation
- A value that cannot be serialized MUST be skipped individually (logged with its key) rather than aborting the entire save — one bad value MUST NOT prevent all other keys from being persisted
- Writes MUST be atomic and durable: the serialized content MUST be written to a temporary file, flushed to disk, and then atomically renamed over `filePath`, so an interrupted write can never leave `filePath` truncated or corrupt
- Before replacing `filePath`, the previous good file MUST be preserved as a backup (`filePath` + `.bak`)
- Creates parent directories (`mkdir -p` style)
- Logs info with key count on success
- Logs error on failure

#### Scenario: Atomic write survives interruption

- **WHEN** `save()` is interrupted (crash/power loss) after the temp file is written but before the rename completes
- **THEN** the existing `state.json` remains intact and parseable, and no truncated/partial `state.json` is ever observed by a subsequent `load()`

#### Scenario: Unserializable value does not abort the save

- **WHEN** the store contains one value that `JSON.stringify` cannot serialize (e.g. a circular reference or `BigInt`) alongside serializable values
- **THEN** the offending key is skipped and logged, and all other keys are still written to `filePath`

#### Scenario: Corrupt primary file recovers from backup

- **WHEN** `load()` reads a `state.json` that is truncated or not valid JSON, and a valid `state.json.bak` exists
- **THEN** the system logs the corruption, restores key-value pairs from the backup, and does not throw

#### Scenario: Corrupt primary and no backup starts empty

- **WHEN** `load()` reads a corrupt `state.json` and no valid backup exists
- **THEN** the system logs an error, starts with an empty store, and does not throw

#### Scenario: Successful save preserves prior copy as backup

- **WHEN** `save()` completes successfully and a prior `state.json` existed
- **THEN** the prior content is available as `state.json.bak` after the new file is written
