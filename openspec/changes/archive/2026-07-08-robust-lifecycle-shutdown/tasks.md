## 1. Engine stop() error isolation

- [x] 1.1 Add a `safe(step, label)` helper (or inline try/catch) that awaits a teardown step and logs failures without rethrowing
- [x] 1.2 Wrap each of the 9 shutdown steps in `stop()` so a failure never blocks later steps
- [x] 1.3 Reset `started = false` in a `finally` so it always clears even on partial failure

## 2. Cron scheduler

- [x] 2.1 Make `onTick` async and `await callback()` inside try/catch to capture async rejections
- [x] 2.2 In `schedule()`, stop any existing `CronJob` for the same `id` before replacing it in the map

## 3. Automation registration rollback

- [x] 3.1 In the `onStart()` failure path of `register()`, call `automation.onStop()` (best-effort, caught + logged) after unwinding triggers and before removal

## 4. HomeKit publish-failure teardown

- [x] 4.1 Wrap `bridge.publish()` in try/catch in `onStart()`
- [x] 4.2 On failure, call `stop()` on every already-started source (best-effort each), reset `published = false` and `bridge = null`, then rethrow

## 5. Service registry timeout + LIFO stop

- [x] 5.1 Add a `withTimeout(promise, ms, label)` helper that logs and settles on timeout
- [x] 5.2 Apply the timeout to each plugin `onStart` in `startAll()`
- [x] 5.3 Apply the timeout to each plugin `onStop` in `stopAll()` and iterate in reverse registration order

## 6. Tests

- [x] 6.1 Test: engine `stop()` still disconnects MQTT and stops HTTP when an earlier step throws, and resets `started`
- [x] 6.2 Test: cron async-rejecting callback is caught (no unhandled rejection) and other jobs keep running
- [x] 6.3 Test: re-scheduling an existing cron id stops the old job
- [x] 6.4 Test: automation `onStart()` throw triggers `onStop()` during rollback
- [x] 6.5 Test: HomeKit `publish()` rejection stops started sources and resets state
- [x] 6.6 Test: service registry continues past a hanging plugin (timeout) and stops in reverse order

## 7. Verification

- [x] 7.1 Run `bun run typecheck && bun run check && bun test`
