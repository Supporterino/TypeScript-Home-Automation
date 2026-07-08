## Why

The startup/shutdown lifecycle has several fault-isolation gaps that cause resource leaks and lost errors. The engine's `stop()` is a bare sequential await chain: if any earlier step throws (e.g. `stateManager.save()`), MQTT never disconnects and the HTTP port never closes, and `started` is never reset — leaking the connection and port on shutdown. The cron scheduler runs its callback fire-and-forget, so async errors escape its try/catch as unhandled rejections, and re-scheduling an existing id leaks the old `CronJob` timer. Service plugins and HomeKit leak timers/listeners when an `onStart` fails partway (its `onStop` is never called). Service start/stop is fully sequential with no timeout, so one hanging plugin blocks all others.

## What Changes

- Isolate each step of engine `stop()` so a failure in one step cannot prevent the remaining teardown; always reset `started` at the end.
- Cron: `await` the callback and catch async rejections (not just sync throws); when `schedule()` overwrites an existing id, stop the old `CronJob` first.
- Automation manager: if `onStart()` throws, call the automation's `onStop()` during rollback so any timers/listeners created before the failure are released.
- HomeKit: if `bridge.publish()` fails, stop all already-started sources (release poll intervals + registry listeners) and reset `published`/`bridge` so no orphaned timers survive.
- Service registry: guard each plugin `onStart`/`onStop` with a per-plugin timeout so one hanging plugin cannot block the rest; stop plugins in reverse (LIFO) order.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `engine`: The shutdown sequence gains per-step error isolation and guaranteed `started` reset.
- `scheduling`: Callback error handling covers async rejections; re-scheduling an id stops the prior job.
- `automations`: Automation registration rollback must invoke `onStop()` when `onStart()` fails.
- `homekit`: Startup failure (`publish()`) must tear down already-started sources.
- `service-registry`: Plugin lifecycle gains per-plugin timeouts and reverse-order stop.

## Impact

- Code: `src/core/engine.ts` (`stop()`), `src/core/scheduling/cron-scheduler.ts` (`schedule()`), `src/core/automation-manager.ts` (registration rollback), `src/core/services/homekit-service.ts` (`onStart()` failure path), `src/core/services/service-registry.ts` (`startAll()`/`stopAll()`).
- Behavior: shutdown always completes best-effort; a stuck plugin no longer wedges shutdown.
- Tests: cron overlap/overwrite + async error, service-registry timeout + reverse stop, engine stop error isolation.
- No public API changes.
