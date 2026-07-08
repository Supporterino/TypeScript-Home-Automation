## Why

The MQTT connection setup and the device registry's handling of untrusted broker messages have bugs that cause duplicate work, resource leaks, and crashes. `connect()` registers both a `once("connect")` and an `on("connect")` handler, so the initial connection fires both — logging a spurious "Reconnected" and calling `resubscribeAll()` twice. When the very first connection errors, the promise rejects but the underlying client keeps auto-reconnecting in the background, leaving a zombie client. Separately, the device registry trusts message shape: a `bridge/event` without a `data` field crashes the message handler with a `TypeError`, and a non-object device state payload (e.g. a bare `"online"` string) is spread into state, corrupting it with index-keyed characters.

## What Changes

- Fix the initial-connect double-fire: use a single connect handler that distinguishes first connect from reconnect via internal state, so `resubscribeAll()` runs once per connect and logs correctly.
- On initial-connect failure, tear down the zombie client (`end()`/disconnect) when the connect promise rejects, so no background reconnect loop survives a rejected `connect()`.
- Device registry: guard `bridge/event` handling — validate `event.data` exists (and `friendly_name` is present) before dereferencing, skipping malformed events with a warning.
- Device registry: guard per-device state merge — only spread the payload when it is a non-null object; ignore/skip non-object payloads (e.g. availability strings) with a debug log.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `mqtt`: Connection lifecycle event handling — single-fire connect and zombie-client teardown on initial failure.
- `device-registry`: Bridge-event and per-device-state handling must validate payload shape before dereferencing/merging.

## Impact

- Code: `src/core/mqtt/mqtt-service.ts` (`connect()` event wiring), `src/core/zigbee/device-registry.ts` (`handleBridgeEvent`, `handleDeviceState`).
- Behavior: cleaner logs (no false "Reconnected"), no duplicate subscribe on startup, no zombie client after a failed initial connect, and malformed MQTT messages no longer crash or corrupt the registry.
- Tests: `tests/` MQTT connect single-fire + failed-connect teardown; device-registry malformed `bridge/event` and non-object state payload.
- No public API changes.
