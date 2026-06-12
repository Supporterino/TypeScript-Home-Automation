# State Management

## Purpose

An in-memory key-value store with typed access, change listeners, and optional JSON file persistence. Automations use it to share state with each other and react to state changes via the `state` trigger type.

## Requirements

### Core Operations

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

### Change Listeners

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

### Listener Notification

Listeners MUST fire synchronously during the same event loop tick as `set()` / `delete()`. This enables state-triggered automations to react immediately.

The system MUST catch errors from individual listeners and log them — one failing listener MUST NOT prevent other listeners from firing.

### Equality Check

The system MUST compare values before notifying listeners:
- Strict equality (`===`) for primitives
- `JSON.stringify` comparison for objects
- Returns `false` on comparison errors (graceful degradation)

### Persistence

**`load(): Promise<void>`**
- Only operates when `persist` is `true`
- Reads JSON from `filePath`
- Restores all key-value pairs into the in-memory store
- Logs info with key count on success
- Silently handles `ENOENT` (no persisted file yet — debug log)
- Logs error on other failures

**`save(): Promise<void>`**
- Only operates when `persist` is `true`
- Serializes the entire store to JSON
- Creates parent directories (`mkdir -p` style)
- Writes to `filePath` with 2-space indentation
- Logs info with key count on success
- Logs error on failure

### Configuration

```ts
interface StateManagerOptions {
  persist?: boolean;   // default: false
  filePath?: string;   // default: "./state.json"
}
```

The `persist` option can be set via `STATE_PERSIST` env var or `options.state.persist` in `createEngine()`.

### Naming Conventions

State keys SHOULD use `snake_case`. Keys prefixed with a colon-scoped namespace are recommended for multi-automation state:
- `"night_mode"` — global state
- `"motion-light:lights_on"` — scoped state
