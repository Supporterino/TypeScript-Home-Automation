## MODIFIED Requirements

### Requirement: Event Categories

The stream MUST deliver typed events covering at least:

- state key changes, including the key, the new value, and the previous value
- device state changes, identified by qualified device identifier, carrying the
  changed properties and the observation's freshness
- device reachability changes
- devices appearing and disappearing
- device visibility changes, identified by qualified device identifier, carrying
  the device's new visibility
- new log entries
- automation enabled state changes
- automation execution completions, carrying the automation, its trigger,
  duration, and outcome
- room definition and membership changes
- engine readiness changes

Each event MUST identify its category so a client can route it without
inspecting its payload shape.

A visibility change MUST be its own category rather than being expressed as a
device appearing or disappearing. A hidden device has not disappeared — it is still
enumerable, still commandable, and still a member of its room — and a client that
treated the two as the same would drop state it must keep in order to offer to
unhide the device.

A visibility change MUST carry only the affected device, not the device list, and
MUST NOT be inferable only from a state key change: the flag is stored in the
reserved state namespace, which is deliberately not streamed.

The device categories — device state changes, reachability changes, and devices
appearing and disappearing — depend on qualified device identifiers and
observation freshness, which the unified device model defines. They MUST be
delivered once that model exists, and MUST NOT be delivered in terms of any
earlier, source-specific device representation. The remaining categories do not
depend on it.

#### Scenario: Device categories are expressed in the unified model

- **WHEN** a device event is emitted
- **THEN** it identifies the device by qualified identifier and reports the
  observation's freshness, in the same terms as the device read endpoints

#### Scenario: Device change is attributed to a device

- **WHEN** a device reports a state change
- **THEN** the emitted event names its category, its qualified device
  identifier, and the changed properties

#### Scenario: Automation toggle is broadcast

- **WHEN** an automation is disabled through the API
- **THEN** every connected client receives an event reporting the new enabled
  state

#### Scenario: Execution completion is broadcast

- **WHEN** an automation finishes executing
- **THEN** an event is emitted naming the automation, its trigger, its duration,
  and whether it succeeded

#### Scenario: Room membership change is broadcast

- **WHEN** a device is assigned to a different room
- **THEN** an event is emitted describing the change, without resending the full
  room list

#### Scenario: Visibility change is broadcast

- **WHEN** a device is hidden
- **THEN** an event is emitted naming its category, the device's qualified
  identifier, and its new visibility, without resending the device list

#### Scenario: Hiding is not reported as disappearing

- **WHEN** a device is hidden
- **THEN** no device-disappeared event is emitted for it

#### Scenario: The reserved key backing visibility is still not streamed

- **WHEN** a device's visibility changes
- **THEN** a visibility event is delivered and no state key change event is
  delivered for the reserved key that stores it
