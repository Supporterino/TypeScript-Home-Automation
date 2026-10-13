# Configuration

## ADDED Requirements

### Requirement: Device State Persistence

Persistence of last-known device state MUST be enabled by default, matching the
state store and device registry defaults, so a deployment that has never set the
variable begins persisting after upgrading. It MUST be controlled by
`DEVICE_STATE_PERSIST` and written to the path in `DEVICE_STATE_FILE` (default
`./device-state.json`).

#### Scenario: Persistence is enabled when unset

- **WHEN** `DEVICE_STATE_PERSIST` is not set
- **THEN** the device state store persists and restores state across restarts

#### Scenario: Persistence can be disabled explicitly

- **WHEN** `DEVICE_STATE_PERSIST` is set to a false value
- **THEN** no device state file is written and the store starts empty

### Requirement: Device State Write Debounce

The debounce window between coalesced device-state writes MUST be configurable
via `DEVICE_STATE_FLUSH_MS`, defaulting to `1000` and treating `0` as saving on
every write.

#### Scenario: Writes are debounced

- **WHEN** many observations arrive within the debounce window
- **THEN** at most one write is performed after the window elapses

#### Scenario: An invalid flush interval fails validation

- **WHEN** `DEVICE_STATE_FLUSH_MS` is set to a non-numeric value
- **THEN** configuration validation fails with a formatted error naming the
  setting
