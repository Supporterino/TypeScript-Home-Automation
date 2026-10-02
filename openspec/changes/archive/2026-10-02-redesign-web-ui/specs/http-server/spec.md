## ADDED Requirements

### Requirement: Room Batch Command Endpoint

The server MUST expose an endpoint that issues one property command to every
member of a room that supports it, so a room-level action is a single request.

The endpoint MUST address the room by its identifier and MUST accept a command
body in the same shape as the single-device command endpoint. For each member,
the command MUST be applied only where the member's declared capabilities permit
the requested property; members that do not support it MUST be reported as
skipped rather than causing the request to fail.

The response MUST report, per device, the outcome (applied, skipped, or failed)
so the caller can reconcile each member independently. The endpoint MUST NOT
promise atomicity across members, because the underlying transports do not
provide it.

When rooms are not configured, the endpoint MUST respond `503`. A request for an
unknown room MUST respond `404`. A malformed command body MUST respond `400`.

#### Scenario: One request commands the whole room

- **WHEN** a client sends a single command to a room with several capable members
- **THEN** the server applies it to each capable member and returns a per-device
  outcome

#### Scenario: Incapable members are skipped, not failed

- **WHEN** a room contains members that do not declare the commanded property
- **THEN** those members are reported as skipped and the request succeeds

#### Scenario: Unknown room is not found

- **WHEN** the endpoint is called for a room identifier that does not exist
- **THEN** the server responds `404`

#### Scenario: Rooms unavailable

- **WHEN** the endpoint is called on an engine with no room manager
- **THEN** the server responds `503`

### Requirement: Weather Endpoint

The server MUST expose an endpoint returning the registered weather service's
current conditions and, when the service provides it, a forecast.

When no weather service is registered, the endpoint MUST report the feature as
unavailable with a `404` rather than responding `500` or returning an empty
successful payload.

#### Scenario: Weather is returned when configured

- **WHEN** a weather service is registered and the endpoint is called
- **THEN** the current conditions are returned, and a forecast if the service
  provides one

#### Scenario: Weather is unavailable when unconfigured

- **WHEN** no weather service is registered and the endpoint is called
- **THEN** the server responds `404` indicating the feature is unavailable

### Requirement: Energy Endpoint

The server MUST expose an endpoint returning the aggregated energy view defined
by the `energy-monitoring` capability: current instantaneous power, cumulative
consumption, per-device breakdown with availability, and the rolling history
when enabled.

The endpoint MUST authenticate under the same policy as every other `/api/*`
route, and MUST respond successfully with zero totals on a deployment where no
device meters energy.

#### Scenario: Energy view is returned

- **WHEN** the endpoint is called on a deployment with metering devices
- **THEN** the response contains the current power, cumulative total, per-device
  breakdown, and history when enabled

#### Scenario: No metering devices

- **WHEN** no device declares any power or energy reading
- **THEN** the endpoint responds successfully with zero totals and an empty
  breakdown

#### Scenario: Energy requires the same authentication as other API routes

- **WHEN** a token is configured and a request arrives without valid credentials
- **THEN** the server rejects it as unauthorized
