## 1. Single-fire connect handling

- [x] 1.1 Add a private `hasConnectedOnce` flag, reset to `false` at the start of `connect()`
- [x] 1.2 Replace the `once("connect")` + `on("connect")` pair with a single `on("connect")` handler that resubscribes once, resolves only on the first connect, and logs "Connected" vs "Reconnected" based on the flag

## 2. Zombie-client teardown on initial-connect failure

- [x] 2.1 In the `error` handler, when not yet connected, force-end the underlying client before `reject(err)` and clear the client reference (guard against double-end)
- [x] 2.2 Ensure `disconnect()` is a safe no-op when the client was already ended

## 3. Device registry payload guards

- [x] 3.1 In `handleBridgeEvent`, validate `event.data` is a non-null object (and has a usable `friendly_name`) before dereferencing; warn and return on malformed events
- [x] 3.2 In `handleDeviceState`, ignore non-object / null / array payloads (debug-log) before the `{ ...prev, ...payload }` merge

## 4. Tests

- [x] 4.1 Test: initial connect calls `resubscribeAll` exactly once and does not log "Reconnected"
- [x] 4.2 Test: a reconnect after a prior connect resubscribes and is handled as a reconnection
- [x] 4.3 Test: an `error` before first connect rejects the promise and ends the client (no lingering reconnect)
- [x] 4.4 Test: a `bridge/event` without `data` is skipped with a warning and does not throw
- [x] 4.5 Test: a non-object device state payload leaves existing state unchanged

## 5. Verification

- [x] 5.1 Run `bun run typecheck && bun run check && bun test`
