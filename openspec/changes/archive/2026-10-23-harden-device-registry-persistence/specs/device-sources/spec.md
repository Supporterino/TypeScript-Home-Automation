## MODIFIED Requirements

### Requirement: Last-Known State From The Durable Store

A device source MUST record every observation it makes into the device state
store and MUST seed each descriptor's state from the store's last-known value
when it has no fresher observation of its own, so that enumeration, retrieval by
identifier, and subscription delivery all report the same last-known state from
the first read after a restart. A missing upstream state — for example a
registry snapshot that carries no state for a device — is not an observation and
MUST NOT be recorded over a restored record. A seeded descriptor MUST carry the
store's observation, not a new one.

A derived group descriptor MUST seed each member's state from the same store
value and MUST carry an observation no newer than the oldest observation among
the member values it aggregates.

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

#### Scenario: Zigbee seeds from the store when the registry has no state

- **WHEN** the Zigbee source enumerates a device after a restart and the
  registry holds no state for that device while the store holds a record
- **THEN** the descriptor's state is the stored state
- **AND** the descriptor's observation is the stored observation

#### Scenario: The first enumeration does not erase the restored observation

- **WHEN** the Zigbee source records the descriptor built from that seed
- **THEN** the store still holds the original observation rather than the
  restart time
- **AND** the stored state is unchanged

#### Scenario: A Zigbee group seeds its members from the store

- **WHEN** a group is enumerated after a restart and a member has no registry
  state while the store holds a record for that member
- **THEN** the group's derived state includes the stored member state
- **AND** the group's observation is no newer than the oldest member observation
  it aggregates

#### Scenario: A live registry state supersedes the stored seed

- **WHEN** the registry subsequently publishes state for the device
- **THEN** the descriptor reports that state with a current observation
- **AND** the store is updated to match

#### Scenario: Startup reconciliation does not prune before a source enumerates

- **WHEN** the engine wires device events and an available push-driven source has
  not yet received its authoritative device list while the store holds records
  for that source
- **THEN** those records are retained rather than pruned
- **AND** the source's first enumeration seeds from them

#### Scenario: Removed devices are pruned once the source has enumerated

- **WHEN** an available source receives its authoritative device list and a
  stored device is absent from it
- **THEN** that device's record is removed
