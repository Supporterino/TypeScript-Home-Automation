# HomeKit State Toggles

## Purpose

Exposes boolean state keys from the shared `StateManager` as toggle switches in Apple Home, giving automations a human-controllable interface that syncs bidirectionally with HomeKit.

## Requirements

### Requirement: Configure state toggles

The system SHALL accept a static `stateToggles` list in engine-level
configuration, where each entry is `{ stateKey: string; name: string }`. `name`
is REQUIRED and is used as the toggle's display name wherever it is presented.
When the list is empty or omitted, no toggle devices are created.

The list SHALL NOT be an option of the HomeKit service. Toggles are presented as
devices through the shared `device-sources` capability and are consumed by every
sink, so configuring them inside one sink would make them unavailable to the
others. Supplying `stateToggles` under the HomeKit service options SHALL fail
configuration validation with a message naming the engine-level setting.

Only explicitly listed keys SHALL be exposed. The system SHALL NOT derive toggles
from the contents of the state store, so that keys it writes for its own purposes
— including room assignments and automation enabled flags — are never presented
as user-facing controls.

#### Scenario: Toggles declared in options

- **WHEN** `stateToggles` contains `{ stateKey: "night_mode", name: "Night Mode" }`
- **THEN** a toggle device named "Night Mode" is exposed for the `night_mode`
  state key, and a HomeKit switch accessory is bridged for it when the bridge is
  enabled

#### Scenario: Empty list creates nothing

- **WHEN** `stateToggles` is omitted or empty
- **THEN** no toggle devices are created and the bridge is unaffected

#### Scenario: The HomeKit service options are rejected

- **WHEN** `stateToggles` is supplied under the HomeKit service options
- **THEN** configuration validation fails with a message naming the engine-level
  setting to use instead

#### Scenario: Engine-internal keys are not toggles

- **WHEN** room assignments and automation enabled flags are written to the state
  store
- **THEN** they are not exposed as toggles, because only listed keys are exposed

### Requirement: Accessory identity is stable

Each state toggle SHALL be presented as a device whose stable identity is its
state key, so renaming the display name in configuration does not orphan it in
any consumer. In HomeKit it SHALL remain a `Switch` accessory whose UUID is
seeded from the state key, with accessory IDs namespaced by source
(`state:<stateKey>`).

Relocating the configuration and presenting toggles through the shared device
sources SHALL NOT change any accessory UUID, so an existing pairing survives.

#### Scenario: Renaming a toggle preserves identity

- **WHEN** a toggle's `name` is changed but its `stateKey` stays the same
- **THEN** the device keeps its stable identity and the accessory keeps its
  existing HomeKit UUID, and is not re-added as a new accessory

#### Scenario: Consolidation preserves accessory UUIDs

- **WHEN** an engine with an already-paired bridge is upgraded so that toggles are
  presented through the shared device sources
- **THEN** every toggle accessory's UUID is unchanged and no re-pairing is
  required

### Requirement: State changes appear in HomeKit

The state source SHALL subscribe to `StateManager.onChange` for each configured
key and propagate the new value to every consumer, including the accessory's `On`
characteristic. Truthy values SHALL map to ON and falsy values to OFF.

Because the source is in-process, observations SHALL be marked push-backed and
the device SHALL always be reported as reachable.

#### Scenario: Automation flips a state key

- **WHEN** an automation calls `state.set("night_mode", true)`
- **THEN** the corresponding HomeKit toggle's `On` characteristic becomes ON and
  the toggle device reports its new state to other consumers

#### Scenario: Deleting a key turns the toggle off

- **WHEN** a configured state key is deleted via `state.delete(key)`
- **THEN** the toggle reads as off rather than unknown or unreachable, and the
  `On` characteristic becomes OFF

### Requirement: Initial toggle value

When the bridge starts, each toggle SHALL read its current state value and seed the `On` characteristic from it. A missing or absent key SHALL default to OFF.

#### Scenario: Existing state seeds the toggle

- **WHEN** a toggle starts and its state key already holds a truthy value
- **THEN** the toggle's `On` characteristic is ON at start

#### Scenario: Missing key defaults to off

- **WHEN** a toggle starts and its state key does not exist
- **THEN** the toggle's `On` characteristic is OFF at start

### Requirement: HomeKit write-back to state

Commanding a toggle — from the Home app or from any other consumer of the shared
device sources — SHALL write a real boolean to the `StateManager` via
`state.set(stateKey, value)`, which fires state change listeners so
`state`-trigger automations react.

A command SHALL be validated against the toggle's declared boolean capability
before being written, on the same terms as a command to any other device.

#### Scenario: Toggle flipped in the Home app

- **WHEN** the user turns a toggle ON in the Home app
- **THEN** the underlying state key is set to the boolean `true` via the
  `StateManager`

#### Scenario: Toggle flipped from the web UI

- **WHEN** the user turns a toggle ON from the device control surface
- **THEN** the underlying state key is set to the boolean `true`, and the change
  is observed by the HomeKit bridge and by any connected dashboard

#### Scenario: State trigger automation reacts to a flip

- **WHEN** a toggle is flipped and an automation listens for changes to that state
  key
- **THEN** the automation's `state` trigger fires with the new boolean value

### Requirement: Listener cleanup on stop

The state source SHALL detach every `StateManager` listener it registered when
stopped, so shutdown leaves no dangling listeners. This SHALL hold whether the
source is stopped as part of the HomeKit bridge lifecycle or independently of it.

#### Scenario: Stop removes all listeners

- **WHEN** the state source's `stop()` runs
- **THEN** no `StateManager` change listeners registered by the source remain
  active

#### Scenario: Stop is independent of the bridge

- **WHEN** the state source is stopped on an engine with the HomeKit bridge
  disabled
- **THEN** its listeners are still released
