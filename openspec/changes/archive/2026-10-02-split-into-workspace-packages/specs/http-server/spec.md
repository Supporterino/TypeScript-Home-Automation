## REMOVED Requirements

### Requirement: Web UI Mounting

**Reason**: The core HTTP server must not know about the web UI. Web UI mounting
is now the responsibility of the `@ts-ha/web-ui` package, which registers its
routes through the existing `ServicePlugin.registerRoutes(app)` hook. Core
retains no web-UI-specific mounting method or configuration gate.

**Migration**: Consumers who relied on `WEB_UI_ENABLED=true` and the engine's own
mounting should now register the web UI plugin. The `ts-ha run` command performs
this registration automatically from the same environment variables, passing the
core config's resolved `httpServer.token` as the plugin's auth token. A custom
entry point constructs the web UI plugin and passes it via the engine's
`services` option, or calls the server's service-plugin mounting hook.

## MODIFIED Requirements

### Requirement: Static Asset Routes

Compiled web UI assets MUST be served from routes beneath the web UI path,
addressed by a hash of their contents, with cache directives permitting
indefinite client caching and a correct content type per asset.

Asset routes MUST be readable without authentication, and MUST serve only
compiled application code and styles — never instance data, credentials, or
device information.

Asset routes MUST be registered by the `@ts-ha/web-ui` package as part of its
`ServicePlugin` registration, not by the core HTTP server. They MUST be
registered only when the web UI is enabled — which, because the package is loaded
only when enabled, means they are absent whenever the web UI package is not
loaded.

#### Scenario: Assets are cacheable

- **WHEN** a client requests a content-addressed asset
- **THEN** the response carries cache directives permitting indefinite caching

#### Scenario: Assets need no session

- **WHEN** an unauthenticated client requests a content-addressed asset while a
  token is configured
- **THEN** the asset is served

#### Scenario: No asset routes when the UI is disabled

- **WHEN** the web UI is disabled
- **THEN** no asset routes are registered

### Requirement: Internal API

The `HttpServer` exposes:
- `fetch: (req: Request) => Response | Promise<Response>` — The Hono app's fetch handler (for testing without starting a real server)
- `setManagers(state, automations, logs)` — Set references after construction
- `setDeviceRegistry(registry)` — Set the device registry reference
- `setEngineStarted(started)` — Mark engine as started for readiness checks
- `mountServiceRoutes(registry)` — Mount routes from all service plugins
- `registerWebhook(path, methods, handler)` / `removeWebhook(path)` — Webhook route management

The server MUST NOT expose a web-UI-specific mounting method.
`mountServiceRoutes(registry)` is the single hook by which any optional service,
including the web UI, attaches its routes.

#### Scenario: No web UI mount method

- **WHEN** the `HttpServer` public surface is inspected
- **THEN** it offers no method that mounts the web UI by name

#### Scenario: Service plugins mount through one hook

- **WHEN** a service plugin that defines `registerRoutes` is registered with the
  engine
- **THEN** its routes are mounted via `mountServiceRoutes`
