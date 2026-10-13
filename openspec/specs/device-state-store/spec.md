# Device State Store Specification

## Purpose

TBD - created by archiving change device-state-authority-and-stream-snapshot. Update Purpose after archive.

## Requirements

### Requirement: Durable Last-Known Device State

The system MUST maintain a device state store holding, for every device known to
the engine and keyed by its qualified identifier, the last state and
observation recorded for it. The store MUST be loaded before any device source
starts and written to disk on a debounced schedule, so a device's last-known
state is available after a restart without waiting for a new observation.

#### Scenario: A restart exposes last-known state

- **WHEN** the engine restarts with a persisted store
- **THEN** a device's descriptor reports its last-known state before any new
  observation arrives

#### Scenario: A live observation overwrites the seed

- **WHEN** a source records a new observation for a device
- **THEN** the store's value for that device is replaced and the descriptor
  reflects the new observation

#### Scenario: Persisted state is a seed, never an authority

- **WHEN** persisted state exists and a source reports different state
- **THEN** the reported state wins over the persisted value

### Requirement: Observation Provenance Is Retained

A stored record MUST carry the observation that produced it — its mode and time —
so a restored value is presented as last-known rather than current, and a stale
value is not presented as live.

#### Scenario: Restored state is not presented as live

- **WHEN** a persisted value is restored and no new observation has arrived
- **THEN** its descriptor's observation reflects when it was recorded, and a
  poll-backed value past its refresh interval reads as stale

### Requirement: Store Records Follow Device Lifecycle

A device no longer known to any source MUST have its stored record removed, so a
removed device's state does not reappear after a restart.

#### Scenario: A disappeared device is pruned

- **WHEN** a device is no longer enumerated by any source
- **THEN** its stored record is removed and it is not restored on the next start
