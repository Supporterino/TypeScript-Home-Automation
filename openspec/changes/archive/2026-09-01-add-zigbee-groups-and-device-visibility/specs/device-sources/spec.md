## MODIFIED Requirements

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
