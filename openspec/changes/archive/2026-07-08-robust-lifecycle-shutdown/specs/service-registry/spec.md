## MODIFIED Requirements

### Requirement: ServicePlugin Lifecycle

The registry MUST manage `ServicePlugin` lifecycle hooks:

#### `startAll(context: CoreContext): Promise<void>`

For every registered service that implements `ServicePlugin`:
1. Create a child logger with `{ service: service.serviceKey }`
2. Call `service.onStart(pluginContext)` if defined, subject to a per-plugin timeout — if `onStart` does not settle within the timeout, the registry MUST log a timeout error and continue with the next plugin rather than blocking startup indefinitely
3. Log `"Starting service plugin"` before and any error after
4. Errors (including timeouts) in individual plugins are caught, logged, and do NOT prevent other plugins from starting

#### `stopAll(): Promise<void>`

For every registered service that implements `ServicePlugin`, processed in reverse (LIFO) registration order:
1. Call `service.onStop()` if defined, subject to a per-plugin timeout — if `onStop` does not settle within the timeout, the registry MUST log a timeout error and continue with the next plugin rather than blocking shutdown indefinitely
2. Log `"Stopping service plugin"` before and any error after
3. Errors (including timeouts) in individual plugins are caught, logged, and do NOT prevent other plugins from stopping

#### `mountRoutes(app: Hono): void`

For every registered service that implements `ServicePlugin`:
1. Call `service.registerRoutes(app)` if defined
2. Errors in individual plugins are caught, logged, and do NOT prevent other plugins from mounting

#### Scenario: A hanging plugin does not block others

- **WHEN** one plugin's `onStart` (or `onStop`) never settles
- **THEN** after the per-plugin timeout the registry logs a timeout error and proceeds to start (or stop) the remaining plugins

#### Scenario: Plugins stop in reverse start order

- **WHEN** `stopAll()` runs after multiple plugins were started
- **THEN** plugins are stopped in the reverse of their registration order
