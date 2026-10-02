## ADDED Requirements

### Requirement: HTTP Exposure

When a weather service is registered, the engine MUST expose its current
conditions and forecast through the HTTP API so that a client without access to
the registry can present them.

Because the service's interface takes a location per call, the exposed endpoint
MUST determine the location from configuration: a configured default location
MUST be used when the client supplies none, and a client MAY supply a location
to override it. When neither a configured default nor a supplied location is
available, the endpoint MUST reject the request as a client error rather than
guessing.

The number of forecast days MUST be bounded to a small maximum, and a request
for more MUST be clamped or rejected rather than forwarded unbounded.

#### Scenario: Configured default location is used

- **WHEN** a default location is configured and the endpoint is called without
  one
- **THEN** current conditions and a forecast for the configured location are
  returned

#### Scenario: No location available is a client error

- **WHEN** no default location is configured and the client supplies none
- **THEN** the endpoint rejects the request as a client error rather than
  calling the service with an undefined location

#### Scenario: Forecast horizon is bounded

- **WHEN** a client requests more forecast days than the maximum
- **THEN** the request is bounded to the maximum rather than forwarded
  unbounded
