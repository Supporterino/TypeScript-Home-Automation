# Security Bar — TypeScript Home Automation

This document is the canonical security bar for this workspace. It is cited by the `ts-developer` and `ts-reviewer` agents and by `.opencode/bars/typescript.md`. Package-specific mechanics (the HTTP server's auth middleware, the web UI's session handling, the CLI's target/token store, MQTT credentials) stay in `docs/` and the root `AGENTS.md`; this document states the invariants every change must preserve.

## The bar

### Authentication and authorization

- **One shared secret, `HTTP_TOKEN`.** It gates `/api/*` (via `Authorization: Bearer <token>`) and the web UI (via the `ts-ha-session` session cookie — `HttpOnly`, `SameSite=Strict`). `@ts-ha/web-ui` never reads `HTTP_TOKEN` itself; the runner supplies the core config's resolved token. Do not introduce a second secret or a second auth path.
- **Empty `HTTP_TOKEN` means fully public.** When it is unset, every `/api/*` route — **including `GET /api/automations/:name/source`** — is reachable with no authentication. Any change that touches auth, the source endpoint, or the web UI's login/logout must preserve this documented behavior and keep the warning in `docs/configuration.md` accurate.
- **Some surfaces are intentionally unauthenticated — do not "fix" them.** `/healthz`, `/readyz`, `/metrics`, and the compiled static assets / PWA manifest are public by design (Kubernetes probes, Prometheus scrapers, and pre-session shell loading). Treat a change that silently adds auth to one of these as a defect.
- **Authorize at the boundary.** Route handlers decide access; do not scatter auth checks into services or automations. Automations that need their own webhook auth validate inside `execute()` (the documented `/webhook/*` pattern) — that is the sanctioned place for per-automation checks.

### Secrets

- **Never log secrets.** Sensitive URL query parameters (`appid`, `apikey`, `api_key`, `token`, `key`, `secret`) are masked with `***` in log output — preserve that masking. Do not add raw `console.log` of credentials, tokens, or payloads that may carry them.
- **Never commit secrets.** `.env` and `.env.*` are git-ignored (`!.env.example` is the only exception). New config reads from env with a safe default or a hard failure — never a checked-in fallback.
- **Store CLI tokens with least exposure.** The CLI persists target config and tokens; keep them out of logs and error messages.

### Input validation

- **Validate every boundary.** Config is parsed with zod `safeParse` and the process exits non-zero on failure. HTTP request bodies/params, MQTT payloads, and CLI input are parsed before use. Shared validation schemas live in `@ts-ha/shared` and must not be re-declared in a consumer (see Invariants).
- **Validate before use, not after.** Parse external data on entry and work with the typed result; do not pass raw `unknown` deeper into the app.
- **Reject reserved keys at the write boundary.** The state store's reserved internal namespace (`$internal:*`, e.g. rooms, wall profiles, automation enabled flags) is rejected on write through the state API. Do not add a route or field that lets a client write one directly.

### Injection and data safety

- **No shell injection.** Pass arguments as arrays when spawning; never build a shell string from user input.
- **No unsafe HTML.** Do not inject user- or device-supplied content as raw HTML. The web UI renders device state as text and sanitises anything it must present.
- **Constrain file access.** File paths from users or config (automation directories, persistence files) are resolved against a known base and checked; do not read arbitrary paths on request.
- **Fail closed.** On an auth or validation error, deny and return a typed error response — do not fall through to a permissive default. Automation errors are logged and swallowed per the root `AGENTS.md` § Error Handling; auth errors are not.

## Invariants (enforced by the gate)

These are security-relevant because a violation lets one package reach around another's boundary. `bun run check` fails on either.

- **Dependency direction** (`scripts/guard-deps.ts`): the only runtime edges are `shared` → (none), `core` → `shared`, `web-ui` → `shared`, and `cli` → {`core`, `shared`}. `core` must not import `@ts-ha/web-ui` (static or dynamic); `web-ui` must not import `@ts-ha/core` (not even `import type`). Only `@ts-ha/cli` may depend on `@ts-ha/core`, and its `web-ui` edge may only be an optional peer.
- **Shared-contract single source** (`scripts/guard-contracts.ts` + `scripts/contract-inventory.json`): every listed contract has exactly one declaration site under `packages/shared/src`, pinned in the inventory, and consumers must not re-declare it. A re-export shim is fine; a second declaration is not.
- **No workspace dependency in `devDependencies`/`optionalDependencies`,** and workspace peers must be marked optional.

## Verification

A change that touches auth, permissions, request parsing, logging, secret handling, the reserved state namespace, or the package dependency graph is not done until the scenarios above are checked and the workspace gate passes:

```bash
bun run typecheck && bun run check && bun run test
```
