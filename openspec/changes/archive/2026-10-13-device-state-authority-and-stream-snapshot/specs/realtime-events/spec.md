# Realtime Events

## MODIFIED Requirements

### Requirement: Incremental Delivery

Events MUST carry only what changed, not a full snapshot of the affected
collection. A client MUST be able to establish an initial snapshot through the
ordinary read endpoints and thereafter maintain it from the stream alone.

When a client connects to the stream, the server MUST send a per-connection
initial snapshot of the device set — one event per device carrying its full
descriptor — before any subsequent device event, so a client that failed to
obtain a complete device snapshot from the read endpoints still converges on the
engine's device state. This initial snapshot is scoped to devices; the other
collections (state keys, rooms, logs, automations) continue to be established
from the read endpoints, and the snapshot MUST NOT be interpreted as a full
snapshot of those. Subsequent device events MUST remain incremental.

#### Scenario: A single key change does not resend all state

- **WHEN** one state key changes while a client is connected
- **THEN** the event describes only that key, not the whole state map

#### Scenario: A single device change does not resend the device list

- **WHEN** one device reports a state change
- **THEN** the event describes only that device, not the full device inventory

#### Scenario: A connecting client receives the current device set

- **WHEN** a client opens the stream
- **THEN** it receives one device event per known device, each carrying the
  device's full descriptor, before any subsequent device event
