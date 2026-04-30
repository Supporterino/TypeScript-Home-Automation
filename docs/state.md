# State Management

The engine includes a shared in-memory state store. Any automation can read and write state, and other automations can react to changes via `state` triggers. State can optionally be persisted to disk across restarts.

---

## Setup

```ts
const engine = createEngine({
  automationsDir: "./src/automations",
  state: {
    persist: true,                   // save on shutdown, restore on startup
    filePath: "./data/state.json",   // defaults to ./state.json
  },
});
```

Or via environment variables:

```bash
STATE_PERSIST=true
STATE_FILE_PATH=./data/state.json
```

State is always available in-memory regardless of persistence. The `persist` flag only controls whether it survives a restart.

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
