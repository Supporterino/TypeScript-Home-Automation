## MODIFIED Requirements

### Requirement: Enabling

The web UI MUST be enabled via `WEB_UI_ENABLED=true`. When disabled, no UI routes
are mounted and the web UI source is never imported.

Enabling MUST be the responsibility of the `@ts-ha/web-ui` package, not of the
core engine. The web UI registers its routes by presenting itself as a
`ServicePlugin` to the engine; the core engine MUST NOT import, reference, or
gate on the web UI. When the web UI is disabled, the package's plugin is not
registered at all, so its source is never loaded.

The `WEB_UI_ENABLED` and `WEB_UI_PATH` environment variables MUST be parsed by
`@ts-ha/web-ui`, and the resulting options passed to the plugin by whoever
registers it (the `run` command, or a custom consumer entry point). A registering
entry point MAY read `WEB_UI_ENABLED` as a raw string import gate to avoid loading
the package when disabled, but MUST NOT parse it into options itself — the
package remains the single option parser.

The auth token MUST be supplied to the plugin by the registering entry point from
the core engine's resolved `httpServer.token`; `@ts-ha/web-ui` MUST NOT parse
`HTTP_TOKEN` itself. This keeps the shell, asset, and login routes using the same
secret as the core `/api/*` authentication, with a single definition.

`@ts-ha/web-ui` MUST implement the plugin contract structurally and MUST import
no type from `@ts-ha/core`.

The plugin mounts its routes on the shared Hono app and reads core state through
the app's registered middleware/routes and the shared contracts; it MUST NOT
reach into engine internals. Its `onStart` context exposes only `logger`, so any
data the routes need MUST be available through the mounted app rather than a
direct engine reference.

#### Scenario: Disabled means not loaded

- **WHEN** the web UI is disabled
- **THEN** its plugin is not registered and no web UI module is imported

#### Scenario: Core is not involved

- **WHEN** the web UI is enabled
- **THEN** it is mounted through a `ServicePlugin` registration and the core
  engine contains no web-UI-specific code path

#### Scenario: Headless engine has no web UI source

- **WHEN** an engine is created without registering the web UI plugin
- **THEN** no web UI module is present in the running process

#### Scenario: Token matches the core API

- **WHEN** the web UI is registered with the core engine's resolved token and the
  login route issues a session cookie
- **THEN** requests carrying that cookie are authorized by the core `/api/*`
  middleware

#### Scenario: No token parsing in the UI package

- **WHEN** `@ts-ha/web-ui`'s configuration parsing is exercised with `HTTP_TOKEN`
  set
- **THEN** the value has no effect on its options

#### Scenario: The gate is not a second parser

- **WHEN** a registering entry point decides whether to import `@ts-ha/web-ui`
- **THEN** it reads `WEB_UI_ENABLED` only as a raw string and the package remains
  the sole parser of its own options

### Requirement: URL Path

The web UI MUST be served at its configured path (default: `/status`). The path
MUST start with `/`. The path MUST be supplied to the web UI plugin as an option,
sourced from `WEB_UI_PATH` by the package that constructs the plugin.

#### Scenario: Path is configurable

- **WHEN** the web UI is registered with a configured base path
- **THEN** its shell, assets, and auth routes are served beneath that path

#### Scenario: Invalid path is rejected

- **WHEN** `WEB_UI_PATH` is set to a value not starting with `/`
- **THEN** option parsing fails rather than registering routes at an invalid
  prefix

### Requirement: Build Process

The web UI source is a separate React + Mantine project within the
`@ts-ha/web-ui` package:

- Built via the package's own build script
- Produces content-hashed JS and CSS assets embedded in the package as generated
  modules, so the package ships without a separate static asset directory
- Produces more than one JS asset where the application is split, so that
  features not required for first paint are not loaded on first paint
- Produces a compressed representation of each asset alongside the uncompressed
  one, so that compression is a build product rather than a per-request cost
- Fails when the assets required for a first paint exceed the transferred-size
  budget
- Resolves its workspace imports (notably `@ts-ha/shared`, whose runtime
  capability helpers the app uses) to source by passing the `development` exports
  condition to `Bun.build`, so the asset build does not require a prior build of
  the shared package
- These generated files are git-ignored
- The build runs automatically as a `prepublishOnly`/`prebuild` hook of the
  `@ts-ha/web-ui` package, not as a hook of the core package
- A development workflow MUST exist that applies frontend source changes without
  requiring a full rebuild and engine restart. That workflow MUST resolve
  workspace imports to source by passing the `development` exports condition
  explicitly, since the condition is not selected by `NODE_ENV` or configuration

#### Scenario: Assets are content-addressed

- **WHEN** the frontend is built
- **THEN** each emitted asset's URL incorporates a hash of its contents, so a
  changed build produces a different URL

#### Scenario: Package needs no static directory

- **WHEN** the built `@ts-ha/web-ui` package is installed as a dependency
- **THEN** the web UI serves its assets without requiring any file outside the
  installed module

#### Scenario: Core build does not build the UI

- **WHEN** `@ts-ha/core` is built or type-checked
- **THEN** the web UI asset build is not invoked

#### Scenario: Asset build does not depend on a shared build

- **WHEN** the web UI asset build runs before `@ts-ha/shared` has been compiled
- **THEN** it succeeds, resolving `@ts-ha/shared` to source through the
  `development` condition

#### Scenario: Frontend iteration does not require a restart

- **WHEN** a developer edits frontend source in the development workflow
- **THEN** the change is observable in the browser without rebuilding and
  restarting the engine
