# Contributing

Contributions are welcome — bug reports, new device types, additional services, and documentation improvements.

---

## Development setup

**Requirements:** [Bun](https://bun.sh/) 1.x, an MQTT broker (Mosquitto).

```bash
git clone https://github.com/Supporterino/TypeScript-Home-Automation.git
cd TypeScript-Home-Automation

bun install
cp .env.example .env
# Edit .env with your MQTT broker details

bun run dev    # Start with hot-reload
```

---

## Commands

```bash
bun run dev             # Hot-reload development mode
bun run typecheck       # TypeScript type checking (every package + docs/examples)
bun run check           # Biome + guard-contracts + guard-deps
bun run build           # Build every package to dist/
bun run --filter @ts-ha/web-ui build:web-ui    # Rebuild the web UI React frontend
bun run test            # Run every package's tests
bun test --conditions=development --filter "name"  # Run tests matching a pattern (in a package)
```

Always run `bun run typecheck && bun run check && bun test` before opening a PR.

---

## Project conventions

Coding conventions, naming rules, test patterns, and import ordering are documented in [`AGENTS.md`](https://github.com/Supporterino/TypeScript-Home-Automation/blob/main/AGENTS.md) at the repo root. This file is the authoritative source for all code style decisions.

Key points:

- **Runtime:** Bun — use `Bun.serve()`, `bun:test`, `Bun.file()` etc.
- **Imports:** use `.js` extensions in relative imports; use `node:` prefix for Node built-ins
- **Formatting:** 2-space indent, 100-char line width, LF line endings (Biome enforces this)
- **Tests:** each package's `tests/` directory, `*.test.ts` files, silent pino logger at module level

---

## Commit messages

This project uses Conventional Commits with Gitmoji:

```
feat: ✨ Add OpenWeatherMap weather service
fix(shelly): 🐛 Handle missing position field in cover status
docs: 📝 Add Nanoleaf pairing instructions
refactor: ♻️ Extract HTTP client retry logic
test: ✅ Add state trigger filter tests
```

| Prefix | Gitmoji | When |
|---|---|---|
| `feat:` | ✨ | New user-visible feature |
| `fix:` | 🐛 | Bug fix |
| `docs:` | 📝 | Documentation only |
| `refactor:` / `chore:` | ♻️ | Refactoring, deps, CI |
| `test:` | ✅ | Adding or updating tests |

---

## Releases and versioning

The four `@ts-ha/*` packages are versioned and published independently with
[Changesets](https://changesets.dev). The pipeline lives in
`.github/workflows/release.yml` and runs on every push to `main`.

### Adding a changeset

Every user-visible change should ship with a changeset:

```bash
bunx changeset
```

Select the affected package(s) and the bump type (patch / minor / major). This writes a
`.changeset/*.md` file — commit it alongside the change. `updateInternalDependencies` is
`patch`, so packages that depend on a bumped package are bumped too.

### The release flow

1. When a changeset lands on `main`, the Release workflow runs `changeset version` on its own
   branch: it consumes the `.changeset/*.md` files, bumps each `package.json`, updates the
   CHANGELOGs, and opens or updates the `chore: release` pull request.
2. Merging that PR triggers the workflow again. No changesets remain, so it runs
   `bun run publish` (`scripts/resolve-workspace-protocol.ts` plus `changeset publish`),
   which rewrites `workspace:*` ranges to concrete `^<version>` ranges, publishes the new
   versions, then creates git tags and GitHub releases.

Versions are never edited by hand — they move only when a changeset lands on `main`, are
applied inside the release PR, and are pushed to npm when that PR merges.

### npm authentication (trusted publishing)

Publishing uses npm Trusted Publishing (OIDC), so there is no long-lived `NPM_TOKEN`. The
workflow grants `id-token: write`, and npm exchanges GitHub's OIDC token for a short-lived
publish credential.

Two conditions must hold, or npm reports a misleading `E404` on the `PUT`:

- Each package has a Trusted Publisher configured on npmjs.com (GitHub Actions →
  `Supporterino/TypeScript-Home-Automation` → workflow `release.yml`).
- The workflow does **not** set `registry-url` on `actions/setup-node`. `registry-url` writes
  `//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}` into `.npmrc`; with no token present
  that is an empty credential, which makes npm skip the OIDC exchange entirely. For the same
  reason, do not reintroduce `NPM_TOKEN` / `NODE_AUTH_TOKEN` environment variables.

---

## Adding a new device type

1. Identify the device's Zigbee2MQTT payload schema from [the z2m device page](https://www.zigbee2mqtt.io/supported-devices/)
2. Add types to the appropriate file under `packages/shared/src/types/` (brand-specific types) or extend a generic type
3. Export the new types through `packages/shared/src/index.ts` (core re-exports them)
4. Add an entry to `docs/device-types.md`

---

## Adding a new service

1. Create `packages/core/src/services/<name>-service.ts` implementing the service class
2. Inject it via `createEngine()` options following the existing pattern (see `ShellyService` or `NanoleafService`)
3. Expose it on `this.<name>` inside automations via `_inject()`
4. Add a service documentation page under `docs/services/`
5. Export relevant types through `packages/core/src/index.ts`

---

## Reporting issues

Please open an issue on [GitHub](https://github.com/Supporterino/TypeScript-Home-Automation/issues) with:

- Bun version (`bun --version`)
- Node/OS information
- Minimal reproduction case
- Expected vs actual behaviour
