## Why

The HTTP client, service response handling, log buffer, and config boundary each have robustness gaps. The HTTP client parses the response body *inside* the retry try-block, so a malformed-JSON `200` (with `content-type: application/json`) is treated as a transient failure and retried, then surfaces a confusing parse error instead of the real status. Retries also apply to non-idempotent methods (`POST`/`PUT`/`PATCH`/`DELETE`) with no jitter, risking duplicate side effects and thundering-herd retries. Services (`shelly`, `nanoleaf`, weather) cast `response.data` to a typed shape with zero validation, so an error body returned with HTTP 200 yields `undefined`/`NaN`/`TypeError` downstream. The log buffer assumes exactly one JSON object per `write()`, so a chunk containing multiple newline-delimited entries fails to parse and silently drops all of them. The config boundary calls `booleanString.parse()` on env values, which throws uncaught (bypassing the friendly `safeParse`+exit path) on inputs like `TRUE`/`on`/`yes`-caps. And a Nanoleaf token embedded in the URL path is not masked by the logger's URL sanitizer, leaking it into debug logs.

## What Changes

- HTTP client: separate response-body parsing from the network/retry boundary — a parse error on a delivered response is NOT retried; the resolved `HttpResponse` is returned (or a clear parse error surfaced) rather than being misclassified as transient.
- HTTP client: only retry idempotent methods by default (`GET`/`HEAD`/`PUT`/`DELETE`); do not blindly retry `POST`/`PATCH`. Add jitter to the backoff to avoid synchronized retry storms.
- HTTP client: mask token-like URL *path* segments in `sanitizeUrl`, not just query params — so a Nanoleaf token in the path is redacted in logs.
- Services: validate the shape of `response.data` before use — treat an unexpected/error body (e.g. `{ error: ... }` on a 200) as a failure with a descriptive error, rather than casting blindly to the typed shape.
- Log buffer: split incoming `write()` chunks on newlines and parse each JSON object independently, so multi-object chunks are all captured instead of dropped.
- Config: coerce boolean env vars tolerantly (case-insensitive, trimmed) and route any coercion failure through the existing `safeParse`+`process.exit(1)` path instead of throwing an uncaught `ZodError`.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `http-client`: retry classification (no retry on delivered-response parse errors), idempotent-only retries with jitter, and path-segment token masking.
- `shelly-service`: response-shape validation before use.
- `nanoleaf-service`: response-shape validation and token redaction in logs.
- `weather-services`: response-shape validation before dereferencing/arithmetic.
- `logging`: log buffer must handle multi-object / newline-delimited write chunks.
- `configuration`: tolerant boolean coercion routed through the graceful validation-failure path.

## Impact

- Code: `src/core/http/http-client.ts`, `src/core/services/shelly-service.ts`, `src/core/services/nanoleaf-service.ts`, `src/core/services/open-meteo-service.ts`, `src/core/services/openweathermap-service.ts`, `src/core/logging/log-buffer.ts`, `src/config.ts`.
- Behavior: fewer wasted retries, no duplicate non-idempotent writes on retry, no token leakage in logs, no silently dropped log entries, clearer errors on malformed device/API responses, and friendly config errors instead of stack traces.
- Tests: http-client parse-vs-network classification + method retry policy + path masking; log-buffer multi-object chunk; config invalid-boolean graceful failure; service response-validation.
- No breaking public API change (default retry method set is a behavior refinement; callers can still pass `retries`).
