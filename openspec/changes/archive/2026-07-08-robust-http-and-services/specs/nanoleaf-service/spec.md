## MODIFIED Requirements

### Requirement: Device Registration

`register(name, config)` MUST:
- Accept `NanoleafDeviceConfig`: `{ host: string; token: string; port?: number }`
- Normalize host: strip scheme, trailing slashes, default port 16021
- Construct base URL: `http://{host}:{port}/api/v1/{token}`
- Log device registration
- Because the token is part of the URL path, the system MUST rely on the shared HTTP client's log sanitization to mask token-like path segments so the token is not written to logs in plaintext (see `http-client` capability). The service MUST NOT log the full base URL (including token) at info level.

#### Scenario: Token is not leaked in logs

- **WHEN** a Nanoleaf request is made and the HTTP client logs the request
- **THEN** the token embedded in the URL path is masked in the log output

## ADDED Requirements

### Requirement: Response Validation

Before dereferencing fields of a parsed Nanoleaf response, the system MUST validate that the response body is a non-null object with the expected shape for the operation (e.g. a state query returns a `state` object with `on.value`, `brightness`, etc.). If the body is missing or malformed, the system MUST throw a descriptive `Error` (including the device name) rather than dereferencing `undefined` (which would throw an opaque `TypeError`).

#### Scenario: Malformed state response is rejected

- **WHEN** a Nanoleaf device returns a response lacking the expected `state`/`on` structure
- **THEN** the system throws a descriptive error naming the device rather than throwing an opaque `TypeError`

#### Scenario: toggle handles missing state safely

- **WHEN** `toggle()` reads a state response whose `on.value` is absent
- **THEN** the system throws a descriptive error instead of a `cannot read property 'value' of undefined` crash
