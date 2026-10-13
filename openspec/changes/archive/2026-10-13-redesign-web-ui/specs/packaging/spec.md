## MODIFIED Requirements

### Requirement: Workspace Package Topology

The repository MUST be a Bun workspace containing four packages under
`packages/`:

| Package | Responsibility |
|---------|----------------|
| `@ts-ha/shared` | The domain and wire contracts, contract constants, and pure helpers |
| `@ts-ha/core` | The engine, services, device sources, HTTP server, MQTT, state, scheduling |
| `@ts-ha/web-ui` | Web UI route registration, React/Tailwind application, compiled assets |
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
