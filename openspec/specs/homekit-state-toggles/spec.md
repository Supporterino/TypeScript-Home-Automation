# HomeKit State Toggles

## Purpose

Exposes boolean state keys from the shared `StateManager` as toggle switches in Apple Home, giving automations a human-controllable interface that syncs bidirectionally with HomeKit.

## Requirements

### Configure state toggles

The system SHALL accept a static `stateToggles` list in `HomekitServiceOptions`, where each entry is `{ stateKey: string; name: string }`. `name` is REQUIRED and used as the accessory's display name in the Home app. When the list is empty or omitted, no state accessories are created.

#### Scenario: Toggles declared in options

- **WHEN** `stateToggles` contains `{ stateKey: "night_mode", name: "Night Mode" }`
- **THEN** a HomeKit switch accessory named "Night Mode" is bridged for the `night_mode` state key

#### Scenario: Empty list creates nothing

- **WHEN** `stateToggles` is omitted or empty
- **THEN** the state source creates no accessories and does not affect the bridge

### Accessory identity is stable

Each state toggle SHALL be a HomeKit `Switch` accessory whose UUID is seeded from its state key, so renaming the display name in config does not orphan the accessory in the Home app. Accessory IDs passed to the bridge sink SHALL be namespaced by the source (e.g. `state:<stateKey>`).

#### Scenario: Renaming a toggle preserves identity

- **WHEN** a toggle's `name` is changed but its `stateKey` stays the same
- **THEN** the accessory keeps its existing HomeKit UUID and is not re-added as a new accessory

### State changes appear in HomeKit

The state source SHALL subscribe to `StateManager.onChange` for each configured key and push the new value into the accessory's `On` characteristic. Truthy values SHALL map to ON and falsy values to OFF.

#### Scenario: Automation flips a state key

- **WHEN** an automation calls `state.set("night_mode", true)`
- **THEN** the corresponding HomeKit toggle's `On` characteristic becomes ON

#### Scenario: Deleting a key turns the toggle off

- **WHEN** a configured state key is deleted via `state.delete(key)`
- **THEN** the toggle's `On` characteristic becomes OFF

### Initial toggle value

When the bridge starts, each toggle SHALL read its current state value and seed the `On` characteristic from it. A missing or absent key SHALL default to OFF.

#### Scenario: Existing state seeds the toggle

- **WHEN** a toggle starts and its state key already holds a truthy value
- **THEN** the toggle's `On` characteristic is ON at start

#### Scenario: Missing key defaults to off

- **WHEN** a toggle starts and its state key does not exist
- **THEN** the toggle's `On` characteristic is OFF at start

### HomeKit write-back to state

Flipping a toggle in the Home app SHALL write a real boolean to the `StateManager` via `state.set(stateKey, value)`, which fires state change listeners so `state`-trigger automations react.

#### Scenario: Toggle flipped in the Home app

- **WHEN** the user turns a toggle ON in the Home app
- **THEN** the underlying state key is set to the boolean `true` via the `StateManager`

#### Scenario: State trigger automation reacts to a flip

- **WHEN** a toggle is flipped and an automation listens for changes to that state key
- **THEN** the automation's `state` trigger fires with the new boolean value

### Listener cleanup on stop

The state source SHALL detach every `StateManager` listener it registered when stopped, so shutdown leaves no dangling listeners.

#### Scenario: Stop removes all listeners

- **WHEN** the state source's `stop()` runs
- **THEN** no `StateManager` change listeners registered by the source remain active
