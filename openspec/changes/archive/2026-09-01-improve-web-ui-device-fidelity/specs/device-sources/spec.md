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
