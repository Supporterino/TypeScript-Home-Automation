## MODIFIED Requirements

### Requirement: Store Records Follow Device Lifecycle

A device no longer known to any source MUST have its stored record removed, so a
removed device's state does not reappear after a restart. A source that has not
completed an authoritative enumeration may be transiently empty, so records for
an available source MUST NOT be pruned until that source has enumerated; a
record whose source is unavailable MUST be retained.

#### Scenario: A disappeared device is pruned

- **WHEN** a device is no longer enumerated by a source that has completed its
  enumeration
- **THEN** its stored record is removed and it is not restored on the next start

#### Scenario: Startup does not prune before the source enumerates

- **WHEN** the engine reconciles the store before a push-driven source has
  received its authoritative device list
- **THEN** the records for that source are retained

#### Scenario: A record for an unavailable source is retained

- **WHEN** a source is not available
- **THEN** its records are retained
