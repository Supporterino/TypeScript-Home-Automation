## MODIFIED Requirements

### Requirement: Startup Sequence (start())

The system MUST execute startup in this order:

1. Warn if `HTTP_TOKEN` is empty (unauthenticated API)
2. Set manager/log-buffer/device-registry references on `HttpServer`
3. Mount service plugin routes on the HTTP server — this is the single point at
   which optional services, including the web UI, attach their routes
4. Start HTTP server listening
5. Load persisted state from disk
6. Load persisted device registry from disk
7. Call `onStart()` on all registered `ServicePlugin` instances
8. Connect to MQTT broker
9. Start device registry (subscribe to bridge topics)
10. Construct and start the device sources, then the aggregate accessor over them
11. Discover and register automations from `automationsDir`
12. Mark engine as started on HTTP server

There is no web-UI-specific startup step. The engine MUST NOT gate on, import, or
mount the web UI; when the web UI is present it is an ordinary registered service
plugin mounted in step 3.

Because routes mount in step 3 and `onStart()` runs in step 7, a service plugin
that needs the engine logger MUST obtain it during `onStart()` and read it lazily
inside its request handlers; the engine MUST NOT require a plugin to hold its
logger at mount time. The HTTP server does not listen until after step 7, so no
request can reach a mounted route before `onStart()` has run.

Device sources MUST be started after the device registry and the service registry
they are built over, and before automation discovery, so that an automation's
`onStart()` never observes a partially constructed device surface.

Constructing a source whose backing service or configuration is absent MUST NOT
fail startup. The source is omitted and reported as unavailable through the
aggregate accessor. A source that fails to start MUST be logged and omitted on
the same terms, so that one misconfigured family does not prevent the engine from
running.

The system MUST roll back (best-effort cleanup) on any startup failure and re-throw the error. Rollback MUST stop any device source that was started.

#### Scenario: An unconfigured source does not fail startup

- **WHEN** the engine starts with no Nanoleaf service registered
- **THEN** startup completes and the Nanoleaf source is reported as unavailable

#### Scenario: A failing source is isolated

- **WHEN** one device source throws while starting
- **THEN** the failure is logged, that source is reported as unavailable, and the
  remaining sources and the engine still start

#### Scenario: Sources precede automation discovery

- **WHEN** an automation's `onStart()` runs during discovery
- **THEN** the aggregate device accessor is already populated

#### Scenario: Web UI mounts as an ordinary service plugin

- **WHEN** the engine starts with the web UI plugin registered
- **THEN** its routes are mounted in the service-plugin step and there is no
  separate web-UI startup step

#### Scenario: A plugin's logger is available after onStart

- **WHEN** a service plugin mounts routes in step 3 and receives its logger in
  the step-7 `onStart()` hook
- **THEN** a request serviced after startup can log through that logger
