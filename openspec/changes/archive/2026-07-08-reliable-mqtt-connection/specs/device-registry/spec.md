## MODIFIED Requirements

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
