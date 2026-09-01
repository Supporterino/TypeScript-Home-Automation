## ADDED Requirements

### Requirement: Device Visibility Endpoints

The system MUST allow a client to hide and unhide a device, addressed by qualified
device identifier in a single percent-encoded path segment, on the same terms as
the existing per-device endpoints.

The system MUST provide:

- a request that marks a device hidden
- a request that marks a device visible

Both MUST be idempotent, succeeding whether or not the device is already in the
requested state, and both MUST report the device's resulting visibility.

Visibility MUST be settable for a device the system does not currently know, and
MUST NOT be rejected on that basis. A device can legitimately be hidden while its
bridge is down, and rejecting the request would make visibility depend on timing.

The device list and single-device responses MUST report each device's visibility,
so that a client can filter on it and offer to reverse it without a second request.
The device list MUST continue to return hidden devices; a client that could not see
them could not offer to unhide them.

#### Scenario: A device is hidden

- **WHEN** a client requests that a device be hidden
- **THEN** the request succeeds and reports the device as hidden

#### Scenario: Hiding twice succeeds

- **WHEN** a client hides a device that is already hidden
- **THEN** the request succeeds and reports the device as hidden

#### Scenario: An identifier containing the delimiter round-trips

- **WHEN** a client hides a state toggle whose device identifier is itself
  colon-scoped
- **THEN** the correct device is hidden, because the identifier is carried in one
  percent-encoded segment and split on its first delimiter only

#### Scenario: An unknown device can be hidden

- **WHEN** a client hides a qualified identifier the system does not currently know
- **THEN** the request succeeds, and the device is hidden if and when it appears

#### Scenario: The device list reports visibility and includes hidden devices

- **WHEN** a client reads the device list while some devices are hidden
- **THEN** every device is returned, each reporting whether it is hidden
