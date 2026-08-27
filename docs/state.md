# State Management

The engine includes a shared in-memory state store. Any automation can read and write state, and other automations can react to changes via `state` triggers. State can optionally be persisted to disk across restarts.

---

## Setup

```ts
const engine = createEngine({
  automationsDir: "./src/automations",
  state: {
    persist: true,                   // default: true — see write-behind below
    filePath: "./data/state.json",   // defaults to ./state.json
    flushIntervalMs: 1000,           // default: 1000 — write-behind debounce window
  },
});
```

Or via environment variables:

```bash
STATE_PERSIST=true
STATE_FILE_PATH=./data/state.json
STATE_FLUSH_MS=1000
```

State is always available in-memory regardless of persistence. The `persist` flag only controls whether it survives a restart.

> **`STATE_PERSIST` defaults to `true`** (a breaking default change from
> earlier versions, which defaulted to `false`). The store now holds room
> definitions and automation enabled flags, which must survive a restart for
> those features to work at all (design.md D6, R14). Set `STATE_PERSIST=false`
> explicitly to opt back out.

### Write-behind persistence

Writing through to disk on every `set()` is not viable — state keys are
written on routine sensor traffic, and a full save rewrites the whole map
with an `fsync`. Instead, mutations are coalesced: a save is scheduled
`flushIntervalMs` after the last mutation, and multiple writes inside that
window produce one save rather than one per write.

`flushIntervalMs: 0` saves on every mutation instead of scheduling — useful
for tests or for storage where the debounce isn't wanted.

**Trade-off:** an abrupt kill (power loss, `SIGKILL`) loses mutations from
the current flush window, whereas earlier versions with `STATE_PERSIST=false`
lost everything since boot. Raise `STATE_FLUSH_MS` on SD-card-backed hosts to
reduce write wear; lower it on fast storage to shrink the loss window. A
graceful shutdown (`engine.stop()`) always flushes synchronously regardless
of the debounce window.

---

## Reading and writing

```ts
// Write — fires state triggers in other automations
// Note: set() is a no-op when the new value equals the current value
// (compared via JSON.stringify for objects, strict equality for primitives),
// so duplicate writes do not trigger spurious change events.
this.state.set<boolean>("night_mode", true);
this.state.set<number>("motion_count", 42);
this.state.set("last_motion", { room: "hallway", time: Date.now() });

// Read with optional default
const isNight = this.state.get<boolean>("night_mode", false);
const count   = this.state.get<number>("motion_count", 0);

// Check existence and enumerate keys
if (this.state.has("night_mode")) { /* ... */ }
const allKeys = this.state.keys();  // string[]

// Delete
this.state.delete("temporary_flag");
```

### Listening for any change

Use `onAnyChange` to register a global listener that fires on every state mutation — useful for audit logging or debugging:

```ts
this.state.onAnyChange((key, newValue, oldValue) => {
  this.logger.debug({ key, newValue, oldValue }, "State changed");
});
```

Remove a global listener with `offAnyChange(handler)`. Per-key listeners can be registered with `onChange(key, handler)` and removed with `offChange(key, handler)`.

> **Note on object equality:** `StateManager` uses `JSON.stringify` to compare old and new values before firing listeners. This means that two objects with identical properties but different key-insertion order will be treated as different values and will trigger a change event spuriously. Use primitive values or consistently constructed objects for state keys that should avoid duplicate events.

---

## State triggers

React to state changes from another automation using the `state` trigger type:

```ts
export default class NightModeReaction extends Automation {
  readonly name = "night-mode-reaction";

  readonly triggers: Trigger[] = [
    {
      type: "state",
      key: "night_mode",
      // Both newValue and oldValue are available in the filter
      filter: (newValue, oldValue) => newValue === true && oldValue !== true,
    },
  ];

  async execute(context: TriggerContext): Promise<void> {
    if (context.type !== "state") return;
    this.logger.info(
      { key: context.key, value: context.newValue },
      "Night mode activated",
    );
    this.mqtt.publishToDevice("living_room_lamp", { color_temp: 500 });
  }
}
```

This enables clean cross-automation communication: one automation sets a flag, any number of other automations react to it independently.

---

## Key naming conventions

Prefix state keys with the automation name to avoid accidental collisions:

```ts
// Good — scoped to the automation
this.state.set("motion-light:lights_on", true);
this.state.set("alarm:armed", false);

// Avoid — global keys can conflict
this.state.set("lights_on", true);
```

---

## Reserved internal namespace

State keys beginning with the sigil prefix **`$internal:`** are reserved for
the engine's own use — currently room definitions and assignments, and
automation enabled flags (design.md D20). This namespace exists because both
of those need the same durability as ordinary state, but must not be
reachable through the same open surfaces ordinary state is: the operator
state view's full CRUD would let one `DELETE` wipe every room, and writing an
enabled flag as a raw value would set it without running the automation's
`stop()`/`start()`, silently decoupling what the UI reports from what is
actually still running.

Public callers cannot see or touch this namespace:

- `this.state.set()` and `this.state.delete()` **throw** `Error` when given a
  reserved key. This is a programmer-mistake error, not a logged-and-ignored
  one — it is never legitimate for an automation to write there, and silently
  discarding the write would leave an automation that appears to work while
  storing nothing.
- `GET /api/state` omits reserved keys from both the returned map **and**
  its `count`.
- The realtime event stream's state category never emits a reserved key.
- The operator state view (web and CLI) shows nothing beyond the filtered
  listing above — there is no free-text key field that could address a
  reserved key directly.

An automation name can never collide with the prefix: automation names
derive from kebab-case filenames and cannot begin with `$`, so the sigil
requires no additional validation elsewhere to stay unspoofable.

**Rooms and automation enabled flags are not eligible for `stateToggles`.**
Configured state toggles are the only allowlist-driven door from the state
store into a user-facing device, and reserved keys are never eligible for
that allowlist — configuring one is a configuration error. See
[HomeKit: Bridging state toggles](services/homekit.md#bridging-state-toggles)
and [Rooms](http/web-ui.md) for the endpoints that manage this data instead
of raw state access.

---

## CLI access

The `ts-ha` CLI can inspect and modify state on a running engine:

```bash
ts-ha state list                    # list all keys
ts-ha state get night_mode          # read a single key
ts-ha state set night_mode true     # set a value (fires state triggers)
ts-ha state delete temporary_flag   # delete a key
```

See [CLI Reference](cli.md) for full details.

---

## Web dashboard

The [Web UI](http/web-ui.md) provides a live table view of all state keys with inline editing and add/delete support.
