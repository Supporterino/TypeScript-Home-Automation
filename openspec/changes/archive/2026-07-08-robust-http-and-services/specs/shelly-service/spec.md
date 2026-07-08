## MODIFIED Requirements

### Requirement: RPC Communication

The system MUST construct RPC URLs as `http://{host}/rpc/{Method}?{params}`.

All RPC calls use HTTP GET with URL-encoded query parameters.

The system MUST throw an `Error` with a descriptive message on non-OK responses, including the device name, host, RPC method, and HTTP status.

Before using the parsed response body, the system MUST validate that it has the expected shape for the RPC method (e.g. a status response has the expected fields). If the body is missing, is not an object, or is a Shelly RPC error object (e.g. `{ error: ... }`) returned with an HTTP `200`, the system MUST throw a descriptive `Error` (including device name, host, and method) rather than casting the body blindly to the typed shape and returning `undefined`/`NaN` to callers.

#### Scenario: Error body on HTTP 200 is rejected

- **WHEN** a Shelly device returns an RPC error object with HTTP status `200`
- **THEN** the system throws a descriptive error rather than returning an invalid/`undefined` result to the caller

#### Scenario: Unexpected-shape body is rejected

- **WHEN** the parsed RPC response is not an object or lacks the expected fields
- **THEN** the system throws a descriptive error identifying the device, host, and method
