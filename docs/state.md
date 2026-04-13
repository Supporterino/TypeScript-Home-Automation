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
// Write — also fires state triggers in other automations
this.state.set<boolean>("night_mode", true);
this.state.set<number>("motion_count", 42);
this.state.set("last_motion", { room: "hallway", time: Date.now() });

// Read with optional default
const isNight = this.state.get<boolean>("night_mode", false);
const count   = this.state.get<number>("motion_count", 0);

// Check existence
if (this.state.has("night_mode")) { /* ... */ }

// Delete
this.state.delete("temporary_flag");
```

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
      filter: (newValue) => newValue === true,
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

The [Web Status Page](http/status-page.md) provides a live table view of all state keys with inline editing and add/delete support.
