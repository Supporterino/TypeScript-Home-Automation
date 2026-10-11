# Device Sources

## MODIFIED Requirements

### Requirement: Shelly Device Source

A Shelly source MUST enumerate registered Shelly devices, describe each
according to its device type, and dispatch commands through the Shelly service
regardless of that device's transport.

A Shelly device that exposes multiple switch/cover components MUST be
enumerated as one logical device per component, each with its own descriptor,
identity, state, and capability description. Component enumeration MUST be
performed at startup and whenever a device is registered after the source has
started, and MUST page through the device's component inventory to its reported
total — a single inventory response MUST NOT be treated as a complete
inventory. Discovery for every device registered before the source starts MUST
complete before the source reports itself started; a device MUST NOT be
enumerated until its discovery resolves. A device registered after the source
has started is discovered asynchronously and enumerated once it resolves. The
physical registration is retained for device-level queries and MUST NOT itself
be enumerated as a logical device when it expands into more than one component
channel; a command naming that retained base registration MUST be rejected as
not found.

For a device registered with MQTT transport, the source MUST obtain state from
the device's push notifications and its presence topic, and MUST exclude that
device from any polling loop. State notifications MUST be dispatched by the
notification's actual component key (`switch:N` / `cover:N`) so that non-zero
channels update the correct logical device. For a device registered with HTTP
transport, the source MUST refresh the state of each component channel on a
configurable interval.

Devices registered after the source has started MUST be picked up without a
restart.

Unlike Zigbee, Shelly devices publish no capability schema for the source to
derive a description from, so the source MUST supply one from the device's
declared type combined with each component's discovered kind. That description
MUST satisfy the rich descriptor requirement in full, since it is what the
generic control renderer consumes; a Shelly device MUST NOT render less capably
than a Zigbee one merely because its capabilities are authored rather than
discovered.

#### Scenario: A Shelly device carries a full capability description

- **WHEN** a registered Shelly device is enumerated
- **THEN** its descriptor declares its actuatable and readable properties with
  their types and constraints, without the consumer knowing it is a Shelly

#### Scenario: MQTT-transport device is push-backed

- **WHEN** an MQTT-transport Shelly reports a state change
- **THEN** subscribers are notified event-driven, the observation is marked
  push-backed, and the device is not polled

#### Scenario: HTTP-transport device is polled

- **WHEN** an HTTP-transport Shelly is enumerated
- **THEN** its state is refreshed on the configured interval and observations are
  marked polled

#### Scenario: Presence loss marks the device unreachable

- **WHEN** an MQTT-transport Shelly is reported absent on its presence topic
- **THEN** the source marks it unreachable and notifies subscribers

#### Scenario: Late registration is picked up

- **WHEN** an automation registers a Shelly device after the source has started
- **THEN** the device appears in the source's enumeration and is wired for state
  updates

#### Scenario: Multi-component device is enumerated per component

- **WHEN** a Shelly Pro 4PM with `switch:0`..`switch:3` is registered
- **THEN** the source enumerates four logical devices, each with its own
  descriptor, identity, and capability description

#### Scenario: Component discovery pages through the inventory

- **WHEN** a device's component inventory spans more than one
  `Shelly.GetComponents` page
- **THEN** the source pages through the inventory to its reported total and
  enumerates every switch/cover component, rather than stopping at the first
  page

#### Scenario: Device is absent until discovery resolves

- **WHEN** a registered device's component discovery has not yet completed
- **THEN** that device is not present in the source's enumeration

#### Scenario: Base registration is not a logical device

- **WHEN** a registered multi-component device is discovered with more than one
  component channel
- **THEN** only the per-channel logical devices are enumerated, not the base
  physical registration

#### Scenario: Non-zero channel notification updates its own logical device

- **WHEN** an MQTT-transport multi-component Shelly publishes a `NotifyStatus`
  for `switch:2`
- **THEN** the logical device for channel 2 is updated and subscribers of that
  channel are notified, while other channels are unaffected

#### Scenario: Each HTTP channel is polled independently

- **WHEN** an HTTP-transport multi-component Shelly is polled
- **THEN** each component channel's status is fetched and normalized into its
  own logical device's state

#### Scenario: Command targets the correct channel

- **WHEN** a command is dispatched to the logical device for channel 1 of a
  multi-component device
- **THEN** the command reaches that device's channel 1 and no other channel

#### Scenario: Command to the base registration is rejected

- **WHEN** a command names the base registration of a device that has expanded
  into more than one component channel
- **THEN** the command is rejected as not found, because only the per-channel
  logical devices are addressable
