## MODIFIED Requirements

### Requirement: Shutdown Sequence (stop())

The system MUST execute shutdown in this order:

1. Unmark engine as started on HTTP server
2. Call `onStop()` on all automations (in reverse registration order)
3. Stop all cron jobs
4. Call `onStop()` on all `ServicePlugin` instances
5. Save device registry to disk (if persist enabled)
6. Stop device registry
7. Save state to disk (if persist enabled)
8. Disconnect MQTT
9. Stop HTTP server

Each step MUST be isolated: a failure (throw or rejection) in any one step MUST be caught and logged, and MUST NOT prevent the remaining steps from executing. In particular, a failure while saving state or the device registry MUST NOT prevent MQTT from disconnecting or the HTTP server from stopping.

After all steps have been attempted, the system MUST reset its internal `started` flag to `false` (even if one or more steps failed), so the engine does not remain in a permanently "started" state after a partial teardown.

The system MUST be idempotent — calling `stop()` when not started is a no-op.

#### Scenario: A failing teardown step does not block the rest

- **WHEN** `stop()` runs and an intermediate step (e.g. saving state) throws
- **THEN** the error is logged, MQTT is still disconnected, the HTTP server is still stopped, and `started` is reset to `false`

#### Scenario: Stop remains idempotent

- **WHEN** `stop()` is called and the engine was never started
- **THEN** it returns without side effects
