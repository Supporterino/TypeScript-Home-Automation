## ADDED Requirements

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
