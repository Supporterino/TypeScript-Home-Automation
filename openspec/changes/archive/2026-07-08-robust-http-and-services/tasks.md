## 1. HTTP client retry classification

- [x] 1.1 Restructure `request()` so the retry loop wraps the `fetch` + status classification only; make the 5xx-retry decision before parsing the body
- [x] 1.2 Parse the response body in a separate step; on parse failure throw a descriptive error (with status + sanitized url) and do NOT retry
- [x] 1.3 Handle `204`/empty responses returning `data` as `null`/`undefined` without a parse error

## 2. HTTP client retry policy + jitter

- [x] 2.1 Add an `IDEMPOTENT_METHODS` set (`GET`, `HEAD`, `PUT`, `DELETE`) and only enter the retry path for those methods
- [x] 2.2 Add randomized jitter to the exponential backoff delay (capped at the existing ceiling)

## 3. HTTP client path-token masking

- [x] 3.1 Extend `sanitizeUrl` to mask token-like URL path segments (e.g. the segment following `api/v1`) in addition to sensitive query params
- [x] 3.2 Verify the Nanoleaf base URL logs with the token masked and benign paths are left intact

## 4. Service response validation

- [x] 4.1 Shelly: validate `response.data` is an object and not an RPC error body before returning; throw the descriptive RPC error otherwise
- [x] 4.2 Nanoleaf: validate the expected object/`state` structure before dereferencing (fix `toggle()` `on.value` crash); stop logging the full token-bearing base URL
- [x] 4.3 Open-Meteo: guard `data.current` and per-day arrays before arithmetic/index access
- [x] 4.4 OpenWeatherMap: guard `data.current` / `data.daily` before dereferencing

## 5. Log buffer chunk handling

- [x] 5.1 Split incoming write chunks on newlines, parse each non-empty line independently, and store every parsed entry (one bad line does not drop the rest)

## 6. Config tolerant boolean coercion

- [x] 6.1 Replace standalone `booleanString.parse()` calls with an in-schema transform/preprocess that trims + lowercases and accepts `true/false/1/0/yes/no/on/off`
- [x] 6.2 Ensure invalid boolean values fail through the existing `safeParse` → formatted error → `process.exit(1)` path (no uncaught `ZodError`)

## 7. Tests

- [x] 7.1 Test: a `200` with malformed JSON is not retried and surfaces a clear error
- [x] 7.2 Test: a `POST` is not auto-retried on 5xx by default; a `GET` is
- [x] 7.3 Test: backoff delay includes jitter
- [x] 7.4 Test: `sanitizeUrl` masks a Nanoleaf-style token path segment and leaves benign paths intact
- [x] 7.5 Test: Shelly/Nanoleaf/weather throw descriptive errors on error/malformed bodies
- [x] 7.6 Test: log buffer stores all entries from a multi-object chunk and skips only the bad line
- [x] 7.7 Test: config accepts `TRUE`/`On` and fails gracefully on `maybe`

## 8. Verification

- [x] 8.1 Run `bun run typecheck && bun run check && bun test`
