## MODIFIED Requirements

### Requirement: Retry Behavior

The system MUST implement exponential backoff retries with the following classification:

1. Retries apply only to **transient failures**: network errors and `5xx` responses. A response that is *delivered* by the server (any status) whose body then fails to parse MUST NOT be treated as a transient failure and MUST NOT be retried — the request already reached the server.
2. By default, only **idempotent** HTTP methods (`GET`, `HEAD`, `PUT`, `DELETE`) are retried. Non-idempotent methods (`POST`, `PATCH`) MUST NOT be retried by default, to avoid duplicate side effects on the server.
3. On each retry, wait `retryDelay * 2^attempt` plus a random jitter component, so concurrent clients do not retry in lockstep (thundering herd).
4. Retry up to `retries` times.
5. If all retries fail, return the last response (or throw on network error).
6. Do NOT retry on timeout or abort.

#### Scenario: Delivered response with unparseable body is not retried

- **WHEN** the server returns a `200` with `Content-Type: application/json` but a malformed JSON body
- **THEN** the client does NOT retry the request and surfaces a clear error (or the response status), rather than misclassifying it as a transient network failure

#### Scenario: Non-idempotent method is not retried by default

- **WHEN** a `POST` request encounters a `5xx` or network error and `retries > 0`
- **THEN** the request is not automatically re-sent by default (no duplicate side effect)

#### Scenario: Backoff includes jitter

- **WHEN** a retry is scheduled
- **THEN** the delay is `retryDelay * 2^attempt` plus a randomized jitter component

### Requirement: JSON Handling

The system MUST:
- Auto-serialize body to JSON with `Content-Type: application/json`
- Auto-parse JSON response bodies
- Parse the response body OUTSIDE the network-failure/retry classification, so a body-parse error is attributable to the response content and not retried as a transient network failure
- Handle non-JSON responses gracefully (return as `data` field)
- Handle empty responses (`204 No Content`) — return `data` as `null` or `undefined`

#### Scenario: Empty response yields null/undefined data

- **WHEN** the server returns `204 No Content`
- **THEN** the client returns a response with `data` as `null` or `undefined` without a parse error

### Requirement: Logging

Every request MUST log:
- `debug`: Request sent with `{ method, url, status, durationMs }`
- `error`: Request failed with `{ err, url, method }`
- Sensitive query parameters (listed in `sensitiveQueryParams`) MUST be masked in logs: `"***"`
- Token-like credential segments embedded in the URL **path** (e.g. a Nanoleaf API token in `/api/v1/{token}/...`) MUST also be masked in logs, so credentials placed in the path are not written to log output in plaintext

#### Scenario: Token in URL path is masked in logs

- **WHEN** a request URL contains a credential token as a path segment (e.g. `http://host:16021/api/v1/SECRETTOKEN/state`)
- **THEN** the logged URL masks the token segment rather than printing it in plaintext
