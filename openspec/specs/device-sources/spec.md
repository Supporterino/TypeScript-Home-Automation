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
- whether the device is hidden

A capability describing a boolean property MUST additionally declare the two
values that represent on and off for that property, as that source reports and
accepts them. Declaring a property's type without its encoding is insufficient:
sources disagree on how a boolean appears on the wire — some report a true
boolean, others a pair of strings — and a consumer that assumes one encoding
silently misreads every device using the other, presenting an off device as on
and issuing commands the transport ignores. The declared values MUST be
sufficient for a consumer to both interpret a reported value and compose a
command, with no source-specific knowledge.

Hidden status is a user preference held above the sources, not something a source
knows about its own devices. A source MUST NOT be required to supply it; the
aggregate MUST stamp it onto every descriptor it yields, whether the descriptor is
returned from enumeration, from retrieval by identifier, or delivered to a
subscriber. A descriptor delivered by any of those paths without it would leave the
consumer unable to distinguish a visible device from one whose visibility is simply
unknown.

Hidden status on the descriptor is information, not enforcement. It tells a
consumer what the user chose; it does not by itself remove the device from any
listing. Which listings honour it is defined by the device visibility capability.

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

#### Scenario: Hidden status is present on every delivery path

- **WHEN** a consumer obtains a descriptor by enumeration, by retrieval by
  qualified identifier, and by subscription
- **THEN** all three carry the device's hidden status

#### Scenario: A source does not supply hidden status

- **WHEN** a source yields a descriptor for one of its devices
- **THEN** the source is not required to know the device's visibility, and the
  aggregate supplies it

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
transport. Accepting a value and publishing it unchanged are different acts: a
command may be accepted in a form the transport or the device does not accept,
and the dispatch step is where that is made right. In particular, a boolean
property MAY be commanded with a real boolean — a form every caller in the system
can produce without knowing the target's encoding, so a caller with no
source-specific knowledge stays able to actuate a device — and such an accepted
boolean MUST be translated into that capability's declared on or off value before
it reaches the transport, through the single shared rule the rest of the system
composes boolean commands with. A device MUST NOT be sent a value its declared
capability does not express for the requested state; publishing an accepted but
untranslated value produces a command that is acknowledged and then silently
ignored downstream, which presents to the user as a working control over a device
that does not respond.

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

#### Scenario: An accepted real boolean is dispatched in the declared encoding

- **WHEN** a client commands a device whose boolean capability declares string on
  and off values, sending a real boolean
- **THEN** the capability's declared on or off value reaches the transport, not
  the real boolean, and the device performs the requested change

#### Scenario: A command that is accepted is never published untranslated

- **WHEN** any command is accepted for dispatch
- **THEN** the payload that reaches the transport expresses the requested state
  in the form the target device declares, so an accepted command cannot be one
  the device ignores

#### Scenario: A command to a device that is not actuatable is rejected

- **WHEN** a client issues a command for a property the device declares read-only
- **THEN** the command is rejected with a descriptive error and nothing is sent
  to the device

### Requirement: Cover Transport Action

A source whose device is a cover that accepts discrete transport commands MUST
declare that transport in its capability description as a writable property. The
property's permitted values MUST name each transport the device accepts, and MUST
include a stop value only when the device can stop.

#### Scenario: A stop-capable cover declares stop

- **WHEN** a source yields a cover that can be commanded to stop
- **THEN** its descriptor declares a writable transport property whose permitted
  values include a stop value

#### Scenario: A cover that cannot stop omits stop

- **WHEN** a source yields a cover that cannot be commanded to stop
- **THEN** its declared transport values omit a stop value

### Requirement: Cover Transport Command

A command naming a declared transport value MUST be validated against that
capability like any other command and then translated by the source to its own
transport primitive. A value the device does not declare MUST be rejected rather
than dispatched.

#### Scenario: A stop command reaches the device's transport

- **WHEN** a client issues the declared stop value to a cover
- **THEN** the source translates it to its stop primitive and the command reaches
  the device

#### Scenario: An undeclared transport value is rejected

- **WHEN** a client issues a transport value the cover does not declare
- **THEN** the command is rejected with a descriptive error and nothing is sent

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

### Requirement: Shelly Full-Status Ingestion

A Shelly source MUST ingest a full component-status notification
(`NotifyFullStatus`) for an MQTT-transport device, not only incremental
(`NotifyStatus`) changes. Each `switch:N` / `cover:N` component key present in
the payload MUST be dispatched to its logical channel entry, so a full status
seeds `on` for a switch and `position` / `state` for a cover.

#### Scenario: A full-status notification seeds a switch's on/off

- **WHEN** an MQTT-transport Shelly switch publishes a `NotifyFullStatus` naming
  `switch:0`
- **THEN** the source records that component's output and the device's
  descriptor reports its `on` property without any physical change

#### Scenario: A full-status notification seeds a cover's position and state

- **WHEN** an MQTT-transport Shelly cover publishes a `NotifyFullStatus` naming
  `cover:0`
- **THEN** the source records the cover's position and movement state, and the
  descriptor reports them

#### Scenario: A multi-component full status updates every channel

- **WHEN** an MQTT-transport device with `switch:0` and `switch:1` publishes a
  `NotifyFullStatus` naming both
- **THEN** each channel's logical device records its own output and subscribers
  are notified for each

#### Scenario: Incremental notifications still apply

- **WHEN** an MQTT-transport device later publishes a partial `NotifyStatus`
- **THEN** the changed attributes are merged onto the last-known state,
  preserving the seeded values

### Requirement: Shelly Status Seeding at Subscription

A Shelly source MUST obtain an MQTT-transport device's current component status
through its RPC status query when the device is first subscribed — at source
start, and when a device is registered after the source has started — because
the events topic is not retained and a connect-time full status may have been
published before the source subscribed. A seed failure MUST be logged and
non-fatal, leaving the device enumerable.

#### Scenario: Current status is obtained at first subscription

- **WHEN** the source starts with an MQTT-transport device already registered,
  or that device is registered after the source has started
- **THEN** the source obtains the device's current component status through its
  RPC status query, so the descriptor carries the reported properties without
  waiting for a change

#### Scenario: A failed seed does not fail the source

- **WHEN** an MQTT-transport device's status query fails or times out at
  subscription
- **THEN** the failure is logged, the device remains enumerable, and the source
  otherwise starts normally

#### Scenario: A never-reported attribute is absent, not synthesized

- **WHEN** an MQTT-transport device has not reported a readable attribute
- **THEN** that attribute is absent from the descriptor's state rather than
  reported as off or zero

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

The aggregate MUST offer two distinct enumerations:

- **total enumeration**, returning every device from every available source,
  including hidden devices. This is the enumeration used to reconcile which
  devices exist — appearances, disappearances, and room membership — and omitting
  hidden devices from it would make hiding indistinguishable from disappearing.
- **visible enumeration**, returning the same set minus hidden devices, for
  consumers that present devices to a person and take no part in reconciliation.

Both MUST be available to callers, and a caller MUST choose between them
explicitly. The choice is deliberately made at the call site rather than by a
mode or a flag on a single enumeration, because the two sets of consumers must not
drift toward whichever default was set last.

#### Scenario: Aggregate enumeration spans sources

- **WHEN** Zigbee, Shelly, and Nanoleaf sources are all registered
- **THEN** aggregate enumeration returns devices from all three, each carrying
  its source identifier

#### Scenario: Unavailable source is omitted, not fatal

- **WHEN** the Nanoleaf service is not configured
- **THEN** aggregate enumeration returns the remaining sources' devices and does
  not fail

#### Scenario: Total enumeration includes hidden devices

- **WHEN** a device is hidden and a caller performs total enumeration
- **THEN** the device is returned, marked hidden

#### Scenario: Visible enumeration excludes hidden devices

- **WHEN** a device is hidden and a caller performs visible enumeration
- **THEN** the device is not returned

#### Scenario: Zigbee groups participate in the aggregate

- **WHEN** Zigbee groups are discovered
- **THEN** they are enumerated, resolved, and commanded through the aggregate on
  the same terms as devices from any other source

### Requirement: Cumulative Energy Telemetry

A device source that receives cumulative consumption telemetry MUST expose it
through the device's state and declared capabilities, in the same
source-neutral vocabulary as its other readings, so that a consumer can read a
device's cumulative energy without source-specific knowledge.

The property MUST be declared readable and non-writable, MUST carry the
`numeric` value type, and MUST declare a unit so that readings from different
devices can be compared and combined.

A source that receives no cumulative-energy reading MUST omit the property
rather than reporting a zero, so that "not metered" is distinguishable from
"metered, consumed nothing".

#### Scenario: A metering device exposes cumulative energy

- **WHEN** a source receives a cumulative energy reading for a device that
  supports metering
- **THEN** the device's capabilities declare a readable numeric energy property
  with a unit, and its state carries the reading

#### Scenario: A non-metering device omits the property

- **WHEN** a device reports no cumulative energy
- **THEN** its capabilities and state do not declare an energy property

#### Scenario: The property is read-only

- **WHEN** a client inspects the cumulative energy capability
- **THEN** the capability is marked readable and not writable

### Requirement: Last-Known State From The Durable Store

A device source MUST record every observation it makes into the device state
store and MUST seed each descriptor's state from the store's last-known value
when it has no fresher observation of its own, so that enumeration, retrieval by
identifier, and subscription delivery all report the same last-known state from
the first read after a restart.

#### Scenario: Enumeration reports last-known state immediately

- **WHEN** a source enumerates a device it has not yet observed since start, and
  the store holds a value for it
- **THEN** the descriptor's state is that last-known value, carrying the store's
  observation

#### Scenario: A fresh observation supersedes the seed

- **WHEN** a source observes a device after start
- **THEN** the descriptor reports the new observation and the store is updated
  to match

#### Scenario: Subscription delivery matches enumeration

- **WHEN** a device changes and subscribers are notified
- **THEN** the delivered descriptor's state matches what enumeration would return
  for the same device at the same time
