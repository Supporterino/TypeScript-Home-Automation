# Device Sources Specification

## Purpose

A source-agnostic abstraction over every controllable thing the engine knows
about — Zigbee, Shelly, and Nanoleaf devices, and configured state toggles —
providing enumeration, command dispatch, and state subscription through one
interface, so that the HomeKit bridge and the web UI consume the same device
model instead of each reimplementing discovery, freshness, and write-back per
family.

## Requirements

### Requirement: Device Source Interface

The system MUST expose a `DeviceSource` abstraction that each device family
implements. A source MUST be able to enumerate its devices, accept commands for
them, notify subscribers of state and reachability changes, and be started and
stopped as part of the engine lifecycle.

A source MUST report a stable source identifier, and every device it yields MUST
carry an identifier that is unique within that source. The combination of source
identifier and device identifier MUST be globally unique, so two families that
happen to use the same device name never collide.

The qualified identifier MUST be formed by joining the source identifier and the
device identifier with a single delimiter, and MUST be parsed by splitting on the
first occurrence of that delimiter only. Everything after the first delimiter
belongs to the device identifier, which MAY itself contain the delimiter: a state
toggle's device identifier is a state key, and state keys are already
colon-scoped as `<automation-name>:<key>`. A source identifier MUST NOT contain
the delimiter, which is what makes the first-occurrence split unambiguous.

#### Scenario: A device identifier containing the delimiter is preserved

- **WHEN** a qualified identifier is formed for a state toggle whose state key is
  `motion-light:lights_on` and then parsed back
- **THEN** the source identifier and the full state key are both recovered
  intact, rather than the key being truncated at its own colon

Sources MUST be started after their backing services are available and MUST
release every listener, subscription, and timer on stop.

#### Scenario: Devices from two sources share a name

- **WHEN** a Zigbee device and a Shelly device are both named `office_lamp`
- **THEN** they are addressable as distinct devices because their identifiers are
  qualified by source

#### Scenario: Stopping a source releases its resources

- **WHEN** a source is stopped
- **THEN** every subscription, listener, and timer it created is removed, and it
  emits no further state notifications

### Requirement: Stable Device Identity

Every device descriptor MUST carry a stable identity, distinct from its display
name, that does not change when the device is renamed in the upstream system.

For Zigbee this is the device's hardware address; for Shelly and Nanoleaf it is
the name the device was registered under; for a state toggle it is the state
key. The stable identity MUST be unique
within its source, and MUST be usable as a durable key by consumers that record
per-device data.

A device's display name MAY change at any time. Consumers MUST NOT be required
to treat the display name as an identifier.

#### Scenario: Rename preserves stable identity

- **WHEN** a Zigbee device is renamed in Zigbee2MQTT
- **THEN** its descriptor reports a new display name and the same stable identity

#### Scenario: Stable identity is present for every source

- **WHEN** devices are enumerated from Zigbee, Shelly, and Nanoleaf sources
- **THEN** every descriptor carries a stable identity distinct from its display
  name

### Requirement: Rich Device Descriptor

Each device yielded by a source MUST carry a descriptor sufficient for a client
to render controls without knowing the source family. The descriptor MUST
include at minimum:

- source identifier and device identifier
- a stable identity, as described above
- a human-readable display name
- the device's last-known state
- a capability description declaring what can be read and what can be actuated,
  including for each actuatable property its type, permitted values or numeric
  range, and unit where applicable
- reachability, and the freshness of the last state observation

A capability describing a boolean property MUST additionally declare the two
values that represent on and off for that property, as that source reports and
accepts them. Declaring a property's type without its encoding is insufficient:
sources disagree on how a boolean appears on the wire — some report a true
boolean, others a pair of strings — and a consumer that assumes one encoding
silently misreads every device using the other, presenting an off device as on
and issuing commands the transport ignores. The declared values MUST be
sufficient for a consumer to both interpret a reported value and compose a
command, with no source-specific knowledge.

The descriptor MUST NOT be narrowed to any particular consumer's model. In
particular it MUST NOT be reduced to the subset of properties that map onto
HomeKit characteristics; consumers that need a narrower model derive it
themselves.

#### Scenario: A dimmable colour light is fully described

- **WHEN** a client reads the descriptor for a Zigbee colour light
- **THEN** the descriptor declares its on/off, brightness, colour temperature and
  colour capabilities, including the numeric range of brightness and colour
  temperature

#### Scenario: An unknown device is still described

- **WHEN** a device reports a capability the engine has no specific handling for
- **THEN** the descriptor still declares that property with its type and
  constraints, rather than omitting it

#### Scenario: A string-encoded boolean is distinguishable from a true boolean

- **WHEN** a client reads the descriptors for two on/off devices from different
  sources, one reporting its state as a string and one as a true boolean
- **THEN** each descriptor declares its own on and off values, and the client can
  determine each device's on/off state correctly without knowing which source it
  came from

#### Scenario: A consumer composes a command in the device's own encoding

- **WHEN** a client turns off a device whose boolean capability declares string
  on and off values
- **THEN** the client can compose the command using the declared off value rather
  than guessing an encoding

### Requirement: Command Dispatch

A source MUST accept commands addressed to one of its devices and translate them
to the underlying transport. A command MUST be validated against the target
device's declared capabilities before dispatch; a command naming an unknown
property, or carrying a value outside the declared range or permitted set, MUST
be rejected with a descriptive error and MUST NOT reach the device.

A command against a boolean property MUST be validated against that capability's
declared on and off values. Validation MUST NOT hardcode any particular source's
encoding convention, so that a source declaring a different encoding is validated
correctly rather than by coincidence.

Commands MUST NOT be forwarded verbatim as arbitrary payloads to the underlying
transport.

#### Scenario: Valid command reaches the device

- **WHEN** a client issues a brightness command within the device's declared
  range
- **THEN** the source translates it to the device's transport and dispatches it

#### Scenario: Out-of-range command is rejected

- **WHEN** a client issues a brightness command above the device's declared
  maximum
- **THEN** the command is rejected with a descriptive error and nothing is sent
  to the device

#### Scenario: Unknown property is rejected

- **WHEN** a client issues a command naming a property the device does not
  declare
- **THEN** the command is rejected with a descriptive error and nothing is sent
  to the device

#### Scenario: Command to an unknown device is rejected

- **WHEN** a client issues a command for a device identifier no source recognises
- **THEN** the request fails with a not-found error

#### Scenario: Boolean command in the declared encoding is accepted

- **WHEN** a client issues a command carrying one of the two values a boolean
  capability declares
- **THEN** the command is accepted and dispatched

#### Scenario: Boolean command in a foreign encoding is rejected

- **WHEN** a client issues a boolean command carrying a value the target
  capability does not declare as either its on or its off value
- **THEN** the command is rejected with a descriptive error and nothing is sent
  to the device

### Requirement: State Subscription and Freshness

A source MUST allow subscribers to receive device state changes and reachability
changes as they occur, and MUST support unsubscription.

Where the underlying transport pushes state, the source MUST propagate it
event-driven without waiting for any interval, and MUST mark such observations
as push-backed. Where the transport does not push state, the source MUST refresh
it on an interval and MUST mark such observations as polled, recording when the
observation was made.

Consumers MUST be able to distinguish a push-backed device from a polled one.

A polled device's descriptor MUST additionally report the interval at which its
source refreshes it. A consumer that must decide how long to wait for a command
to be confirmed cannot do so from the push-versus-polled distinction alone,
because polling intervals differ per source and are operator-configurable.
Without the interval on the descriptor, such a consumer would have to know which
configuration setting governs which device family, which is exactly the
per-family knowledge the shared abstraction exists to remove. Reporting the
interval keeps the consumer generic: it reads a duration and does not know which
source produced it.

#### Scenario: A polled descriptor reports its refresh interval

- **WHEN** a client reads a device that is refreshed on an interval
- **THEN** the descriptor reports that interval alongside the observation's age

#### Scenario: Refresh interval reflects configuration

- **WHEN** a source's refresh interval is configured to a non-default value
- **THEN** the descriptors of devices from that source report the configured
  interval

#### Scenario: Pushed state propagates immediately

- **WHEN** a device whose transport pushes state reports a change
- **THEN** subscribers are notified without waiting for a polling interval, and
  the observation is marked push-backed

#### Scenario: Polled state carries its age

- **WHEN** a client reads a device whose transport does not push state
- **THEN** the descriptor reports the observation as polled and indicates when it
  was last refreshed

#### Scenario: Unreachable device is reported

- **WHEN** a device is determined to be unreachable
- **THEN** subscribers are notified and the descriptor reports it as unreachable
  rather than reporting stale state as current

### Requirement: Zigbee Device Source

A Zigbee source MUST enumerate the tracked devices from the device registry,
derive each device's capability description from the device's published
capability schema, dispatch commands over the device's command topic, and
propagate state changes from the registry as push-backed observations. Devices
joining or leaving MUST be reflected without a restart.

Where the published capability schema declares the values a binary property uses
for on and off, the derived capability description MUST preserve them. Discarding
them leaves the derived description claiming a boolean type without saying how
that boolean is encoded, which is precisely the information a consumer needs and
cannot recover.

#### Scenario: A device joining appears without restart

- **WHEN** a new Zigbee device is paired while the engine is running
- **THEN** it appears in the source's enumeration and its state changes are
  delivered to subscribers

#### Scenario: Registry disabled yields no Zigbee devices

- **WHEN** the device registry is disabled
- **THEN** the Zigbee source enumerates no devices and reports itself as
  unavailable rather than failing

#### Scenario: Published on/off encoding survives mapping

- **WHEN** a paired device publishes a binary capability declaring its on and off
  values
- **THEN** the derived capability description declares those same two values

### Requirement: Shelly Device Source

A Shelly source MUST enumerate registered Shelly devices, describe each
according to its device type, and dispatch commands through the Shelly service
regardless of that device's transport.

For a device registered with MQTT transport, the source MUST obtain state from
the device's push notifications and its presence topic, and MUST exclude that
device from any polling loop. For a device registered with HTTP transport, the
source MUST refresh state on a configurable interval.

Devices registered after the source has started MUST be picked up without a
restart.

Unlike Zigbee, Shelly devices publish no capability schema for the source to
derive a description from, so the source MUST supply one from the device's type.
That description MUST satisfy the rich descriptor requirement in full, since it
is what the generic control renderer consumes; a Shelly device MUST NOT render
less capably than a Zigbee one merely because its capabilities are authored
rather than discovered.

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

### Requirement: Nanoleaf Device Source

A Nanoleaf source MUST enumerate registered Nanoleaf devices, describe their
power, brightness, and colour capabilities, dispatch commands through the
Nanoleaf service, and refresh state on a configurable interval, marking
observations as polled.

A device that cannot be reached MUST be reported as unreachable without
disrupting other devices or halting the refresh cycle.

#### Scenario: Nanoleaf devices are enumerable

- **WHEN** one or more Nanoleaf devices are registered
- **THEN** the source enumerates them with their power, brightness and colour
  capabilities

#### Scenario: Unreachable Nanoleaf does not break the cycle

- **WHEN** one registered Nanoleaf device is unreachable during a refresh
- **THEN** it is marked unreachable, the failure is logged, and other devices are
  still refreshed

### Requirement: State Device Source

A state source MUST present each configured state toggle as a device, so that a
state key designated by the operator is controllable through the same interface
as physical hardware.

Each toggle MUST be described with a single writable boolean capability. Its
stable identity MUST be the state key, which does not change when its display
name changes. Its state MUST be seeded from the current stored value, treating an
absent value as off, and MUST be propagated to subscribers event-driven whenever
the key changes, including when it is deleted. Observations MUST be marked
push-backed, and a toggle MUST always be reported as reachable, because its
backing store is in-process.

A command MUST write the corresponding boolean to the state store, and the
resulting change MUST be observable to every other consumer of that key,
including automations that trigger on it.

Toggles MUST be declared explicitly in configuration. The source MUST NOT derive
toggles from the contents of the state store, so that keys the engine writes for
its own purposes — including room assignments and automation enabled flags — are
never presented as user-facing controls.

A state key MUST be presentable as a device whether or not the HomeKit bridge is
enabled.

#### Scenario: A configured toggle is enumerated as a device

- **WHEN** a state toggle is configured for a given key
- **THEN** the source yields a device whose stable identity is that key and whose
  capability description declares one writable boolean

#### Scenario: An external write is pushed to subscribers

- **WHEN** an automation writes the state key backing a toggle
- **THEN** subscribers are notified event-driven and the observation is marked
  push-backed

#### Scenario: A deleted key reads as off

- **WHEN** the state key backing a toggle is deleted
- **THEN** the device reports its state as off rather than unreachable or unknown

#### Scenario: A command writes through to the state store

- **WHEN** a client commands a toggle on
- **THEN** the state key is set and any automation triggering on that key runs as
  it would for any other write

#### Scenario: Engine-internal keys are never presented as toggles

- **WHEN** room assignments and automation enabled flags are stored
- **THEN** they do not appear as devices, because only explicitly configured keys
  are presented

#### Scenario: Toggles are available without HomeKit

- **WHEN** the HomeKit bridge is disabled and state toggles are configured
- **THEN** the source still enumerates them and they remain controllable

### Requirement: Aggregate Device Access

The system MUST provide aggregate access across all registered sources:
enumerate every device from every source, resolve a single device by its
qualified identifier, dispatch a command to the owning source, and subscribe to
state changes across all sources at once.

A source that is unavailable — because its backing service is not configured or
is disabled — MUST be omitted from the aggregate without causing enumeration to
fail.

#### Scenario: Aggregate enumeration spans sources

- **WHEN** Zigbee, Shelly, and Nanoleaf sources are all registered
- **THEN** aggregate enumeration returns devices from all three, each carrying
  its source identifier

#### Scenario: Unavailable source is omitted, not fatal

- **WHEN** the Nanoleaf service is not configured
- **THEN** aggregate enumeration returns the remaining sources' devices and does
  not fail
