## MODIFIED Requirements

### Requirement: Connection State

The system MUST expose `isConnected: boolean` reflecting current connection state.

The system MUST fire these lifecycle events:
- `connect` → set `connected = true`, resubscribe all topics
- `reconnect` → log warning
- `error` → log error; reject connect promise if not yet connected
- `offline` → set `connected = false`, log warning

The `connect` event handling MUST resubscribe all topics exactly once per connection event and MUST distinguish the initial connection from a subsequent reconnection so that the initial connection is not also logged/handled as a reconnection. In particular, registering the connect handling MUST NOT cause `resubscribeAll()` to run twice on the first connection.

When the `error` event fires before the first successful connection (rejecting the `connect()` promise), the system MUST tear down the underlying client (end the connection) so no background auto-reconnect loop survives a rejected `connect()`.

#### Scenario: Initial connect resubscribes exactly once

- **WHEN** the broker connection is established for the first time
- **THEN** `resubscribeAll()` is invoked exactly once and no "Reconnected" message is logged for the initial connection

#### Scenario: Reconnection resubscribes and logs as reconnect

- **WHEN** the connection is re-established after having been connected previously
- **THEN** `resubscribeAll()` runs and the event is handled/logged as a reconnection

#### Scenario: Failed initial connect leaves no zombie client

- **WHEN** the `error` event fires before the first connect and the `connect()` promise rejects
- **THEN** the underlying MQTT client is ended so it does not continue attempting to reconnect in the background
