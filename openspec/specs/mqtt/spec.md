# MQTT Service

## Purpose

Wraps the `mqtt` npm package to provide a single persistent connection to an MQTT broker with optimized message dispatch. Supports wildcard topic subscriptions (`+` single-level, `#` multi-level), automatic reconnection, and a convenience API for Zigbee2MQTT device communication.

## Requirements

### Connection Management

The system MUST connect to the MQTT broker using the configured `host` and `port`.

The system MUST support:
- **Authentication**: `MQTT_USERNAME` and `MQTT_PASSWORD` (optional, no auth when empty)
- **Client ID**: Auto-generated as `home-automation-<timestamp>`
- **Clean session**: `clean: true`
- **Reconnection**: Auto-retry every 5 seconds
- **Connection timeout**: 10 seconds

The `connect()` method MUST return a `Promise<void>` that resolves on initial connection or rejects on connection error before the first connect.

### Connection State

The system MUST expose `isConnected: boolean` reflecting current connection state.

The system MUST fire these lifecycle events:
- `connect` → set `connected = true`, resubscribe all topics
- `reconnect` → log warning
- `error` → log error; reject connect promise if not yet connected
- `offline` → set `connected = false`, log warning

### Message Dispatch

The system MUST use an optimized two-tier dispatch strategy:

1. **Exact topics** — Indexed in a `Map<string, handler[]>` for O(1) lookup per message
2. **Wildcard patterns** — Pre-split patterns stored in a linear array, iterated per message

JSON parsing MUST be deferred until at least one handler matches the topic. Messages with no matching handlers are silently dropped without parsing.

### Subscribe / Unsubscribe

`subscribe(topic, handler)` MUST:
- Classify as exact or wildcard based on presence of `+` or `#`
- Store handler in the appropriate index
- Track a reference count for the topic
- Forward the subscription to the MQTT broker if connected
- Auto-subscribe on reconnect

`unsubscribe(topic, handler)` MUST:
- Remove the specific handler from the index
- Decrement the reference count
- Unsubscribe from the broker only when the reference count reaches zero

### Publish

`publish(topic, payload)` MUST:
- JSON-stringify the payload
- Log an error and no-op if not connected
- Log publish success/failure

`publishToDevice(friendlyName, payload)` MUST:
- Prepend `{zigbee2mqttPrefix}/` and append `/set`
- Call `publish()` with the constructed topic

`deviceTopic(friendlyName)` MUST:
- Return `{zigbee2mqttPrefix}/{friendlyName}` without `/set`

### Disconnect

`disconnect()` MUST:
- Call `client.endAsync()`
- Set `client = null` and `connected = false`
- No-op if already disconnected

### Wildcard Matching

The system MUST use a custom wildcard matching implementation (not the mqtt library's built-in matcher). The internal `mqtt-utils.ts` provides:
- `hasWildcard(topic)` — returns `true` if topic contains `+` or `#`
- `splitPattern(topic)` — splits topic into segments for efficient matching
- `topicMatchesParts(patternParts, topic)` — pre-split comparison

Pattern matching MUST follow MQTT wildcard rules:
- `+` matches exactly one topic level
- `#` matches any number of remaining levels (must be the last character)

### Error Handling

The system MUST catch errors from message handlers and log them without affecting other handlers or the MQTT connection.
