# Web UI

## MODIFIED Requirements

### Requirement: Data Sources

The dashboard is a pure client of the engine's API. It MUST obtain its initial
snapshot from the JSON API endpoints (`/api/*`) and thereafter maintain it from
the event stream, refetching only on reconnection or explicit user request.

When the event stream delivers a device snapshot on connect, the dashboard MUST
reconcile it into its device map keyed by qualified identifier rather than
replacing the map wholesale, so a value that arrived from the read endpoints or
a stream event before or after the snapshot is not lost. When a device event
arrives for an identifier the dashboard does not currently hold, it MUST recover
by refetching that device rather than discarding the event; an incremental delta
for an unknown device carries no full descriptor and would otherwise be dropped
silently.

The dashboard MUST NOT poll all endpoints on a fixed interval while the event
stream is healthy.

#### Scenario: Snapshot then stream

- **WHEN** the dashboard loads
- **THEN** it reads its initial data from the API endpoints and then holds the
  event stream open for updates

#### Scenario: Degraded transport is visible

- **WHEN** the event stream is unavailable and the dashboard falls back to
  periodic refresh
- **THEN** the interface reports the degraded connection state to the user

#### Scenario: The stream's device snapshot is reconciled by identifier

- **WHEN** the stream sends a device snapshot while the dashboard already holds
  device state
- **THEN** each device is merged by its qualified identifier rather than
  replacing the whole map

#### Scenario: A delta for an unknown device recovers it

- **WHEN** a device event arrives for an identifier the dashboard does not hold
- **THEN** the dashboard refetches that device instead of discarding the event
