# State Management

## Purpose

An in-memory key-value store with typed access, change listeners, and optional JSON file persistence. Automations use it to share state with each other and react to state changes via the `state` trigger type.

## Requirements

### Requirement: Core Operations

The system MUST provide a `StateManager` class with:

**`get<T>(key, defaultValue?): T | undefined`**
- Returns the stored value cast to `T`
- Returns `defaultValue` if key doesn't exist
- Returns `undefined` if no default is provided and key doesn't exist

**`set<T>(key, value): void`**
- Stores the value
- Fires change listeners only if the value actually changed (checked via equality comparison)

**`delete(key): boolean`**
- Removes the key from the store
- Returns `true` if the key existed
- Fires change listeners if the key existed

**`has(key): boolean`** — Returns whether the key exists

**`keys(): string[]`** — Returns all stored keys

### Requirement: Change Listeners

**`onChange<T>(key, handler)`**
- Register a listener for a specific key
- Handler signature: `(key: string, newValue: T | undefined, oldValue: T | undefined) => void`
- The system MUST warn when more than 10 listeners accumulate on a single key (potential leak detection)

**`offChange<T>(key, handler)`**
- Remove a specific listener for a key
- Clean up the listener set when empty

**`onAnyChange(handler)`**
- Register a global listener that fires on any key change

**`offAnyChange(handler)`**
- Remove a global listener

### Requirement: Listener Notification

Listeners MUST fire synchronously during the same event loop tick as `set()` / `delete()`. This enables state-triggered automations to react immediately.

The system MUST catch errors from individual listeners and log them — one failing listener MUST NOT prevent other listeners from firing.

### Requirement: Equality Check

The system MUST compare values before notifying listeners:
- Strict equality (`===`) for primitives
- `JSON.stringify` comparison for objects
- Returns `false` on comparison errors (graceful degradation)

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

### Requirement: Configuration

```ts
interface StateManagerOptions {
  persist?: boolean;   // default: false
  filePath?: string;   // default: "./state.json"
}
```

The `persist` option can be set via `STATE_PERSIST` env var or `options.state.persist` in `createEngine()`.

### Requirement: Naming Conventions

State keys SHOULD use `snake_case`. Keys prefixed with a colon-scoped namespace are recommended for multi-automation state:
- `"night_mode"` — global state
- `"motion-light:lights_on"` — scoped state
