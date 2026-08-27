# Device Registry

The device registry automatically discovers all Zigbee2MQTT devices on startup and tracks their live state. Once enabled, automations can react to state changes, joins, and departures using dedicated trigger types — without needing to hand-craft MQTT topics or manually parse `bridge/devices` payloads.

---

## Enabling

The registry is disabled by default. Set the environment variable to turn it on:

```bash
DEVICE_REGISTRY_ENABLED=true
```

Or via `.env`:

```bash
DEVICE_REGISTRY_ENABLED=true
```

---

## How it works

On startup (after MQTT connects) the registry:

1. **Subscribes to `{prefix}/bridge/devices`** — a retained topic that Zigbee2MQTT publishes on startup and whenever devices join or leave. The registry uses this to build the device list. The Coordinator entry is filtered out automatically.
2. **Subscribes to `{prefix}/bridge/event`** — to detect `device_joined` and `device_leave` events in real time, triggering a fresh request for the device list.
3. **Subscribes to `{prefix}/{friendlyName}`** for each tracked device — incoming payloads are **merged** on top of the previously-known state (matching Zigbee2MQTT's own behaviour, where a light may send only `brightness` without resending `state`).

The registry is accessible as `engine.deviceRegistry` (type `DeviceRegistry | null`) and as `this.deviceRegistry` inside automations.

---

## Persistence

`DEVICE_REGISTRY_PERSIST` **defaults to `true`** (a breaking default change —
design.md D6, R14): the device list and its mapped capability schema should
be readable immediately on boot, before Zigbee2MQTT republishes, and this
now matches `STATE_PERSIST` defaulting on for the same reason. Persistence
saves both the device list and last-known device states to a JSON file on
shutdown and restores them on startup. Set `DEVICE_REGISTRY_PERSIST=false`
explicitly to opt back out to the old purely-in-memory behaviour, where the
registry rebuilds from Zigbee2MQTT on every engine startup.

This is useful when:
- Automations query `getDeviceState()` immediately on startup before any MQTT messages arrive
- You want `getDevice()` to return results in the millisecond window before `bridge/devices` is received

Live MQTT data **always wins** — persisted values are a cold-start seed, not a source of truth. Incoming `bridge/devices` overwrites device metadata, and incoming state payloads are merged on top of restored state.

### Configuring

```bash
DEVICE_REGISTRY_PERSIST=true   # default
DEVICE_REGISTRY_FILE_PATH=./data/device-registry.json  # optional, default: ./device-registry.json
```

### Programmatic configuration

```ts
const engine = createEngine({
  automationsDir: "./src/automations",
  deviceRegistry: {
    persist: true,
    filePath: "./data/device-registry.json",
    names: {
      // nice names can be combined with persistence
      transform: (name) => name.replace(/_/g, " "),
    },
  },
});
```

`EngineOptions.deviceRegistry.persist` / `filePath` take precedence over the env vars, identical to how `EngineOptions.state` overrides `STATE_PERSIST` / `STATE_FILE_PATH`.

### File format

```json
{
  "devices": {
    "living_room_bulb": {
      "ieee_address": "0x00158d0001ab1234",
      "friendly_name": "living_room_bulb",
      "type": "Router",
      "supported": true,
      "disabled": false,
      "interview_state": "SUCCESSFUL",
      "power_source": "Mains",
      "definition": { "model": "LCA001", "vendor": "Philips", "description": "...", "source": "native", "exposes": [], "options": [] }
    }
  },
  "states": {
    "living_room_bulb": {
      "state": "ON",
      "brightness": 200,
      "color_temp": 4000
    }
  }
}
```

The file is written atomically on engine shutdown. Parent directories are created automatically. If the file does not exist on startup, the registry starts fresh without error.

---

## Device nice names

The `friendly_name` set in Zigbee2MQTT (e.g. `kitchen_motion_0x1a2b`) is often hard to read. The registry supports a human-readable name mapping via the `DeviceNiceNames` option on `createEngine()`.

### Configuration

```ts
import { createEngine } from "ts-home-automation";

const engine = createEngine({
  automationsDir: "./src/automations",
  deviceRegistry: {
    names: {
      // Per-device explicit overrides
      devices: {
        "kitchen_motion_0x1a2b": "Kitchen Motion Sensor",
        "living_room_bulb":      "Living Room Lamp",
        "hallway_plug_01":       "Hallway Plug",
      },

      // Global fallback transform — applied when no explicit entry exists
      transform: (friendlyName) => friendlyName.replace(/_/g, " "),
    },
  },
});
```

### Resolution order

`registry.getNiceName(friendlyName)` resolves in this order:

1. Explicit entry in `devices` map
2. Result of `transform(friendlyName)` if provided
3. Raw `friendly_name` as-is (no-op fallback)

```ts
registry.getNiceName("kitchen_motion_0x1a2b"); // → "Kitchen Motion Sensor"
registry.getNiceName("hallway_sensor");         // → "hallway sensor" (via transform)
registry.getNiceName("unknown_device");         // → "unknown_device" (raw fallback)
```

`getNiceName` works even before the device has been seen on the network — it only uses the mapping, not the live device list.

---

## Using in automations

`this.deviceRegistry` is available on every automation. It returns `null` when the registry is disabled — always null-check before use:

```ts
import { Automation, type Trigger, type TriggerContext } from "ts-home-automation";

export default class DeviceWatcher extends Automation {
  readonly name = "device-watcher";
  readonly triggers: Trigger[] = [];

  async onStart(): Promise<void> {
    const registry = this.deviceRegistry;
    if (!registry) {
      this.logger.warn("Device registry disabled — skipping setup");
      return;
    }

    // Log all currently tracked devices
    for (const device of registry.getDevices()) {
      this.logger.info(
        { name: registry.getNiceName(device.friendly_name), type: device.type },
        "Tracked device",
      );
    }
  }
}
```

### API reference

| Method | Returns | Description |
|---|---|---|
| `getDevices()` | `ZigbeeDevice[]` | All tracked non-coordinator devices |
| `getDevice(friendlyName)` | `ZigbeeDevice \| undefined` | Single device by friendly name |
| `hasDevice(friendlyName)` | `boolean` | Check if device is currently tracked |
| `getNiceName(friendlyName)` | `string` | Human-readable name using the configured mapping |
| `getDeviceState(friendlyName)` | `Record<string, unknown> \| undefined` | Last-known merged state, or `undefined` if no state received yet |
| `onDeviceStateChange(name, handler)` | `void` | Register a handler called on every state update for that device |
| `offDeviceStateChange(name, handler)` | `void` | Remove a previously-registered state handler |
| `onDeviceAdded(handler)` | `void` | Register a handler called when any device joins |
| `offDeviceAdded(handler)` | `void` | Remove an added-device handler |
| `onDeviceRemoved(handler)` | `void` | Register a handler called when any device leaves |
| `offDeviceRemoved(handler)` | `void` | Remove a removed-device handler |

---

## Device triggers

Three dedicated trigger types are available when the registry is enabled. When the registry is disabled, these triggers are skipped with a warning at startup — the automation still registers without them.

### `device_state`

Fires whenever a tracked device's merged state changes. An optional `filter` function receives the full merged state and the device metadata.

```ts
readonly triggers: Trigger[] = [
  {
    type: "device_state",
    friendlyName: "living_room_bulb",
    // Optional — only fire when state matches
    filter: (state, device) => state.state === "ON",
  },
];

async execute(context: TriggerContext): Promise<void> {
  if (context.type !== "device_state") return;

  const { friendlyName, state, device } = context;
  this.logger.info(
    { name: this.deviceRegistry?.getNiceName(friendlyName), brightness: state.brightness },
    "Bulb state changed",
  );
}
```

Context fields:

| Field | Type | Description |
|---|---|---|
| `context.type` | `"device_state"` | Discriminant |
| `context.friendlyName` | `string` | Device friendly name |
| `context.state` | `Record<string, unknown>` | Full merged device state |
| `context.device` | `ZigbeeDevice` | Device metadata from the registry |

### `device_joined`

Fires when a device joins the Zigbee network. Optionally scoped to a specific `friendlyName`; omit to fire for any device.

```ts
// Fire for any joining device
{ type: "device_joined" }

// Fire only for a specific device
{ type: "device_joined", friendlyName: "new_sensor" }
```

Context: `context.type === "device_joined"`, `context.device` — the `ZigbeeDevice` that joined.

### `device_left`

Fires when a device leaves the Zigbee network. Same scoping options as `device_joined`.

```ts
{ type: "device_left" }
{ type: "device_left", friendlyName: "old_plug" }
```

Context: `context.type === "device_left"`, `context.device` — the `ZigbeeDevice` that left.

### Combined example

```ts
export default class NetworkMonitor extends Automation {
  readonly name = "network-monitor";

  readonly triggers: Trigger[] = [
    { type: "device_joined" },
    { type: "device_left" },
    {
      type: "device_state",
      friendlyName: "front_door_sensor",
      filter: (state) => state.contact === false,
    },
  ];

  async execute(context: TriggerContext): Promise<void> {
    if (context.type === "device_joined") {
      await this.notify({
        title: "New Zigbee device",
        message: `${context.device.friendly_name} joined the network`,
      });
    } else if (context.type === "device_left") {
      await this.notify({
        title: "Device left",
        message: `${context.device.friendly_name} is no longer reachable`,
        priority: "high",
      });
    } else if (context.type === "device_state") {
      await this.notify({
        title: "Front door opened",
        message: "The front door contact sensor reports open",
        priority: "urgent",
      });
    }
  }
}
```

---

## CLI access

Requires `DEVICE_REGISTRY_ENABLED=true` on the running engine. See [CLI Reference](cli.md#devices) for full details.

```bash
# List all tracked devices
ts-ha devices list
ts-ha dv ls                          # short alias

# Get full detail for a single device
ts-ha devices get living_room_bulb
```

Example `ts-ha devices list` output:

```
NICE NAME                TYPE       INTERVIEW    STATE KEYS
Living Room Lamp         Router     SUCCESSFUL   8
Kitchen Motion Sensor    EndDevice  SUCCESSFUL   3
Hallway Plug             Router     SUCCESSFUL   5

3 devices
```

Example `ts-ha devices get living_room_bulb` output:

```
Nice Name:      Living Room Lamp
Friendly:       living_room_bulb
IEEE:           0x00158d0001ab1234
Type:           Router
Supported:      true
Interview:      SUCCESSFUL
Power:          Mains
Model:          LCA001  (Philips, Hue White and color ambiance)

State (8 keys):
  state                   ON
  brightness              200
  color_temp              4000
  color_mode              color_temp
  linkquality             92
  update_available        false
```

When the registry is disabled, both commands print a clear message and exit with code 1.

---

## Capability vocabulary

Zigbee2MQTT devices describe themselves through `definition.exposes` — a
Zigbee-specific shape carrying concepts (endpoints, clusters) that mean
nothing to an HTTP light panel or a Nanoleaf panel. Rather than exposing that
shape directly to consumers, the device registry **maps** each device's
`exposes` into a source-neutral capability vocabulary (`src/types/capabilities.ts`,
design.md D22) via `mapZ2MExposes()`:

```
   z2m exposes ──┐
   shelly (authored) ──┼──► capability vocabulary ──┬──► HAP projection (HomeKit)
   nanoleaf effects ───┤    (source-neutral)        └──► generic renderer (web UI)
   state toggle ───────┘
```

Shelly, Nanoleaf, and state-toggle devices describe themselves in the same
vocabulary — an authored description for Shelly (which publishes none), an
enumerated capability for Nanoleaf effects, and a single writable boolean for
a state toggle — so the web UI's generic device-detail view and HomeKit's
accessory factory both consume one shape regardless of source. See
[Web UI](http/web-ui.md) for how the vocabulary drives the generic control
renderer, and [HomeKit: Supported device types](services/homekit.md#supported-device-types)
for the HAP projection.

A `Capability` carries a `kind`, `access` (readable/writable), a `valueType`,
and — depending on kind — a `range`, `step`, or `permittedValues`. Container
capabilities (e.g. a light with brightness and color) nest their leaf
capabilities under `features`. The registry retains the raw `exposes` array
on `ZigbeeDeviceDefinition.exposes` alongside the mapped vocabulary; the
mapping is additive, not a replacement of what the bridge publishes.

---

## Web UI and unified device layer

Zigbee devices are exposed to the browser dashboard and to HomeKit through
the same shared, source-neutral device layer as Shelly, Nanoleaf, and state
toggles (`Engine.devices`) — not through a Zigbee-specific tab. Each Zigbee
device is addressed as a **qualified identifier** `zigbee:<ieee_address>`
(design.md D29) and appears in:

- `GET /api/device-catalog` — every device from every enabled source, each
  carrying its mapped capabilities, reachability, and observation mode
- The web UI's **Devices**, room, and device-detail views, which render
  controls generically from the mapped capability schema — there is no
  Zigbee-specific rendering code
- HomeKit, through the accessory factory described in
  [Supported device types](services/homekit.md#supported-device-types)

`GET /api/devices` and `GET /api/devices/:friendlyName` — the old
Zigbee-only endpoints — are **removed**, not repurposed; they return `410`.
See [API Reference](api-reference.md#httpserver) for the replacement and
[Configuration](configuration.md#breaking-changes-for-upgrading-operators)
for the migration note. When the registry is disabled, the unified endpoints
simply contribute no Zigbee devices — they do not error.

The CLI dashboard's **Devices** tab still reads the old endpoints and is
**not yet migrated** to the unified device layer; it degrades to reporting
devices unavailable rather than crashing. The CLI's other tabs (automations,
state, logs, HomeKit) are unaffected. Realigning the CLI dashboard onto the
unified device layer is tracked as a follow-up change (design.md R13).

---

## Types

### `ZigbeeDevice`

The device metadata object returned by `getDevices()`, `getDevice()`, and all device trigger contexts.

| Field | Type | Description |
|---|---|---|
| `friendly_name` | `string` | Zigbee2MQTT device name |
| `ieee_address` | `string` | Unique hardware address |
| `type` | `"Router" \| "EndDevice" \| "Coordinator"` | Zigbee device role |
| `supported` | `boolean` | Whether Z2M has a definition for this device |
| `disabled` | `boolean` | Whether disabled in Z2M |
| `description` | `string \| undefined` | Optional user-set description in Z2M |
| `interview_state` | `"PENDING" \| "IN_PROGRESS" \| "SUCCESSFUL" \| "FAILED"` | Interview status |
| `power_source` | `string \| null \| undefined` | E.g. `"Mains"`, `"Battery"` |
| `definition` | `ZigbeeDeviceDefinition \| null` | Model info — `null` when `supported` is `false` |

### `ZigbeeDeviceDefinition`

| Field | Type | Description |
|---|---|---|
| `model` | `string` | Model identifier (e.g. `LCA001`) |
| `vendor` | `string` | Manufacturer name |
| `description` | `string` | Human-readable description |
| `source` | `"native" \| "generated" \| "external"` | Where the device definition originates from |
| `exposes` | `unknown[]` | Raw Z2M exposes definitions. Mapped into the source-neutral `Capability[]` vocabulary consumed by the web UI and HomeKit — see [Capability vocabulary](#capability-vocabulary). |
| `options` | `unknown[]` | Z2M device options |

### `DeviceNiceNames`

| Field | Type | Description |
|---|---|---|
| `devices` | `Record<string, string>` | Per-device `friendlyName → niceName` map |
| `transform` | `(friendlyName: string) => string` | Global fallback transform |

All types are exported from the package:

```ts
import type { ZigbeeDevice, ZigbeeDeviceDefinition, DeviceNiceNames } from "ts-home-automation";
```
