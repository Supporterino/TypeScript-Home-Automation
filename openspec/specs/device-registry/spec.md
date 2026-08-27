# Device Registry

## Purpose

Discovers Zigbee2MQTT devices, tracks their live state, and exposes device metadata and state change events to automations. Enabled via `DEVICE_REGISTRY_ENABLED=true`. When disabled, `deviceRegistry` is `null` throughout the engine.

## Requirements

### Requirement: Lifecycle

The registry MUST follow a strict lifecycle:

1. **`load()`** — Restore persisted data (if enabled). Called after state load, before `start()`.
2. **`start()`** — Subscribe to bridge topics. Called after MQTT connects.
3. **`stop()`** — Unsubscribe all topics, clear internal state. Called during shutdown.
4. **`save()`** — Persist device list and state. Called before shutdown.

### Requirement: Bridge Topics

The system MUST subscribe to two Zigbee2MQTT bridge topics:

**`{prefix}/bridge/devices`** (retained)
- Contains the full device list as `ZigbeeDevice[]`
- On receipt, diff against current registry: add new devices, update existing, remove missing
- Coordinator devices are excluded

**`{prefix}/bridge/event`**
- Contains join/leave events as `BridgeEventPayload`
- Before dereferencing event fields, the system MUST validate that the payload has a `data` object; a malformed event lacking `data` (or a usable `friendly_name`) MUST be skipped with a warning rather than throwing
- On `device_joined` or `device_leave`: request a fresh `bridge/devices` publish via `{prefix}/bridge/request/devices`

#### Scenario: Malformed bridge event is skipped, not fatal

- **WHEN** a `bridge/event` message arrives without a `data` field
- **THEN** the system logs a warning and skips the event without throwing, and the MQTT message handler continues to function

### Requirement: Per-Device State Tracking

For each tracked device, the system MUST:
1. Subscribe to `{prefix}/{friendly_name}` (the device's state topic)
2. Only when the incoming payload is a non-null object, **merge** it into the previous state: `next = { ...prev, ...payload }`; a non-object payload (e.g. a bare availability string such as `"online"`, a number, or `null`) MUST be ignored (debug-logged) rather than spread into state
3. Notify registered `DeviceStateChangeHandler` listeners with `(next, prev)`

State merging mirrors Zigbee2MQTT behavior — partial updates (e.g., only `brightness`) don't lose other properties.

#### Scenario: Object payload merges into state

- **WHEN** a device publishes a partial JSON object (e.g. `{ "brightness": 128 }`)
- **THEN** it is merged into the previous state and listeners are notified

#### Scenario: Non-object payload does not corrupt state

- **WHEN** a device topic receives a non-object payload (e.g. the string `"online"`)
- **THEN** the payload is ignored (debug-logged) and the existing device state is left unchanged

### Requirement: Device List Management

**`getDevices(): ZigbeeDevice[]`** — All tracked non-coordinator devices

**`getDevice(friendlyName): ZigbeeDevice | undefined`** — Single device by friendly name

**`hasDevice(friendlyName): boolean`** — Whether a device is tracked

### Requirement: State Query

**`getDeviceState(friendlyName): Record<string, unknown> | undefined`** — Last-known merged state

### Requirement: Event Listeners

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

### Requirement: Nice Names

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

### Requirement: Persistence

When `persist` is enabled:
- `save()` writes both device list and state JSON to `filePath`
- `load()` restores both on startup
- Incoming MQTT data always overwrites restored values — persisted data is a cold-start seed, never a source of truth
- `ENOENT` on load is silently handled (no persisted file yet)

### Requirement: Error Handling

The system MUST:
- Validate incoming payloads (array check, object check, friendly_name type check)
- Skip malformed entries with a warning
- Catch and log errors from listener callbacks — one failing listener does not affect others
- Log error on persistence failures, continue running

### Requirement: Disabled Mode

When `DEVICE_REGISTRY_ENABLED=false`:
- No `DeviceRegistry` is created
- `engine.deviceRegistry` is `null`
- `automationContext.deviceRegistry` is `null`
- Device-related triggers (`device_state`, `device_joined`, `device_left`) warn and skip registration

### Requirement: Device Capability Schema Access

The registry MUST retain each tracked device's published capability schema — the
Zigbee2MQTT `exposes` description — and MUST make it readable by consumers.

The schema MUST be typed rather than opaque, describing at minimum, for each
declared entry: its kind, the property it reads or writes, whether it is
readable, writable, or both, its value type, and its constraints — numeric range
and step where applicable, permitted values where enumerated, and unit where
supplied. Composite entries that group nested features MUST preserve that
nesting.

The schema MUST be expressed in the shared, source-neutral capability vocabulary
rather than in a Zigbee-specific one, since sources that publish no schema of
their own describe themselves in the same terms. The registry maps what the
bridge publishes into that vocabulary; it does not define it.

An entry whose shape the engine does not recognise MUST be preserved and
surfaced rather than discarded, so that a consumer can still present it.

The schema MUST be included in the registry's persisted snapshot and restored on
load, so that capability information is available before the bridge republishes
its device list.

#### Scenario: Capability schema is readable

- **WHEN** a consumer reads a tracked device
- **THEN** the device's published capability schema is available, describing its
  readable and writable properties with their constraints

#### Scenario: Nested features are preserved

- **WHEN** a device publishes a composite entry grouping several features, such
  as a light with brightness and colour temperature
- **THEN** the nested features are preserved with their individual constraints

#### Scenario: Unrecognised entry is preserved

- **WHEN** a device publishes a capability entry of a kind the engine has no
  specific handling for
- **THEN** the entry is retained and surfaced rather than dropped

#### Scenario: Schema survives a restart

- **WHEN** the registry is loaded from its persisted snapshot before the bridge
  has republished its device list
- **THEN** each restored device's capability schema is available

#### Scenario: Device without a schema is well-formed

- **WHEN** a tracked device publishes no capability schema
- **THEN** it is described as having an empty schema rather than an absent one

### Requirement: Registry Persistence Default

Registry persistence MUST be enabled by default, matching the state store, so
that the device list and each device's capability schema are available
immediately on boot rather than only after the bridge republishes.

An operator MAY still disable it explicitly. Because this reverses the previous
default, an existing deployment that has never set `DEVICE_REGISTRY_PERSIST` MUST
begin persisting its snapshot after upgrading.

#### Scenario: Registry persistence is on when unset

- **WHEN** `DEVICE_REGISTRY_PERSIST` is not set and the registry is enabled
- **THEN** the registry snapshot is persisted and restored across restarts

#### Scenario: Devices are available before the bridge republishes

- **WHEN** the engine restarts and the bridge has not yet published its device
  list
- **THEN** the previously tracked devices and their capability schemas are
  already readable

#### Scenario: Registry persistence can still be disabled

- **WHEN** `DEVICE_REGISTRY_PERSIST` is explicitly set to false
- **THEN** no snapshot is written and the registry repopulates from the bridge
