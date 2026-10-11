## ADDED Requirements

### Requirement: Wall Profile Changes Are Broadcast

A change to a wall profile MUST be delivered to connected clients as its own
typed event, identifying the profile and the change, so a wall displaying that
profile can react without re-reading.

Wall profiles are stored in the state store's reserved internal namespace, which
is deliberately not streamed as raw state. A profile change MUST therefore be
delivered through this typed category only, and MUST NOT also be emitted as a
raw state key change.

#### Scenario: A profile save is broadcast

- **WHEN** a wall profile is created, updated, or deleted through the API
- **THEN** connected clients receive an event naming the profile and the change

#### Scenario: A profile change is not also a state change

- **WHEN** a wall profile is saved
- **THEN** a wall-profile event is emitted and no state key change event is
  emitted for the reserved key that stores it
