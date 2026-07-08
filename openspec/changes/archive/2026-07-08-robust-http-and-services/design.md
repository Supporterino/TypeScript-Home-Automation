## Context

Findings addressed here (from the audit): M3 (parse error retried as transient), M4 (non-idempotent retries + no jitter), M5 (unvalidated `response.data` casts across shelly/nanoleaf/weather), M6 (log-buffer drops multi-object chunks), M7 (config boolean throws uncaught), S3 (Nanoleaf token in URL path leaks into logs).

Key code sites:
- `http-client.ts:92-119` — `fetch`, then body parse (`response.json()`/`.text()`), then the 5xx-retry check, all inside one try. A parse throw (line 98) is caught by the network-error catch (line 120) and retried. Backoff (line 67) has no jitter. Retry applies to every method.
- `http-client.ts:24-44` — `sanitizeUrl` masks only `searchParams`; path segments (Nanoleaf token) are untouched.
- Services return `response.data as T` with no shape check; Shelly/OWM can send error bodies with HTTP 200.
- `log-buffer.ts:49-59` — `JSON.parse(line)` on the whole chunk; multi-object chunk throws → all dropped.
- `config.ts` — `booleanString.parse(process.env.X)` throws a `ZodError` outside the `safeParse` block.

## Goals / Non-Goals

**Goals:**
- Correctly classify retry-eligible failures; never retry a delivered-but-unparseable response.
- Avoid duplicate side effects from retrying non-idempotent requests; avoid synchronized retry storms.
- No credential (Nanoleaf token) written to logs, regardless of whether it's in the query or path.
- Services fail loudly and descriptively on malformed/error responses instead of propagating `undefined`/`NaN`.
- Log buffer never drops entries due to chunk batching.
- Config errors are always friendly and route through the single exit path.

**Non-Goals:**
- Response-size caps / streaming limits (separate hardening concern, not in scope).
- Full zod schema validation of every external API body — lightweight shape guards suffice.
- Changing the `HttpResponse` shape or the service public method signatures.
- Idempotency keys / dedup tokens for POST (out of scope; we simply stop auto-retrying them).

## Decisions

### Decision: Split "network attempt" from "body parse"

Restructure `request()` so the retry loop wraps only the `fetch` + status classification. Read the body after a successful `fetch` in a way that a parse error is a terminal error for that response (not a retry trigger). Concretely: keep `fetch` in the retried try; on a delivered response, do the 5xx-retry decision first (before parsing), then parse the body in a separate try that, on failure, throws a descriptive parse error (with status/url) and breaks out of the retry loop.

**Alternatives:** wrap parse in its own try and `return` a response with `data: undefined` on parse failure (rejected — hides the problem; a descriptive throw is clearer for callers that currently trust `data`).

### Decision: Idempotent-only retry set + jitter

Define `IDEMPOTENT_METHODS = {GET, HEAD, PUT, DELETE}`. Only enter the retry path when `retries > 0 && IDEMPOTENT_METHODS.has(method)`. For non-idempotent methods, execute once. Add jitter: `delay = base * 2^attempt` then `delay += random(0, delay * 0.5)` (capped at the existing 10s ceiling).

**Alternatives:** an opt-in `retryNonIdempotent` flag (could add later; default-safe behavior is the priority now).

### Decision: Mask token-like path segments in `sanitizeUrl`

Extend `sanitizeUrl` to also inspect `parsed.pathname` segments and mask any segment that looks like a credential. Heuristic: mask the segment immediately following a known credential-bearing path marker (`/api/v1/<token>` for Nanoleaf) and/or long opaque segments. Prefer a targeted rule (mask the segment after `api/v1`) plus a general "long hex/base64-ish token" heuristic to be safe. Keep it conservative to avoid masking legitimate path parts.

**Alternatives:** have Nanoleaf move the token to a header (rejected — Nanoleaf's OpenAPI puts it in the path; can't change the device API). Masking at the logging boundary is the correct fix.

### Decision: Per-service shape guards

Add small guards in each service before returning/using `response.data`:
- Shelly: check `response.data` is an object and not `{ error }`; throw the descriptive `Shelly RPC ... failed` error otherwise.
- Nanoleaf: check the expected object/`state` structure before dereferencing.
- Weather: check `data.current` / `data.daily[i]` exist before arithmetic.

Lightweight `typeof`/property checks, not full zod (keeps hot paths cheap; consistent with existing `Array.isArray` guards in the registry).

### Decision: Chunk-splitting in log buffer

In `write()`, `chunk.split("\n")`, filter empty, `JSON.parse` each in its own try, store each. This matches pino's newline-delimited output and tolerates batched writes.

### Decision: Coercion inside the schema

Replace the standalone `booleanString.parse(...)` calls with a zod transform/preprocess that normalizes `String(v).trim().toLowerCase()` against the truthy/falsy sets and returns a boolean (or fails via zod so `safeParse` reports it). This moves failures into the single `safeParse` → format → `process.exit(1)` path.

## Risks / Trade-offs

- **Changing default retry policy (no POST retry) could surprise a caller relying on it** → the audit shows current POST retries are a latent bug (duplicate writes); default retries is `0` anyway for most services, so real-world impact is minimal. Documented in the proposal.
- **Path-token masking heuristic could over- or under-mask** → keep it targeted (mask segment after `api/v1`) plus a conservative length/charset heuristic; unit-test with the Nanoleaf URL shape and with benign paths to avoid false positives.
- **Stricter service validation turns previously-silent bad responses into thrown errors** → this is the intent; callers already must handle service errors (services throw on non-OK today). Improves debuggability.
- **Log-buffer split adds minor per-write cost** → negligible; splitting a short string is cheap and only runs on the logging path already doing a parse.

## Migration Plan

- Backward compatible; no config or public API changes. Boolean env values that were valid remain valid; more are now accepted.
- Rollback is a straight code revert. No persisted-state implications.
