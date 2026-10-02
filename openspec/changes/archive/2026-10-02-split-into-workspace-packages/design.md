## Context

See `proposal.md` — Why. Three facts about the current tree shape the approach:

- The CLI (`src/cli/`) imports nothing from core today; it is a pure HTTP client
  over `DebugClient`. It is already a package in all but name.
- The core HTTP server reaches into the web UI through a single dynamic import —
  `src/core/http/http-server.ts:178` (`mountWebUi`), gated at
  `src/core/engine.ts:729` on `config.httpServer.webUi.enabled`.
- `ServicePlugin.registerRoutes(app: Hono)` (`src/core/services/service-plugin.ts:73`)
  already exists and is invoked by `ServiceRegistry.mountRoutes()`. This is the
  inversion seam the web UI will use.

The contracts the web UI consumes are not leaves: `TriggerContext` references
`ZigbeeDevice`, `ExecutionRecord` references `TriggerContext`, `RoomMember`
references `DeviceDescriptor`, and `StreamEvent` is a union over thirteen event
shapes. That closure is why `@ts-ha/shared` is a contracts package rather than a
handful of DTOs.

## Goals / Non-Goals

**Goals:**
- Four independently published workspace packages with a one-way dependency
  graph: `shared` ← `core`, `shared` ← `web-ui`, and `cli` → {`core`, `shared`}.
- `@ts-ha/core` contains zero references to the web UI, static or dynamic.
- `ts-ha run` is the only first-party engine runner.
- One definition site for every shared contract.

**Non-Goals:**
- Preserving the `ts-home-automation` package name or import paths. This is a
  hard rename; no compatibility shim.
- A compatibility layer for consumers of the old barrel exports. `@ts-ha/core`
  keeps a stable surface by re-exporting moved contracts, but does not preserve
  the old package identity.
- Changing any engine behavior beyond where code lives and who mounts the UI.
- Realigning the CLI's device commands with the unified device API (pre-existing
  follow-up, unrelated).

## Decisions

### D1 — Contracts live in `@ts-ha/shared`, implementation in `@ts-ha/core`

Move the domain/wire contracts to `shared`: capability vocabulary, device
descriptor and observation, trigger context, execution record, room shapes,
`LogEntry`, and the `StreamEvent` union with its member event types. `core`
re-exports them so `@ts-ha/core`'s surface is stable.

*Alternative considered:* let web-ui `import type` from core (type-only, erased
at build). Rejected per the decision to give web-ui zero core dependency — it
would leave a type-level edge in the graph and keep the contracts split.

*Consequence:* `TriggerContext` brings `ZigbeeDevice`; `ExecutionRecord` brings
`TriggerContext`; the `StreamEvent` union brings every event shape. This is an
intentional widening from "DTO bag" to "contracts package". The migration is
mechanical (`git mv` + re-export) but touches `core`'s public barrel.

The web UI app is a consumer that currently re-declares part of this closure:
`src/core/web-ui/app/types.ts` declares its own `LogEntry` and the full
`StreamEvent` union (and its member event interfaces) while re-exporting the
other server types via relative `import type`. Those local mirrors are deleted
and replaced with imports from `@ts-ha/shared`, so `LogEntry` and `StreamEvent`
have exactly one definition site — the invariant `specs/packaging` "Shared Owns
The Contracts" requires and task 2.7's guard checks. The browser bundle already
loads `@ts-ha/shared` at runtime for the capability helpers (D6), so this adds
no new bundling requirement.

The CLI is a second consumer that re-declares wire shapes instead of importing
them: `src/cli/components/types.ts` declares `LogEntry` (with a `service?`
field), `HomekitStatus`, `AutomationInfo`, and `DeviceInfo`, and
`src/cli/client.ts` declares `SerializedDevice`. These are HTTP response
contracts, not private view-models, so they move to `@ts-ha/shared` and the CLI
imports them (task 5.7). The web UI app's remaining wire-response interfaces in
`src/core/web-ui/app/types.ts` (`StatusData`, `TriggerDef`, `Automation`,
`HomekitStatus`) are the same class and are folded in alongside the
`LogEntry`/`StreamEvent` mirrors already handled. Consequently the inventory the
derivation step (task 2.3) builds is not only "types that already cross a
boundary through an existing import": a consumer-declared type is in scope when
it names a payload the engine or a service produces. Genuinely client-private
view state (dashboard aggregation, optimistic-update bookkeeping) stays with its
package. This resolves the contradiction between the packaging spec's "one
definition site" scenario and a purely import-graph-derived inventory, which
would never have surfaced a locally-declared DTO.

### D2 — Web UI inverts mounting through `ServicePlugin`, not a new hook

`@ts-ha/web-ui` exports a plugin implementing `ServicePlugin` whose
`registerRoutes(app)` mounts the shell, assets, PWA routes, and auth. The plugin
receives `{ path, token }` at construction. `mountWebUi()` and the engine gate
are deleted; `mountServiceRoutes()` is the only route-attachment hook.

*Alternative considered:* a bespoke `Engine.registerUi()` hook. Rejected — the
service-plugin machinery already exists, is tested, and keeps the boundary
generic rather than UI-shaped.

### D3 — Web UI config parsed by the web UI package

`WEB_UI_ENABLED` and `WEB_UI_PATH` leave the core Zod schema. `@ts-ha/web-ui`
owns their parsing and validates them into its plugin options.

There is one bootstrap exception: `ts-ha run` must decide whether to
dynamic-import `@ts-ha/web-ui` *before* the package exists in the process. It
reads `process.env.WEB_UI_ENABLED` as a raw import gate only — never as option
parsing — and, when enabled, imports the package, lets it parse
`WEB_UI_ENABLED`/`WEB_UI_PATH` into options, and passes those options plus the
core config's resolved `httpServer.token` to the plugin. A disabled run touches
neither the module nor the parser. The gate is a string comparison, not a second
schema, so there is exactly one option parser (the package) and one token source
(core).

*Alternative considered:* keep parsing in core and hand the value to the CLI.
Rejected — it leaves core "knowing" the keys, contradicting D2's boundary.

*Alternative considered:* make `@ts-ha/web-ui` parse enablement and have `run`
always import it to ask. Rejected — it forces the frontend tree to load in a
headless run and contradicts the "disabled means not loaded" scenario.

### D4 — Web UI loaded as an optional peer of the CLI

`ts-ha run` dynamic-imports `@ts-ha/web-ui` only when enabled.
`@ts-ha/web-ui` is declared in `peerDependencies` with
`peerDependenciesMeta.<pkg>.optional = true`, so a headless operator does not
require its tree (Mantine, React, Prism) at runtime. A missing peer when enabled
produces a message naming the package to install.

*Alternative considered:* hard dependency of the CLI. Rejected — it forces the
full frontend dependency tree on every headless deployment, the exact burden the
split exists to remove.

*Trade-off:* optional peers are still installed by default by most package
managers unless pruned; the runtime guarantee is "not loaded", not "not
installed". Documented, not hidden.

### D5 — Shared contracts are type-only and browser-safe

`@ts-ha/shared` carries types plus, at most, contract constants, type guards, and
pure helpers that encode a rule two or more packages must agree on. No `node:`
builtins, no HTTP, no engine classes. This is what lets the web UI bundle import
it without violating the first-paint budget (`specs/web-ui` "Build Process").

The capability module exercises this boundary. `Capability` and the vocabulary
around it, plus `readBooleanCapabilityValue`/`composeBooleanCapabilityValue`
(the shared rule for interpreting a boolean capability's declared on/off
encoding), live in `shared`: the browser bundle and any core consumer must agree
on that rule. The Zigbee2MQTT-specific `mapZ2MExpose`/`mapZ2MExposes` mapper does
NOT: it is source-specific transformation logic used only by core's device
registry, so it stays in `@ts-ha/core` under the zigbee layer and is re-exported
from core's barrel for surface stability.

### D6 — Release mechanics

Bun workspaces at the root; Changesets for independent semver with
dependency-aware bumps. Root `biome.json` shared; per-package `tsconfig.json`.
The asset build moves into `packages/web-ui` and runs as its `prebuild`/
`prepublishOnly` hook; core no longer runs it.

Each package's `exports` map distinguishes development from publish resolution:
a `development` condition resolves the workspace import to its TypeScript source
(`./src/index.ts`) so that `bun test` and workspace dev run against source with
no build step, while the default condition resolves to the compiled `dist`
`types`/`import` entries so a published install consumes declarations and JS.
This keeps the inner dev loop build-free without shipping an unpublished source
layout.

Each package owns a `tsconfig.build.json` (extends its typecheck tsconfig,
`noEmit: false`, `declaration`, `sourceMap`, `outDir: dist`) and a `build`
script that emits the `dist` outputs its default `exports` condition resolves
to. JSX configuration diverges per package. `@ts-ha/cli`'s tsconfig uses
`@opentui/react`; `@ts-ha/shared` and `@ts-ha/core` set neither. `@ts-ha/web-ui`
owns two TypeScript trees with different needs — its server modules are
no-JSX/Node, while the browser app is `react-jsx`/DOM — so it keeps a nested
`src/app/tsconfig.json` (`react-jsx`, `jsxImportSource: react`, and its own
`customConditions`) that the package server tsconfig excludes, and the package's
typecheck runs both configs. `@ts-ha/web-ui` has two build products — its server
modules via `tsc` and its browser bundle via `Bun.build` — sequenced
assets-first, since the server typecheck consumes the generated asset manifest.
The root `build` script orchestrates in dependency order (`shared` →
`core`/`web-ui` → `cli`) and the root `typecheck` script runs each package's
`tsc --noEmit` plus the `docs/examples` config. `docs/examples` is a source tree
that imports `@ts-ha/core`, not a workspace package, so its own `tsconfig.json`
also sets `customConditions: ["development"]`; this keeps the root typecheck
build-free, resolving `@ts-ha/core` to source exactly as the package tsconfigs
do, rather than requiring a prior `core` build.

*Activation (verified):* Bun resolves a custom `exports` condition only when it
is passed explicitly — `bun --conditions=development`, and for the test runner
`bun test --conditions=development` (the flag may precede or follow `test`).
`NODE_ENV`, `--hot`, and a `bunfig.toml` `[run] conditions` entry do **not**
select it on the Bun versions tested (1.4.2). Every root and per-package script
that expects to resolve a workspace import to source (dev watcher, `bun test`)
MUST pass `--conditions=development` explicitly. Without the flag, bare
`import "@ts-ha/*"` and `bun test` fail with `Cannot find module` until the
package is built to `dist`. This is the mechanism that makes task 1.1's
`exports` map actually work; it is not implicit.

Three consumers resolve workspace imports and do **not** share Bun's run-time
`--conditions` flag, so each needs its own explicit mechanism:

- **Browser asset build.** `Bun.build` compiles the React app, and the app
  imports runtime capability helpers (`readBooleanCapabilityValue`,
  `composeBooleanCapabilityValue`) from `@ts-ha/shared`
  (`src/core/web-ui/app/components/CapabilityControl.tsx`). The `build:web-ui`
  script MUST pass `conditions: ["development"]` to its `Bun.build` call so the
  bundle resolves shared to source. This keeps the asset build order-free: it
  does not require `@ts-ha/shared` to have been compiled to `dist` first.
- **Typecheck.** `tsc` has no `--conditions` flag. Each package's
  `tsconfig.json` MUST set `customConditions: ["development"]`, and the
  `development` entry of every package `exports` map MUST carry both a `types`
  and an `import` path pointing at source, so `tsc --noEmit` resolves workspace
  imports to source without a prior build. Without this, typecheck falls back to
  the default `types` condition and can only resolve a package that has already
  been built to `dist`.
- **Published consumption.** No flag and no `customConditions`: resolution falls
  back to the default `types`/`import` entries under `dist`, so a published
  install consumes declarations and JS, never source.

Workspace introduction is sequenced so the tree builds throughout: step 1 creates
the four packages as empty shells whose `tsconfig.json` `include` covers only
their own (initially empty) `src`, and whose `exports` are wired but point at
`src` files that will be populated by later moves. Root `tsc --noEmit` therefore
does not follow not-yet-moved sources; each package's `tsc` begins resolving its
own tree only once its step relocates the source in.

Root `bun test` does not discover `packages/*/tests` by convention. The root
`test` script MUST orchestrate each package's own test run (running the runner
in each package directory with `--conditions=development`), rather than relying
on directory recursion; a package's tests live in that package's scope and are
run from that package.

Publishing is in scope for this change, not deferred. The four packages release
to the public npm registry under the `@ts-ha` scope, so each scoped manifest
declares `publishConfig.access = "public"`. Initial versions are `0.1.0`. A
Changesets GitHub Actions workflow (`.github/workflows/release.yml`) opens
version PRs and publishes on merge using npm trusted publishing; `@ts-ha` scope
ownership and registry authentication are prerequisites, verified before the
first release. The command name is unchanged: `@ts-ha/cli` declares the `ts-ha`
binary.

The workspace root is non-publishing: `private: true`, no `main`/`types`/`bin`/
`exports`/`files`, and no publish lifecycle scripts (`prepublishOnly`,
`prebuild`, `build:web-ui`); it carries workspace orchestration scripts only, so
an accidental root publish is impossible.

Each published package carries its own `LICENSE` and a short package-level
`README.md`. npm never resolves those from the workspace root, so a
`files: ["dist", "README.md", "LICENSE"]` list would silently omit them
otherwise. The GPL-3.0 text is duplicated into all four packages.

Independent versioning over `workspace:*` has protocol nuances that are pinned
before implementation rather than discovered at release. Task 1.3 begins with a
spike that establishes how Changesets rewrites `workspace:*` on Bun (whether
`bumpVersionsWithWorkspaceProtocolOnly` is required, and the
`updateInternalDependencies` range) and records the chosen `.changeset/config.json`.
The verification is a publish dry run in which every one of the four manifests
carries a resolved internal range, never a dangling `workspace:*`.

*Verified against `@changesets/cli` v3 and npm:* Changesets skips rewriting a
literal `workspace:*` (`apply-release-plan`), and its publish step shells out to
`npm publish` for any package manager it does not recognise (Bun is not one of
them). npm emits the workspace protocol verbatim into the tarball, so a consumer
would hit `EUNSUPPORTEDPROTOCOL`. The root `publish` script therefore runs
`scripts/resolve-workspace-protocol.ts` — which rewrites every `workspace:*`
dependency and peer range to `^<local-version>` in the four manifests — before
`changeset publish`, so the published tarballs carry concrete ranges while the
committed manifests keep the workspace protocol. npm trusted publishing
(`id-token: write`, `NPM_CONFIG_PROVENANCE`) is preserved because Changesets only
sanitises OTP variables from the environment.

The existing tag-triggered `.github/workflows/publish.yml` (root `npm publish`
plus GitHub Release creation) is deleted, not left alongside `release.yml`.
After the split there is no root package to publish, and two publishers
triggered by different events would race. GitHub Release creation moves into the
Changesets workflow.

### D7 — The web UI plugin contract is structural, not imported

`@ts-ha/web-ui` MUST NOT import `ServicePlugin` (or `CoreContext`) from
`@ts-ha/core` — the packaging spec forbids any core edge, including type-only.
`WebUiService` therefore declares its own minimal shape (`serviceKey`,
`onStart(ctx)`, and `registerRoutes(app: Hono)`) and is passed to
`createEngine({ services: { "web-ui": ... } })`. This is sound because
`ServiceRegistry.isPlugin()` is a structural guard that checks only for
`serviceKey` (`src/core/services/service-registry.ts:237`) and
`EngineOptions.services` carries an `[key: string]: unknown` index signature, so
no compiler coupling is needed.

`onStart(ctx)` is retained — reversing the earlier "omit `onStart`/`onStop`"
stance — because it is the only hook that receives `CoreContext`, and the plugin
needs `ctx.logger`. The plugin declares its own minimal `CoreContext` shape
containing just `logger`, so it still imports nothing from `@ts-ha/core`.
`onStop` remains omitted: the plugin only mounts routes and holds no resources to
release.

*Timing constraint:* the engine mounts service routes at startup step 3 but runs
`onStart` at step 7 (`specs/engine` "Startup Sequence"). The logger captured in
`onStart` therefore does not exist yet when `registerRoutes` runs. The plugin
MUST capture the logger in `onStart` and read it lazily from the mounted handlers
at request time (not at mount time), so route registration never dereferences an
unset logger. A pre-`onStart` request is not possible because the server does not
listen until after step 7.

*Alternative considered:* move a stripped `ServicePlugin` into `@ts-ha/shared`.
Rejected — it drags `Hono`, `HttpClient`, `ExecutionRecorder`, and
`DeviceRegistry` into the contracts package and gives shared a framework
dependency it otherwise avoids.

*Trade-off:* a future change to the plugin hook shape will not be caught by the
compiler in web-ui. The registry's runtime guard, the `run` integration test, and
the automated boundary guards — `scripts/guard-deps.ts` for forbidden edges and
`scripts/guard-contracts.ts` for one-definition-site contracts, both wired into
the root `check` and CI — are the safety net. `guard-deps.ts` fails when
`packages/web-ui/src` imports `@ts-ha/core` (or `packages/core/src` imports
`@ts-ha/web-ui`, even type-only); `guard-contracts.ts` fails when a consumer
re-declares an inventoried wire contract.

### D8 — The runner supplies the auth token; the UI package parses only its own vars

`@ts-ha/web-ui` parses `WEB_UI_ENABLED` and `WEB_UI_PATH` only. The auth token is
core's resolved `config.httpServer.token` (from `HTTP_TOKEN`); `ts-ha run` reads
it and constructs the plugin with `{ path, token }`. Justification: core owns
`/api/*` authentication with `config.httpServer.token`, and the UI's shell,
assets, and login flow must use the identical secret. The web UI MUST NOT parse
`HTTP_TOKEN` itself, so there is one definition of the token and it cannot drift.

### D9 — Cross-package runtime constants live in `@ts-ha/shared`

D5's "types plus at most contract constants" is exercised: `SESSION_COOKIE`
(today imported by the web UI from `core/http/utils.ts`) moves to `@ts-ha/shared`
and is re-exported by core. Any other literal or type guard that both a core
runtime path and the web UI (or CLI) must agree on and that is part of the wire
contract belongs in shared. This explicitly covers the reserved internal state
key namespace: `INTERNAL_STATE_PREFIX` (the `"$internal:"` rule) is a literal a
core runtime path and the browser bundle must agree on, so it moves to
`@ts-ha/shared`, and core's `state-manager` imports it (as do the derived
`ROOM_PREFIX`/`AUTOMATION_ENABLED_PREFIX`, which stay in core). What stays
separate is the *predicate implementation*: the server-side `isReservedStateKey`
guard remains in core and the client-side predicate remains a small local helper
in the browser bundle, but both derive from the shared literal, so there is one
definition of the reserved namespace rather than two hand-synchronised copies.

### D10 — `@ts-ha/shared` owns the type subpaths

The old root subpath exports (`ts-home-automation/types`, `/types/shelly`,
`/types/nanoleaf`, `/types/weather`, `/types/notification`) become
`@ts-ha/shared/types[/...]`; `@ts-ha/core` re-exports the cross-cutting contracts
from its root. The mapping is documented in the proposal's Impact section and
docs. No subpath is silently dropped.

The `/types` subpath is not movable as one file. Its capability module is split
per D5: the vocabulary and the pure boolean helpers ship in `shared`, while the
`mapZ2M*` mapper moves to core's zigbee layer. `@ts-ha/core` re-exports the
mapper so the old `mapZ2M*` symbols remain importable from the core barrel; the
subpath itself resolves from `shared`.

## Risks / Trade-offs

- **Contracts closure is larger than first assumed** → Mitigate by deriving the
  shared inventory from the actual cross-package import graph of `core`,
  `web-ui`, and `cli` (not a hand-kept name list), doing the move as a dedicated,
  reviewable step before any consumer rewiring; `core` re-exports keep its
  surface compiling throughout.
- **Web UI build ordering in a workspace** → `@ts-ha/web-ui`'s generated asset
  manifest is git-ignored; its build must run before core is not needed, but must
  run before web-ui type-checks. Mitigate with explicit per-package scripts and a
  root task that builds web-ui first.
- **Optional peer not present at runtime when enabled** → Mitigate with the
  named-package error (D4) and a test that asserts the message. The peer
  mechanism is unreliable for `npx`/`global` CLI delivery: those install the CLI
  without opportunistically installing optional peers, so an operator running the
  UI must install `@ts-ha/web-ui` explicitly. This is documented as the delivery
  caveat, not hidden; a headless install is always sufficient.
- **`development` condition not activated** → the build-free dev/test loop
  silently requires a `dist` build if scripts omit `--conditions=development`.
  Mitigate by passing the flag in every source-resolving script (D6) and
  asserting in task 1.1 that a workspace import resolves to `src` under the flag
  and fails without it.
- **Root test discovery after the split** → root `bun test` does not recurse into
  `packages/*/tests`. Mitigate with an explicit root orchestration script (D6)
  verified by task 6.1.
- **Shared-contract uniqueness is only implicitly enforced** → the dependency
  guard (task 7.2) checks edges, not duplicate declarations, and a purely
  import-graph-derived inventory would miss a consumer DTO declared locally
  without importing anything (the CLI's `LogEntry` before D1). Mitigate with a
  generated inventory that counts consumer-declared wire DTOs as in scope (D1)
  plus `scripts/guard-contracts.ts` asserting each inventoried type/constant has
  exactly one definition site (task 2.7).
- **Fixture sharing across the moving test suites** → `tests/fixtures/empty` is
  used by core tests and by `capability-ranking.test.ts`, which moves to
  `@ts-ha/web-ui`. Mitigate by duplicating the tiny empty-directory fixture into
  each package's own test scope (tasks 3.7 and 4.3); no shared fixtures package
  is warranted.
- **Silent example-automation absence** → the engine tolerates an unreadable or
  missing automations directory (`automation-manager.ts:222`), logging the error
  and continuing with zero automations. The operator-provided default
  `./automations` therefore fails quietly; the `ts-ha run` bootstrap MUST log an
  explicit warning when the resolved directory does not exist (task 5.3), so an
  operator can distinguish "no automations configured" from "wrong path."
- **Two build systems in one package** (`tsc` for server/routes, `Bun.build` for
  the browser app) → Keep the existing split (`tsconfig.build.json` excludes the
  app; `Bun.build` compiles the app) but relocate both into `packages/web-ui`.
- **Test relocation churn** → web-ui-specific tests (`web-ui-format`,
  `web-ui-normalize`, `capability-ranking`, `command-coalescing`, `log-filter`,
  `router`, `revert-deadline`) move to `packages/web-ui`; shared-type tests move
  to `packages/shared`; the rest stay with core. Three tests are not plain
  relocations because they currently reach into core and would create the
  forbidden edge if moved verbatim: `status-page.test.ts`'s route assertions are
  rewritten in `packages/web-ui` against `WebUiService` mounted on a bare Hono
  app (its core config assertions stay with core's config tests);
  `web-ui-assets.test.ts` is rewritten in `packages/web-ui` against
  `WebUiService` on a bare Hono app instead of core's `HttpServer`/`mountWebUi`;
  and `reserved-keys-client.test.ts` is split — `INTERNAL_STATE_PREFIX` moves to
  `@ts-ha/shared`, core asserts its own guard against it, and `packages/web-ui`
  asserts its client predicate against the same shared constant, so no single
  test needs both packages.
- **Docker path change** → the image runs a build stage over the workspace
  (including `@ts-ha/web-ui`'s asset build), then installs/serves the compiled
  `@ts-ha/cli`; the `development` exports condition is not active in the image,
  so the container consumes `dist`. The `CMD` and copied paths change with the
  workspace layout (task 6.3).

## Migration Plan

1. Introduce the workspace: root `package.json` `workspaces`, Changesets config,
   per-package manifests/tsconfigs. No source moves yet; the tree still builds.
2. Create `@ts-ha/shared`; move contracts; re-export from `core`; verify
   typecheck and tests.
3. Move web UI server routes + app + asset build into `@ts-ha/web-ui`; convert to
   `ServicePlugin`; delete `mountWebUi()` and the engine gate; move `WEB_UI_*`
   parsing.
4. Move CLI into `@ts-ha/cli`; add `run`; add `@ts-ha/core` dependency and the
   optional web-ui peer; delete `src/standalone.ts` and `src/automations/`.
5. Update Docker, docs, and root scripts for `ts-ha run`.
6. Remove the old root package identity.

Rollback: each step is a commit; reverting to the previous commit restores a
buildable tree because `core` re-exports contracts throughout steps 2–4.

## Open Questions

None outstanding.

Resolved in review: the plugin contract boundary (D7), the web UI auth-token
source (D8), cross-package runtime constants (D9), type-subpath ownership (D10),
the web UI enable/disable bootstrap gate (D3), the capability-module split (D5,
D10), the `ts-ha` binary owner (D6), the automated boundary check (D7), the fate
of the bundled example automations (deleted; documented in `docs/` only), and the
development workflow (a relocated workspace watcher, not `bun --filter`
orchestration).

Resolved in a later exploration pass:

- **Web UI logger access (D7).** The plugin gains a structural `onStart(ctx:
  { logger })`; the logger is captured there and read lazily by the routes, since
  mounting (step 3) precedes `onStart` (step 7).
- **Example automations in the image and tests.** None ship in any package. The
  Docker image expects an operator-provided `./automations` mount (a missing
  directory is logged and startup continues — `automation-manager.ts` tolerates
  it); tests and the end-to-end smoke test seed their own fixture automations in
  a temporary directory.
- **Workspace resolution and sequencing (D6).** Packages use a `development`
  `exports` condition pointing at `src` (build-free dev/test) and a default
  pointing at `dist` for publish; step 1 introduces empty-shell packages so root
  `tsc` never follows not-yet-moved sources.
- **Documentation examples.** The former `src/automations/` examples land under
  `docs/examples/` with their own `tsconfig.json` that type-checks them against
  `@ts-ha/core`, wired into the root typecheck so they cannot silently rot.

Resolved in a further exploration pass (verified against Bun 1.4.2 and the
current tree):

- **`development` exports activation (D6).** The condition resolves only under
  an explicit `--conditions=development`; `NODE_ENV`, `--hot`, and `bunfig`
  `[run] conditions` do not. Every source-resolving script passes the flag.
- **Root test orchestration (D6).** Root `bun test` does not discover
  `packages/*/tests`; the root `test` script runs each package's tests in place.
- **`run --automations` semantics (D8/specs/cli).** The default `./automations`
  and any relative option resolve against `process.cwd()`; the bootstrap warns
  when the resolved directory is absent, since the engine otherwise tolerates it
  silently.
- **Optional-peer delivery (D4).** `npx`/global CLI installs do not opportunistically
  fetch optional peers; the UI must be installed explicitly. Documented.
- **Docker build model (Risks).** The image builds the workspace (UI assets
  included) and runs compiled `dist`; the `development` condition is absent
  in-container.
- **Shared inventory enforcement (D5/2.7).** A generated inventory derived from
  cross-package usage (including consumer-declared wire DTOs, per the gaps pass
  below), plus `scripts/guard-contracts.ts`, backs the "one definition site"
  invariant beyond the edge-level boundary check.

Resolved in a final exploration pass (grounded against the current tree):

- **Browser bundle resolves shared via `development` (D6).** `Bun.build` passes
  `conditions: ["development"]` because the app imports shared's runtime
  capability helpers; the asset build does not wait for `shared`'s `dist`.
- **Typecheck uses `customConditions` (D6).** `tsc` has no `--conditions`; each
  package tsconfig sets `customConditions: ["development"]` and each
  `development` export carries a `types` path to source.
- **The old tag-based `publish.yml` is retired (D6).** Changesets `release.yml`
  is the sole publisher and owns GitHub Release creation.
- **The web UI no longer mirrors the stream contract (D1).** `app/types.ts`
  imports `LogEntry`/`StreamEvent` from `@ts-ha/shared`.
- **Docs and test scope are repo-wide, not curated.** Task 6.4 sweeps every file
  referencing the old identity and verifies by grep; the test relocation list is
  completed (`revert-deadline`, the shared capability-helper test).

Resolved in a gaps exploration pass (grounded against the current tree):

- **CLI wire DTOs (D1).** `@ts-ha/cli`'s locally-declared `LogEntry`,
  `HomekitStatus`, `AutomationInfo`, `DeviceInfo`, and `SerializedDevice` move to
  shared; the web UI app's remaining wire interfaces follow. The inventory
  derivation counts consumer-declared wire DTOs, closing the contradiction with
  the packaging spec's one-definition-site scenario.
- **Per-package `dist` builds (D6).** Every package gains a
  `tsconfig.build.json` and a `build` script with its own JSX settings; the root
  `build` orchestrates in dependency order and `typecheck` covers every package
  plus `docs/examples`. Previously no task produced the `dist` the `exports`
  default and `files` field depend on.
- **Non-publishing root (D6).** The root becomes `private: true` with publish
  fields and lifecycle scripts removed, per the packaging spec's "root MUST NOT
  publish".
- **Tooling scope (D6).** The biome `files.includes` and the web-ui app override
  retarget to `packages/**` in step 1 (not deferred to the final sweep); the
  generated-manifest exclusion is retargeted in task 3.2 when the asset moves.
- **Changesets × `workspace:*` (D6).** A spike pins the protocol behavior in
  task 1.3; a publish dry run must show resolved internal ranges.
- **Guard placement (D7).** The boundary and one-definition-site guards are
  standalone scripts (`scripts/guard-deps.ts`, `scripts/guard-contracts.ts`)
  wired into the root `check` and CI.
- **Shared test fixture.** `tests/fixtures/empty` is duplicated into each
  package's test scope rather than shared.

Resolved in a post-gaps consolidation pass (decisions locked):

- **Cross-package tests that reach into core (D1, D9).** `web-ui-assets` is
  rewritten against `WebUiService` on a bare Hono app; `reserved-keys-client` is
  split after the reserved-key prefix contract moves to `@ts-ha/shared`. No test
  moved into `@ts-ha/web-ui` imports `@ts-ha/core`.
- **`docs/examples` typecheck (D6).** Its `tsconfig.json` sets
  `customConditions: ["development"]`, so the root typecheck stays build-free.
- **`shellyRpcSrc` wire literal.** `config.ts`'s default stays
  `"ts-home-automation"`. The hard rename covers the package name, the binary,
  and import paths only; the RPC source identifier two instances rely on to
  disambiguate responses on a shared broker is a runtime wire value and is
  unchanged. Task 6.4 documents this rather than rewriting it.
- **Per-package `LICENSE`/`README.md` (D6).** Each published package ships its
  own copies; npm will not resolve them from the workspace root.
- **`@ts-ha/web-ui`'s two TypeScript trees (D6).** The nested
  `src/app/tsconfig.json` is retained and the package typecheck covers both
  configs.
