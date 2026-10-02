## ADDED Requirements

### Requirement: Run Command

The CLI MUST provide the `ts-ha` binary and a `run` command that boots a local
engine in the current process. It is the only first-party way to run an engine;
there is no separate standalone entry point.

The command MUST accept an automations directory, defaulting to `./automations`
relative to the current working directory. The directory MUST be overridable by
an explicit option; a relative option value MUST also resolve against the
current working directory. Because the engine tolerates a missing or unreadable
automations directory by logging and continuing with zero automations, the
command MUST log an explicit warning when the resolved directory does not exist,
so an operator can distinguish an empty configuration from a wrong path.

The command MUST install graceful shutdown handling for the process signals by
which a container or shell terminates it, stopping the engine before exit.

The command MUST decide whether to load `@ts-ha/web-ui` by reading
`WEB_UI_ENABLED` from the environment as a raw string gate before importing it;
the CLI MUST NOT parse that value into web-UI options. When enabled, the command
MUST dynamic-import `@ts-ha/web-ui`, let that package parse `WEB_UI_ENABLED` and
`WEB_UI_PATH` into its options, construct its plugin with those options plus the
core config's resolved `httpServer.token` as the auth token, and register it with
the engine under a service key. When the web UI is disabled, the command MUST NOT
import `@ts-ha/web-ui`.

#### Scenario: Run uses the default automations directory

- **WHEN** `ts-ha run` is executed and no automations directory is given
- **THEN** the engine loads automations from `./automations` relative to the
  working directory

#### Scenario: Run accepts an explicit directory

- **WHEN** `ts-ha run --automations /etc/automations` is executed
- **THEN** the engine loads automations from `/etc/automations`

#### Scenario: A relative directory resolves against the working directory

- **WHEN** `ts-ha run --automations ./auto` is executed from `/srv/app`
- **THEN** the engine loads automations from `/srv/app/auto`

#### Scenario: A missing automations directory is warned about

- **WHEN** `ts-ha run` resolves an automations directory that does not exist
- **THEN** the command logs an explicit warning naming the resolved path, while
  startup still proceeds

#### Scenario: Run shuts down gracefully

- **WHEN** the process receives a termination signal
- **THEN** the engine is stopped before the process exits

#### Scenario: Run mounts the web UI when enabled

- **WHEN** `ts-ha run` starts with `WEB_UI_ENABLED=true`
- **THEN** the web UI plugin is registered and its routes are served

#### Scenario: Run stays headless when disabled

- **WHEN** `ts-ha run` starts with the web UI disabled
- **THEN** `@ts-ha/web-ui` is not imported

#### Scenario: Run gates before importing

- **WHEN** `ts-ha run` starts with the web UI disabled
- **THEN** the CLI evaluates the raw `WEB_UI_ENABLED` string only and no web-UI
  option parsing runs, because the package is never loaded

#### Scenario: Run supplies the auth token

- **WHEN** `ts-ha run` starts with a non-empty `HTTP_TOKEN` and the web UI enabled
- **THEN** the web UI plugin is constructed with that token, so its login route
  and the core `/api/*` middleware agree

### Requirement: Run Requires The Core Package

The `run` command MUST depend on `@ts-ha/core`'s engine factory. The CLI package
therefore has a runtime dependency on `@ts-ha/core`. This is the only CLI command
that runs an engine; all other commands continue to communicate with a running
engine over HTTP.

#### Scenario: Run and remote commands coexist

- **WHEN** the CLI is installed
- **THEN** `run` boots a local engine while commands such as `devices` and `state`
  still address a remote target over HTTP
