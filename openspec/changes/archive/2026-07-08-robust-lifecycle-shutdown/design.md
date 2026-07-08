## Context

Five lifecycle sites lack fault isolation:

- `engine.ts:542-562` — `stop()` is a bare sequential `await` chain. Any throw (e.g. `stateManager.save()`) skips `mqtt.disconnect()` + `httpServer.stop()` and leaves `started = true`.
- `cron-scheduler.ts:35-52` — `onTick` wraps `callback()` in try/catch, but the callback is async and not awaited, so rejections escape as unhandled rejections. `schedule()` also overwrites `this.jobs.set(id, ...)` without stopping the prior `CronJob`.
- `automation-manager.ts` registration — on `onStart()` throw, triggers are unwound but `onStop()` is never called, leaking timers/listeners the automation created in `onStart()`.
- `homekit-service.ts:286-296` — sources `start()` (poll intervals + registry listeners) before `bridge.publish()`. If `publish()` throws, the registry never calls `onStop()` (plugin `onStart` failed), so the timers/listeners leak.
- `service-registry.ts:135-168` — sequential `await` per plugin, no timeout; stop order is FIFO.

## Goals / Non-Goals

**Goals:**
- Shutdown always attempts every teardown step and always resets `started`.
- No async error from a scheduled job is ever unhandled.
- No lifecycle path (cron reschedule, automation onStart failure, HomeKit publish failure) leaks a timer or listener.
- One stuck plugin cannot wedge start or stop.

**Non-Goals:**
- Concurrent-`start()` guarding and automation-execution serialization (separate concerns, not in this change).
- Changing the shutdown *order* — only its error handling.
- Configurable timeout values via env — a sensible constant is fine for now (can be a follow-up).

## Decisions

### Decision: Per-step try/catch in `stop()`

Wrap each teardown step in its own try/catch (or a small `safe(step, label)` helper that awaits and logs on failure). Put `started = false` in a `finally` at the end. Order is unchanged.

**Alternatives:** `Promise.allSettled` over all steps (rejected — order matters, e.g. stop automations before disconnecting MQTT). Sequential-with-isolation preserves ordering and guarantees completion.

### Decision: `await` cron callback and catch rejections

Make `onTick` `async` and `await callback()` inside try/catch. This captures both sync throws and async rejections. In `schedule()`, look up any existing entry for `id` and call `.stop()` before replacing it.

**Alternatives:** attach `.catch()` to the returned promise (works but `await` reads cleaner and also catches sync throws uniformly). Overlap-skip guard (a "still running" flag) is a nice-to-have but out of scope — this change targets the error-handling and leak bugs specifically.

### Decision: Call `onStop()` in automation registration rollback

In the catch that handles `onStart()` failure, before/after unwinding triggers, call `automation.onStop()` inside its own try/catch (log-and-continue). Order: unwind triggers, then `onStop()`, then remove from `this.automations`.

### Decision: HomeKit publish-failure teardown

Wrap `bridge.publish()` in try/catch. On failure: iterate started sources calling `source.stop()` (best-effort each), set `published = false`, `bridge = null`, then rethrow so the registry logs the plugin startup failure. This makes HomeKit self-clean even though the registry won't call its `onStop()`.

### Decision: Per-plugin timeout + LIFO stop in registry

Introduce a `withTimeout(promise, ms, label)` helper (`Promise.race` against a timer that rejects/resolves with a logged timeout). Apply to each `onStart`/`onStop`. Iterate `stopAll` over the reversed list of registered plugins.

**Alternatives:** parallel `startAll` via `Promise.allSettled` (rejected for now — some plugins may have implicit ordering expectations; sequential-with-timeout is the minimal safe fix). Timeout constant chosen generously (e.g. 15s) to avoid killing legitimately slow publishes like HomeKit mDNS.

## Risks / Trade-offs

- **Timeout too short kills a legitimately slow plugin** → pick a generous default (~15s) and log clearly; make it a named constant for easy tuning.
- **`await`-ing cron callbacks changes timing** → callbacks were already meant to run to completion; awaiting only affects error capture, not scheduling of the *next* tick (cron fires independently). Overlap behavior is unchanged (still no skip guard) — documented as out of scope.
- **HomeKit self-teardown on publish failure could double-stop if the registry later calls onStop** → guard with the `bridge === null`/`published === false` checks already present in `onStop`.

## Migration Plan

- Fully backward compatible; no config or API changes.
- Rollback is a straight code revert; no persisted-state implications.
