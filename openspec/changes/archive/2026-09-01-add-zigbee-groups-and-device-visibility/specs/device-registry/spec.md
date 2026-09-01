## MODIFIED Requirements

### Requirement: Bridge Topics

The system MUST subscribe to three Zigbee2MQTT bridge topics:

**`{prefix}/bridge/devices`** (retained)
- Contains the full device list as `ZigbeeDevice[]`
- On receipt, diff against current registry: add new devices, update existing, remove missing
- Coordinator devices are excluded

**`{prefix}/bridge/groups`** (retained)
- Contains the full group list, each group carrying a numeric identifier, a
  friendly name, and its members
- On receipt, diff against the currently tracked groups: add new groups, update
  existing, remove missing
- A payload that is not a list, or an entry that cannot be identified, MUST be
  skipped with a warning rather than aborting the update or throwing

**`{prefix}/bridge/event`**
- Contains join/leave events as `BridgeEventPayload`
- Before dereferencing event fields, the system MUST validate that the payload has a `data` object; a malformed event lacking `data` (or a usable `friendly_name`) MUST be skipped with a warning rather than throwing
- On `device_joined` or `device_leave`: request a fresh `bridge/devices` publish via `{prefix}/bridge/request/devices`

#### Scenario: Malformed bridge event is skipped, not fatal

- **WHEN** a `bridge/event` message arrives without a `data` field
- **THEN** the system logs a warning and skips the event without throwing, and the MQTT message handler continues to function

#### Scenario: The group list is tracked

- **WHEN** a `bridge/groups` message arrives with a list of groups
- **THEN** each identifiable group is tracked, and any previously tracked group
  absent from the list is removed

#### Scenario: Malformed group payload is skipped, not fatal

- **WHEN** a `bridge/groups` message arrives whose payload is not a list
- **THEN** the system logs a warning, leaves the tracked groups unchanged, and does
  not throw

### Requirement: Persistence

When `persist` is enabled:
- `save()` writes the device list, the group list, and state JSON to `filePath`
- `load()` restores all three on startup
- Incoming MQTT data always overwrites restored values — persisted data is a cold-start seed, never a source of truth
- `ENOENT` on load is silently handled (no persisted file yet)
- A snapshot written before groups were persisted MUST load without error, with no
  groups restored

#### Scenario: Groups are written and restored with devices

- **WHEN** persistence is enabled and the engine restarts
- **THEN** the device list, the group list, and the tracked state are all restored

#### Scenario: An older snapshot without groups still loads

- **WHEN** a snapshot written before groups were persisted is loaded
- **THEN** the devices and state are restored, no groups are restored, and no error
  is raised

#### Scenario: Published data overwrites the restored snapshot

- **WHEN** the bridge publishes device and group lists after a restore
- **THEN** the published lists replace the restored ones
