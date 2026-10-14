# Spec Delta

## MODIFIED Requirements

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
