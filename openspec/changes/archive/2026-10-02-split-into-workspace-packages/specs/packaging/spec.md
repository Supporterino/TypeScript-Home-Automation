## Purpose

Defines the package topology of the project: four independently published Bun
workspace packages (`@ts-ha/shared`, `@ts-ha/core`, `@ts-ha/web-ui`,
`@ts-ha/cli`), the allowed dependency direction between them, the contracts-vs-
implementation split, and how the web UI is loaded without burdening every
consumer.

## ADDED Requirements

### Requirement: Workspace Package Topology

The repository MUST be a Bun workspace containing four packages under
`packages/`:

| Package | Responsibility |
|---------|----------------|
| `@ts-ha/shared` | The domain and wire contracts, contract constants, and pure helpers |
| `@ts-ha/core` | The engine, services, device sources, HTTP server, MQTT, state, scheduling |
| `@ts-ha/web-ui` | Web UI route registration, React/Mantine application, compiled assets |
| `@ts-ha/cli` | `DebugClient`, terminal dashboard, target config, and the `run` command |

Each package MUST own its own `package.json`, `tsconfig.json`, and test scope.
Each package MUST declare its entry points (`main`, `types`, `exports`, `files`)
and publish metadata (`license`, `repository`, `publishConfig.access`). Each
package's `exports` MUST carry a `development` condition resolving to its source
for both `types` and `import` resolution, and each package's `tsconfig.json`
MUST set `customConditions: ["development"]` so `tsc` resolves workspace imports
to source without a prior build. Because a custom exports condition is selected
only when passed explicitly (not by `NODE_ENV` or configuration), every consumer
that resolves a workspace import to source MUST pass it through its own
mechanism — Bun scripts via `--conditions=development`, the browser asset build
via `Bun.build`'s `conditions`, and `tsc` via `customConditions`; when it is not
passed, resolution MUST fall back to the compiled outputs. The `ts-ha` binary
MUST be declared by `@ts-ha/cli`. The workspace root MUST NOT publish a package
of its own.

#### Scenario: Four packages are present

- **WHEN** the workspace is installed
- **THEN** `@ts-ha/shared`, `@ts-ha/core`, `@ts-ha/web-ui`, and `@ts-ha/cli` each
  resolve as a workspace package

#### Scenario: The CLI owns the command

- **WHEN** the workspace is installed
- **THEN** the `ts-ha` executable is provided by `@ts-ha/cli`

#### Scenario: A package owns its tests

- **WHEN** a test exercises behavior of a single package
- **THEN** it lives in that package's own test scope rather than the workspace root

#### Scenario: A workspace import resolves to source only with the flag

- **WHEN** a script is expected to resolve a workspace import to source without a
  build
- **THEN** it passes the `development` condition explicitly, and resolution fails
  to the package rather than silently using a stale build when the flag is omitted

#### Scenario: Typecheck resolves source without a build

- **WHEN** a package is type-checked with `tsc --noEmit` before any workspace
  package has been compiled to `dist`
- **THEN** its workspace imports resolve to source through the `development`
  condition, because the package tsconfig sets `customConditions`

#### Scenario: The browser bundle resolves shared to source

- **WHEN** the web-ui asset build runs before `@ts-ha/shared` has been compiled
- **THEN** the bundle resolves `@ts-ha/shared` to source, because the build passes
  the `development` condition to `Bun.build`

#### Scenario: A package with multiple TypeScript trees type-checks build-free

- **WHEN** `@ts-ha/web-ui` type-checks its no-JSX server modules and its
  `react-jsx` browser app before any workspace package has been compiled
- **THEN** both its package tsconfig and its nested app tsconfig set
  `customConditions`, so both resolve workspace imports to source

#### Scenario: A published package is self-contained

- **WHEN** a package tarball is produced
- **THEN** it contains its own `LICENSE` and `README.md`, rather than relying on
  files at the workspace root

### Requirement: Dependency Direction

The allowed dependency direction MUST be:

- `@ts-ha/shared` depends on no other workspace package
- `@ts-ha/core` depends on `@ts-ha/shared` and MUST NOT depend on
  `@ts-ha/web-ui`
- `@ts-ha/web-ui` depends on `@ts-ha/shared` and MUST NOT depend on
  `@ts-ha/core` (not even for types)
- `@ts-ha/cli` depends on `@ts-ha/core` and `@ts-ha/shared`, and MUST NOT
  statically depend on `@ts-ha/web-ui`

No package other than `@ts-ha/cli` may depend on `@ts-ha/core` as a runtime
dependency for the web UI or CLI concerns.

#### Scenario: Core does not know the web UI

- **WHEN** the `@ts-ha/core` package's source is searched for references to the
  web UI package
- **THEN** there are no static imports and no dynamic imports of `@ts-ha/web-ui`

#### Scenario: Web UI does not depend on core

- **WHEN** `@ts-ha/web-ui`'s declared dependencies are inspected
- **THEN** `@ts-ha/core` is absent, even as a type-only or development dependency

#### Scenario: A forbidden edge fails the build

- **WHEN** a source file in `packages/web-ui/src` imports `@ts-ha/core`, or a
  source file in `packages/core/src` imports `@ts-ha/web-ui`
- **THEN** the automated boundary check fails rather than shipping the crossing

### Requirement: Shared Owns The Contracts

`@ts-ha/shared` MUST be the single definition site for the domain and wire
contracts consumed by more than one package. This includes the capability
vocabulary, device descriptor and observation shapes, trigger context, execution
record shapes, room shapes, log entry, and the realtime stream event union.

These contracts MUST NOT be re-declared in `@ts-ha/web-ui` or `@ts-ha/cli`.
`@ts-ha/core` MAY re-export them so that its own public API is stable, but the
definition MUST live in `@ts-ha/shared`.

`@ts-ha/shared` MUST contain no runtime code beyond trivial type guards,
constants, or pure helpers that encode a rule two or more packages must agree
on. Such contract constants include cross-package runtime literals two or more
packages must agree on, such as the session cookie name; such pure helpers
include the capability boolean read/compose rule. Source-specific transformation
logic (for example, mapping Zigbee2MQTT `exposes` into the capability
vocabulary) MUST remain in `@ts-ha/core`.

The inventory of shared contracts MUST be derived from the actual cross-package
usage of `@ts-ha/core`, `@ts-ha/web-ui`, and `@ts-ha/cli` — both types imported
across a boundary and wire-response DTOs a consumer declares locally that name a
payload the engine or a service produces — not from a hand-maintained list. A
type referenced by a consumer package that is not a private implementation
detail of one package MUST have exactly one definition site in `@ts-ha/shared`.

Purely client-private view state (for example dashboard aggregation or
optimistic-update bookkeeping that names no wire payload) is exempt and MAY
remain local to its package.

`@ts-ha/shared` MUST also own the type subpaths formerly exported from the root
package — `/types`, `/types/shelly`, `/types/nanoleaf`, `/types/weather`, and
`/types/notification` — re-exported at `@ts-ha/shared/types[/...]`.

#### Scenario: A wire type has one definition

- **WHEN** `LogEntry` or `StreamEvent` is referenced from core, web-ui, or cli
- **THEN** all three resolve to the same declaration originating in
  `@ts-ha/shared`

#### Scenario: Shared has no heavy runtime

- **WHEN** `@ts-ha/shared` is imported by a browser bundle
- **THEN** it contributes only types and contract constants, not engine, HTTP, or
  framework runtime

#### Scenario: A pure contract helper has one definition

- **WHEN** the web UI bundle and a core consumer interpret a boolean capability's
  declared on/off encoding
- **THEN** both use the same helper declared in `@ts-ha/shared`

#### Scenario: A reserved-namespace literal has one definition

- **WHEN** a core runtime path and the browser bundle both determine whether a
  state key belongs to the reserved internal namespace
- **THEN** the prefix literal both derive from is declared in `@ts-ha/shared`,
  even though the server-side guard and the client-side predicate may be
  implemented separately

#### Scenario: Source-specific mapping stays in core

- **WHEN** `mapZ2MExposes` is referenced
- **THEN** its declaration lives in `@ts-ha/core` (re-exported from core's
  barrel) and not in `@ts-ha/shared`

#### Scenario: A consumed contract has one definition

- **WHEN** `@ts-ha/web-ui` or `@ts-ha/cli` references a contract type that
  `@ts-ha/core` also uses
- **THEN** the definition is found in `@ts-ha/shared` and neither consumer
  re-declares it

#### Scenario: The web UI does not mirror the stream contract

- **WHEN** the web UI app needs `LogEntry` or `StreamEvent`
- **THEN** it imports the declaration from `@ts-ha/shared` rather than declaring a
  parallel copy in its browser source

#### Scenario: The CLI does not mirror wire contracts

- **WHEN** the CLI needs a wire response shape such as `LogEntry`,
  `HomekitStatus`, `AutomationInfo`, `DeviceInfo`, or a device descriptor
- **THEN** it imports the declaration from `@ts-ha/shared` rather than declaring a
  parallel copy in `packages/cli/src`

#### Scenario: Client-private view state may stay local

- **WHEN** a package declares a shape that is derived client-side and names no
  engine- or service-produced payload
- **THEN** it may remain local to that package

#### Scenario: Type subpaths move to shared

- **WHEN** a consumer imports the former root type subpaths
- **THEN** the same types resolve from `@ts-ha/shared/types[/...]`

### Requirement: Plugin Contract Without A Core Type Edge

`@ts-ha/web-ui` MUST satisfy the engine's service-plugin contract without
importing any type from `@ts-ha/core`. The plugin object it produces MUST expose
the members the engine structurally requires (a `serviceKey`, an `onStart` hook,
and a `registerRoutes` hook) and MUST be passed through the engine's generic
`services` registry, which accepts arbitrary keys. `@ts-ha/core` MUST continue to
detect plugins structurally rather than requiring a nominal shared interface.

The `onStart` hook exists so the plugin receives the engine's logger: it declares
its own minimal context shape exposing only `logger` and imports nothing from
core. Because the engine mounts routes before it runs the `onStart` lifecycle
hook, the plugin MUST capture the logger during `onStart` and read it lazily when
handling a request, so that mounting never dereferences an unset logger.

#### Scenario: The web UI plugin imports nothing from core

- **WHEN** `@ts-ha/web-ui`'s source is searched for imports of `@ts-ha/core`
- **THEN** there are none, including `import type`

#### Scenario: The plugin receives the engine logger

- **WHEN** the engine runs the web UI plugin's `onStart` lifecycle hook
- **THEN** the plugin receives a logger through its own structural context shape
  without importing a core type

#### Scenario: Mounting does not require the logger

- **WHEN** the web UI plugin's routes are mounted before its `onStart` hook has
  run
- **THEN** mounting succeeds and the logger is read lazily at request time

#### Scenario: The engine accepts the structurally typed plugin

- **WHEN** the web UI plugin is passed under the `web-ui` key of the engine's
  `services` option
- **THEN** its routes are mounted via the service-plugin lifecycle with no
  compile-time dependency between the packages

### Requirement: Web UI Is An Optional Peer Of The CLI

The `run` command MUST load the web UI lazily, and `@ts-ha/web-ui` MUST be
declared as an optional peer dependency of `@ts-ha/cli`. A CLI installation whose
operator never enables the web UI MUST be able to run a headless engine without
the web UI's dependency tree being required at runtime.

When the web UI is enabled but the peer is not installed, the `run` command MUST
fail with a message naming the package to install, rather than crashing with an
unresolved-import error.

Optional peers are not opportunistically installed by every delivery channel: a
`npx`-launched or globally installed CLI may not fetch `@ts-ha/web-ui`. An
operator who wants the web UI with such an install MUST install it explicitly.
A headless install remains sufficient without it.

#### Scenario: Headless run needs no web UI

- **WHEN** `ts-ha run` is started with the web UI disabled and `@ts-ha/web-ui` is
  not installed
- **THEN** the engine starts and no unresolved-import error occurs

#### Scenario: Enabling without the peer explains the fix

- **WHEN** `ts-ha run` is started with the web UI enabled but `@ts-ha/web-ui` is
  not installed
- **THEN** the command fails with a message naming the missing package

#### Scenario: A non-installing delivery still runs headless

- **WHEN** the CLI is launched by a channel that does not install optional peers
  (`npx`, a global install) with the web UI disabled
- **THEN** the engine runs headless, and enabling the UI requires installing
  `@ts-ha/web-ui` explicitly

### Requirement: Independent Versioning

The four packages MUST be versioned and released independently using Changesets,
and published to the public registry under the `@ts-ha` scope (initial version
`0.1.0`, `publishConfig.access` set to public). A change that touches only one
package MUST NOT force a version bump of the others, and dependency bumps MUST be
propagated by the release tooling rather than by hand. The release workflow MUST
publish via the registry's trusted-publishing mechanism.

#### Scenario: A single-package change bumps one package

- **WHEN** a change affects only `@ts-ha/web-ui`
- **THEN** a release bumps only `@ts-ha/web-ui` (and any dependents whose ranges
  require it), not the entire workspace

#### Scenario: Release publishes under the scope

- **WHEN** a version PR is merged
- **THEN** the changed packages publish to the public registry under `@ts-ha`
  using the release workflow
