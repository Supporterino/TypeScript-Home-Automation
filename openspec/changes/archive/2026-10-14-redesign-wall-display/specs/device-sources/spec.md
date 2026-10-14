## ADDED Requirements

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
