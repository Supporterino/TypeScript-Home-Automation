## Why

The repository ships one npm package (`ts-home-automation`) that bundles three
genuinely separate concerns — the automation engine, a browser web UI, and a
terminal CLI — plus an in-repo standalone runner. This forces every consumer to
carry the union of all dependencies (Mantine, React, Prism, OpenTUI) regardless
of which part they use, couples the engine's HTTP server to the web UI via a
dynamic import, and duplicates wire types (`LogEntry`, `StreamEvent`) across
three locations. Splitting into independently published packages gives each
concern its own dependency footprint, boundary, and release cadence.

## What Changes

- **BREAKING** — Split `ts-home-automation` into four Bun workspace packages
  under `packages/`, independently published under the `@ts-ha/*` scope with
  Changesets-managed independent versions:
  - `@ts-ha/shared` — the domain/wire contracts (Capability, DeviceDescriptor,
    TriggerContext, ExecutionRecord, Room*, LogEntry, StreamEvent and event
    shapes), the cross-package runtime constants they imply (`SESSION_COOKIE`),
    the pure capability boolean helpers, and the type subpaths formerly exported
    from the root (`./types`, `./types/shelly`, `./types/nanoleaf`,
    `./types/weather`, `./types/notification`). No runtime beyond types, contract
    constants, and those pure helpers; the Zigbee2MQTT `exposes` mapper stays in
    `@ts-ha/core`.
  - `@ts-ha/core` — the engine, services, device sources, HTTP server, MQTT,
    state, scheduling. Re-exports the moved contracts so its API surface is
    stable; depends on `@ts-ha/shared` only.
  - `@ts-ha/web-ui` — Hono routes + React/Mantine app + compiled asset
    manifest. Owns `WEB_UI_ENABLED` / `WEB_UI_PATH` parsing. Depends on
    `@ts-ha/shared` only; implements the service-plugin contract structurally,
    so it imports no core type. The auth token is supplied by the runner.
  - `@ts-ha/cli` — `DebugClient`, OpenTUI dashboard, target config, and the new
    `run` command. Depends on `@ts-ha/core` and `@ts-ha/shared`; loads
    `@ts-ha/web-ui` dynamically as an **optional peer dependency**. `run` reads
    the core config's `httpServer.token` (`HTTP_TOKEN`) and passes it to the
    plugin.
- **BREAKING** — Drop standalone usage: delete `src/standalone.ts` and
  `src/automations/`. Running an engine becomes `ts-ha run [--automations <dir>]`
  (default `./automations`).
- **BREAKING** — Invert web UI mounting. Delete
  `HttpServer.mountWebUi()` (`src/core/http/http-server.ts`) and the
  `engine.ts` gate. `@ts-ha/web-ui` becomes a `ServicePlugin` that registers its
  routes on the shared Hono app via the existing
  `ServicePlugin.registerRoutes(app)` hook. `@ts-ha/core` no longer references
  the web UI at all.
- Remove the `httpServer.webUi` block from the core Zod schema
  (`src/config.ts`); `@ts-ha/web-ui` parses `WEB_UI_ENABLED` / `WEB_UI_PATH`
  itself and receives them through its plugin options.
- **BREAKING** — Hard rename with no legacy alias: the `ts-home-automation`
  package name and `ts-ha` binary path are replaced by the `@ts-ha/*` packages.

## Capabilities

### New Capabilities
- `packaging`: workspace/package topology, the dependency boundaries between
  `@ts-ha/shared`, `@ts-ha/core`, `@ts-ha/web-ui`, and `@ts-ha/cli`, the
  contracts-vs-implementation split, optional-peer loading of the web UI, and
  independent Changesets versioning.

### Modified Capabilities
- `configuration`: the `httpServer.webUi` section is removed from core's schema;
  `WEB_UI_*` environment parsing moves to `@ts-ha/web-ui`.
- `web-ui`: enabling, path, and mounting become a `ServicePlugin` registration
  owned by the web UI package rather than a core `mountWebUi()` call.
- `cli`: adds the `run` command (boots a local engine); the package is now the
  engine's only first-party runner and hard-renames to `@ts-ha/cli`.
- `engine`: `mountWebUi()` and its web-ui gate are removed; custom HTTP routes
  mount exclusively through `ServicePlugin.registerRoutes`.

## Impact

- **Packages:** split of `src/` into `packages/shared`, `packages/core`,
  `packages/web-ui`, `packages/cli`, each with its own `package.json`,
  `tsconfig.json`, and test scope. Root becomes a Bun workspace with shared
  `biome.json` and Changesets config.
- **Consumers:** import paths change from `ts-home-automation` to `@ts-ha/core`;
  the `ts-ha` binary moves to `@ts-ha/cli`; the type subpaths
  (`ts-home-automation/types[/...]`) move to `@ts-ha/shared/types[/...]`. No
  compatibility shim is provided.
- **Build:** `build:web-ui` moves into `packages/web-ui`; core no longer runs the
  asset build. The Docker image installs `@ts-ha/cli` and runs `ts-ha run`.
- **Release:** the four packages publish publicly under the `@ts-ha` scope
  (`publishConfig.access` public, initial `0.1.0`) via a Changesets GitHub
  Actions workflow using npm trusted publishing. `@ts-ha/cli` owns the unchanged
  `ts-ha` binary.
- **Tests:** `tests/web-ui-*`, `capability-ranking`, `command-coalescing`,
  `log-filter`, `reserved-keys-client`, and `router` tests move to the relevant
  package; `status-page.test.ts` is split (core config-absence assertions stay
  with core, route assertions are rewritten in `@ts-ha/web-ui` against the
  plugin); core tests stay with core.
- **Deletions:** `src/standalone.ts`, `src/automations/` (the examples move to
  `docs/` only — no bundled automations directory ships), `scripts/dev.ts`
  (relocated as workspace dev wiring), and the `mountWebUi()` path.
