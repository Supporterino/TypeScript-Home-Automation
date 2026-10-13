# Device Sources

## ADDED Requirements

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
