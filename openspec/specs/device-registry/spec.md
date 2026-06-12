# Device Registry

## Purpose

Discovers Zigbee2MQTT devices, tracks their live state, and exposes device metadata and state change events to automations. Enabled via `DEVICE_REGISTRY_ENABLED=true`. When disabled, `deviceRegistry` is `null` throughout the engine.

## Requirements

### Lifecycle

The registry MUST follow a strict lifecycle:

1. **`load()`** — Restore persisted data (if enabled). Called after state load, before `start()`.
2. **`start()`** — Subscribe to bridge topics. Called after MQTT connects.
3. **`stop()`** — Unsubscribe all topics, clear internal state. Called during shutdown.
4. **`save()`** — Persist device list and state. Called before shutdown.

### Bridge Topics

The system MUST subscribe to two Zigbee2MQTT bridge topics:

**`{prefix}/bridge/devices`** (retained)
- Contains the full device list as `ZigbeeDevice[]`
- On receipt, diff against current registry: add new devices, update existing, remove missing
- Coordinator devices are excluded

**`{prefix}/bridge/event`**
- Contains join/leave events as `BridgeEventPayload`
- On `device_joined` or `device_leave`: request a fresh `bridge/devices` publish via `{prefix}/bridge/request/devices`

### Per-Device State Tracking

For each tracked device, the system MUST:
1. Subscribe to `{prefix}/{friendly_name}` (the device's state topic)
2. On each message, **merge** the incoming payload into the previous state: `next = { ...prev, ...payload }`
3. Notify registered `DeviceStateChangeHandler` listeners with `(next, prev)`

State merging mirrors Zigbee2MQTT behavior — partial updates (e.g., only `brightness`) don't lose other properties.

### Device List Management

**`getDevices(): ZigbeeDevice[]`** — All tracked non-coordinator devices

**`getDevice(friendlyName): ZigbeeDevice | undefined`** — Single device by friendly name

**`hasDevice(friendlyName): boolean`** — Whether a device is tracked

### State Query

**`getDeviceState(friendlyName): Record<string, unknown> | undefined`** — Last-known merged state

### Event Listeners

The system MUST support three listener types:

#### Device State Change
```ts
type DeviceStateChangeHandler = (state: Record<string, unknown>, prev: Record<string, unknown> | undefined) => void;
```
- `onDeviceStateChange(friendlyName, handler)` — Register
- `offDeviceStateChange(friendlyName, handler)` — Remove

#### Device Added
```ts
type DeviceAddedHandler = (device: ZigbeeDevice) => void;
```
- `onDeviceAdded(handler)` — Register (fires for every device when it appears)
- `offDeviceAdded(handler)` — Remove

#### Device Removed
```ts
type DeviceRemovedHandler = (device: ZigbeeDevice) => void;
```
- `onDeviceRemoved(handler)` — Register (fires when a device disappears)
- `offDeviceRemoved(handler)` — Remove

### Nice Names

The system MUST support human-readable device names via `DeviceNiceNames`:

```ts
interface DeviceNiceNames {
  devices?: Record<string, string>;       // Explicit per-device mappings
  transform?: (friendlyName: string) => string;  // Global fallback transform
}
```

`getNiceName(friendlyName): string` resolves in order:
1. Explicit `devices` entry
2. `transform(friendlyName)` result
3. Raw `friendly_name` as-is

### Persistence

When `persist` is enabled:
- `save()` writes both device list and state JSON to `filePath`
- `load()` restores both on startup
- Incoming MQTT data always overwrites restored values — persisted data is a cold-start seed, never a source of truth
- `ENOENT` on load is silently handled (no persisted file yet)

### Error Handling

The system MUST:
- Validate incoming payloads (array check, object check, friendly_name type check)
- Skip malformed entries with a warning
- Catch and log errors from listener callbacks — one failing listener does not affect others
- Log error on persistence failures, continue running

### Disabled Mode

When `DEVICE_REGISTRY_ENABLED=false`:
- No `DeviceRegistry` is created
- `engine.deviceRegistry` is `null`
- `automationContext.deviceRegistry` is `null`
- Device-related triggers (`device_state`, `device_joined`, `device_left`) warn and skip registration
