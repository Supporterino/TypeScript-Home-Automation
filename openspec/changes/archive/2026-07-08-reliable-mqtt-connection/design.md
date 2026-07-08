## Context

Two independent-but-related MQTT reliability bugs:

**mqtt-service.ts:85-98** wires connect twice:

```
this.client.once("connect", () => { ...resubscribeAll(); resolve(); });
this.client.on("connect",   () => { ...resubscribeAll(); });  // "Reconnected"
```

On the first connect both fire → double `resubscribeAll()` + a false "Reconnected" log. On subsequent reconnects only `on` fires (correct).

**mqtt-service.ts:104-108** — on initial `error`, `reject(err)` is called, but `mqtt.connect(url, {reconnectPeriod: 5000})` keeps retrying in the background; the client is never ended. Caller's rejection path doesn't necessarily tear it down.

**device-registry.ts:421** — `event.data.friendly_name` with `event.data` unchecked → `TypeError` crashes the message handler.

**device-registry.ts:488** — `{ ...prev, ...payload }` where a bare-string payload spreads into `{0:'o',1:'n',...}`.

## Goals / Non-Goals

**Goals:**
- Exactly one `resubscribeAll()` per connect; correct first-vs-reconnect logging.
- A rejected initial `connect()` leaves no reconnecting client behind.
- Malformed broker messages can never crash the message handler or corrupt registry state.

**Non-Goals:**
- QoS tuning, retained-message replay policy, or per-topic execution serialization (separate concerns).
- Full schema validation (zod) of every payload — a targeted shape guard is sufficient here.
- Changing the merge semantics for valid object payloads.

## Decisions

### Decision: Single connect handler with an internal `hasConnectedOnce` flag

Replace the `once` + `on` pair with a single `on("connect")` handler that reads a private boolean:

```
this.client.on("connect", () => {
  this.connected = true;
  this.resubscribeAll();
  if (!this.hasConnectedOnce) { this.hasConnectedOnce = true; log "Connected"; resolve(); }
  else { log "Reconnected"; }
});
```

`resolve()` is safe to call once; subsequent connects skip it. This guarantees a single resubscribe per event and correct logging.

**Alternatives:** keep `once` for resolve-only and `on` for resubscribe (rejected — still double-subscribes on first connect unless the `once` omits resubscribe, which is more error-prone to reason about). Single handler + flag is clearest.

### Decision: End the client on initial-connect error

In the `error` handler, when `!this.connected` (pre-first-connect), call `this.client.end(true)` (force) before `reject(err)`, and null the client reference so a later `disconnect()` is a no-op. Guard against ending more than once.

**Alternatives:** rely on the caller/engine rollback to call `disconnect()` (rejected — the leak exists precisely because rollback may not run or may race; ending at the source is deterministic).

### Decision: Shape guards in the device registry

- `handleBridgeEvent`: after the existing `event.type` string check, add `if (!event.data || typeof event.data !== "object") { warn; return; }` before reading `friendly_name`.
- `handleDeviceState`: at the top, `if (payload === null || typeof payload !== "object" || Array.isArray(payload)) { debug; return; }` before the spread.

These mirror the validation already done for `bridge/devices` (`Array.isArray`) for consistency.

## Risks / Trade-offs

- **`client.end(true)` on initial failure** → the promise already rejected; ending is the intended terminal state. Guard prevents double-end.
- **Ignoring non-object device payloads may drop a device that legitimately publishes a scalar** → Zigbee2MQTT device state topics publish JSON objects; scalar publishes on those topics are availability/legacy noise. Debug-logging keeps it discoverable. Availability is a separate topic anyway.
- **`hasConnectedOnce` never resets** → intended; "first connect" is a one-time concept per client instance. A fresh `connect()` after `disconnect()` creates a new client, so re-init the flag in `connect()`.

## Migration Plan

- Backward compatible; no config/API changes. Straight code revert to roll back.
