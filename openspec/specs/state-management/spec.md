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

The system MUST persist and restore state durably: writes MUST be atomic and
resilient to individual unserializable values, loads MUST recover gracefully
from a corrupt file, and mutations MUST be written behind automatically rather
than only at shutdown.

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

**Write-behind**
- When `persist` is `true`, any mutation of the store — setting a value or
  deleting a key — MUST schedule a save
- Mutations occurring within the configured flush interval MUST be coalesced
  into a single save, so that a burst of writes does not produce a burst of
  file operations
- The system MUST NOT perform a file write on every mutation
- A save MUST still occur on graceful shutdown, flushing any pending mutation
  immediately rather than waiting for the interval to elapse
- A failed scheduled save MUST be logged and MUST NOT prevent subsequent
  mutations or subsequent saves
- Consequence: an abrupt termination loses at most the mutations made within the
  flush interval, rather than every mutation since startup

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

#### Scenario: Mutation is written behind without shutdown

- **WHEN** a value is set while persistence is enabled and the flush interval
  elapses
- **THEN** the value is present in `filePath` without the engine having been
  stopped

#### Scenario: A burst of writes produces one save

- **WHEN** many values are set in rapid succession within one flush interval
- **THEN** exactly one save is performed, containing all of them

#### Scenario: Abrupt termination loses at most one interval

- **WHEN** a value is set, the flush interval elapses, and the process is then
  killed without a graceful shutdown
- **THEN** the value is present on next `load()`

#### Scenario: Shutdown flushes pending writes immediately

- **WHEN** a value is set and the engine is stopped before the flush interval
  elapses
- **THEN** the pending mutation is written before shutdown completes

#### Scenario: Persistence disabled performs no writes

- **WHEN** `persist` is `false` and values are set
- **THEN** no scheduled save occurs and no file is written

#### Scenario: A failed save does not wedge persistence

- **WHEN** a scheduled save fails
- **THEN** the error is logged and a subsequent mutation still schedules and
  performs a save

### Requirement: Configuration

```ts
interface StateManagerOptions {
  persist?: boolean;     // default: true
  filePath?: string;     // default: "./state.json"
  flushIntervalMs?: number; // default: 1000
}
```

The `persist` option can be set via `STATE_PERSIST` env var or `options.state.persist` in `createEngine()`.

Persistence MUST be enabled by default. The store holds user-authored data —
room definitions and assignments, and automation enabled flags — that other
capabilities require to survive a restart, and that guarantee MUST NOT depend on
an opt-in setting. An operator MAY still disable persistence explicitly, in which
case that data is understood to be lost on restart.

Because this reverses the previous default, an existing deployment that has never
set `STATE_PERSIST` MUST begin persisting after upgrading, and MUST create its
state file on first flush if it does not exist.

#### Scenario: Persistence is on when unset

- **WHEN** neither `STATE_PERSIST` nor `options.state.persist` is provided
- **THEN** state is persisted and restored across restarts

#### Scenario: Persistence can still be disabled

- **WHEN** `STATE_PERSIST` is explicitly set to false
- **THEN** no save is scheduled or performed and no state file is written

The `flushIntervalMs` option controls how long mutations are coalesced before a
write-behind save is performed. It can be set via `STATE_FLUSH_MS` env var or
`options.state.flushIntervalMs` in `createEngine()`. It exists so that operators
on wear-sensitive storage can lengthen the interval and operators on fast
storage can shorten it, trading durability against write frequency. A value of
`0` MUST mean "save on every mutation".

#### Scenario: Flush interval is configurable

- **WHEN** `STATE_FLUSH_MS` is set to a non-default value
- **THEN** mutations are coalesced over that interval rather than the default

#### Scenario: Zero interval saves on every mutation

- **WHEN** the flush interval is configured as `0`
- **THEN** each mutation results in a save

### Requirement: Naming Conventions

State keys SHOULD use `snake_case`. Keys prefixed with a colon-scoped namespace are recommended for multi-automation state:
- `"night_mode"` — global state
- `"motion-light:lights_on"` — scoped state

### Requirement: Write Attribution

When a state mutation occurs during an automation run, the system MUST record
which automation performed it, so that consumers can report the state keys an
automation has been observed writing.

Attribution MUST be correct under concurrent automation runs, and MUST survive
asynchronous suspension within a run. A mutation performed outside any
automation run MUST be recorded as unattributed.

Attribution MUST NOT change the value stored, MUST NOT alter change-listener
notification, and MUST NOT be required for the store to function.

#### Scenario: Write during a run is attributed

- **WHEN** an automation sets a state key during its execution
- **THEN** the mutation is attributed to that automation

#### Scenario: Write after an await is attributed

- **WHEN** an automation awaits and then sets a state key
- **THEN** the mutation is still attributed to that automation

#### Scenario: API write is unattributed

- **WHEN** a state key is set through the HTTP API
- **THEN** the mutation is recorded as unattributed

#### Scenario: Attribution does not alter stored values

- **WHEN** a value is set with and without an attributed automation
- **THEN** the stored value and the notifications delivered to change listeners
  are identical in both cases

### Requirement: Reserved Internal Namespace

The state store holds two kinds of data that are not user-facing state: room
definitions and assignments, and automation enabled flags. These MUST live under
a reserved key namespace that public callers cannot write and that is omitted
from enumeration.

The reserved namespace MUST be identified by a prefix that no automation-scoped
key can produce. Automation-scoped keys take the form `<automation-name>:<key>`,
and automation names derive from kebab-case filenames, so the reserved prefix
MUST begin with a character that cannot begin an automation name.

`set()` and `delete()` MUST reject a reserved key supplied by a public caller,
including an automation, by throwing. The system MUST provide an internal write
path used by the room and automation-enabled writers that bypasses this check.
Apart from who may write them, reserved keys MUST behave as ordinary state: they
are persisted, they participate in write-behind coalescing, and they notify
change listeners.

Enumeration MUST exclude reserved keys. Any operation that lists keys or reports
a key count for external consumption MUST omit them, and MUST omit them
consistently, so that a reported count always matches the set of keys reported
alongside it.

Rejecting a write MUST NOT modify the store.

#### Scenario: An automation cannot write a reserved key

- **WHEN** an automation calls `set()` with a key in the reserved namespace
- **THEN** the call throws, the store is unchanged, and the failure is attributed
  to that automation

#### Scenario: An automation cannot delete a reserved key

- **WHEN** an automation calls `delete()` with a key in the reserved namespace
- **THEN** the call throws and the existing value is retained

#### Scenario: The internal write path succeeds

- **WHEN** the room writer stores a room assignment through the internal path
- **THEN** the value is stored, persisted under the configured flush behaviour,
  and delivered to change listeners

#### Scenario: Reserved keys are excluded from enumeration

- **WHEN** the store contains both ordinary keys and reserved keys
- **THEN** enumeration returns only the ordinary keys, and any accompanying count
  equals the number of keys returned

#### Scenario: An automation name cannot reach the namespace

- **WHEN** an automation writes a key scoped under its own name
- **THEN** the key cannot fall within the reserved namespace regardless of the
  automation's name
