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

## Web UI

When `WEB_UI_ENABLED=true` and `DEVICE_REGISTRY_ENABLED=true`, the browser dashboard includes a **Devices** tab. Each device is displayed as an expandable card (Accordion) showing:

- Device type and interview state (color-coded badges)
- IEEE address, supported status, power source
- Model/vendor/description (when device is supported)
- Full live state as a key-value table

When the registry is disabled, the tab shows an informational notice instead of a device list.

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
| `interview_state` | `"PENDING" \| "IN_PROGRESS" \| "SUCCESSFUL" \| "FAILED"` | Interview status |
| `power_source` | `string \| null \| undefined` | E.g. `"Mains"`, `"Battery"` |
| `definition` | `ZigbeeDeviceDefinition \| null` | Model info — `null` when `supported` is `false` |

### `ZigbeeDeviceDefinition`

| Field | Type | Description |
|---|---|---|
| `model` | `string` | Model identifier (e.g. `LCA001`) |
| `vendor` | `string` | Manufacturer name |
| `description` | `string` | Human-readable description |
| `exposes` | `unknown[]` | Z2M exposes definitions |
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
