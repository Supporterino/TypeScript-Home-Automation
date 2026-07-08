## Context

The HomeKit bridge (`HomekitService`) is structurally coupled to Zigbee2MQTT at
every layer:

- **Discovery** reads `DeviceRegistry.getDevices()` and reacts to
  `onDeviceAdded` / `onDeviceRemoved`.
- **State sync** subscribes to `onDeviceStateChange` (a push model driven by MQTT).
- **Write-back** calls `mqtt.publishToDevice(friendlyName, command)`.
- **Capability detection** (`homekit-accessory-factory.ts`) inspects the
  Zigbee2MQTT `exposes` schema.

Shelly Gen 2 devices are the inverse: controlled over HTTP RPC
(`http://{host}/rpc/{Method}`), request/response only, with **no push channel**.
`ShellyService` holds a private `Map<string, ShellyDevice>` populated by
`register(name, host)` calls made imperatively inside automations.

Two hard constraints from the user:
1. **HTTP-only** — Shelly must not use MQTT.
2. Devices are **plugs, in-wall switches, and 2PM covers**. The factory currently
   has **no cover/WindowCovering support at all**.

A subtle but decisive constraint: in `engine.ts`, `serviceRegistry.startAll()`
(which runs `HomekitService.onStart`) executes **before**
`manager.discoverAndRegister()` (where automations call `shelly.register`). So at
HomeKit start time, the Shelly device inventory is empty.

## Goals / Non-Goals

**Goals:**
- Expose Shelly plugs, switches, and covers in the Home app alongside Zigbee
  devices, from a single bridge.
- Keep the Zigbee path behaviorally unchanged.
- Establish a clean, symmetric abstraction (`AccessorySource`) so both device
  families — and future ones — plug in the same way.
- Keep Shelly HTTP-only; freshness via a global polling loop.
- Single-declaration UX: one `shelly.register(name, host, { type })` call feeds
  both automations and HomeKit.

**Non-Goals:**
- Shelly-over-MQTT support (explicitly excluded by the user).
- Per-device poll intervals (global interval only for now).
- Multi-channel Shelly devices (component `id` other than `0`).
- Smooth cover-animation tracking via accelerated polling during motion.
- Brightness/color for Shelly (dimmers) — out of scope for this change.

## Decisions

### D1: `AccessorySource` abstraction over device families

Introduce a neutral interface the bridge consumes:

```ts
interface AccessorySource {
  readonly name: string;                       // "zigbee" | "shelly" (logging)
  start(sink: AccessorySink): Promise<void> | void;
  stop(): Promise<void> | void;
}

interface AccessorySink {
  add(id: string, accessory: CreatedAccessory): void;   // → bridge.addBridgedAccessory
  remove(id: string): void;                             // → bridge.removeBridgedAccessory
}
```

`HomekitService` becomes a **source-agnostic bridge host**: it owns the HAP
`Bridge`, publish/unpublish, persist path, PIN/port/bind, the accessory map, and
the status endpoint. It knows nothing about `ZigbeeDevice`, `exposes`, MQTT, or
Shelly RPC. Each source owns its own freshness mechanism internally and calls
`created.updateState(...)` directly; the sink only mediates add/remove.

**Alternatives considered:**
- *Parallel path inside `HomekitService`* (a second `addShellyAccessory` method):
  lower risk but grows two personalities and duplicates lifecycle. Rejected —
  user asked for full symmetric abstraction.
- *Synthesize fake `ZigbeeDevice`s for Shelly*: dishonest (forges `exposes`),
  covers still need new factory code, write-back still must branch. Rejected.

### D2: `CreatedAccessory` stays the shared contract

The existing `CreatedAccessory { accessory, updateState }` is already
source-neutral. Both factories emit it. Reused unchanged.

### D3: Two factories, one contract

- `homekit-accessory-factory.ts` (existing, Zigbee) — untouched.
- `homekit-shelly-factory.ts` (new) — `buildShellyAccessory(device, onSet)` with
  `createShellySwitch` (Switch/Outlet) and `createShellyCover` (WindowCovering).

### D4: `ZigbeeSource` = extraction, not rewrite

The `addAccessory` / `removeAccessory` / state-handler logic currently in
`HomekitService` (roughly lines 329–406) relocates into `ZigbeeSource` nearly
verbatim: `start(sink)` replays `registry.getDevices()` and subscribes to
`onDeviceAdded/Removed`; state handlers call `updateState`. This preserves
behavior and keeps the diff on the Zigbee side mechanical.

### D5: Shelly freshness = global HTTP polling loop + `onGet`

HTTP-only means no push. `ShellySource` runs a single `setInterval` that, each
tick, iterates `shelly.getDevices()` and calls `Switch.GetStatus` /
`Cover.GetStatus`, normalizes the response, and pushes it via
`created.updateState(...)`. This makes physical button/switch presses appear in
HomeKit within one interval. Interval is a global option
`homekit.pollIntervalMs` (default ~10000 ms). Optionally also wire `onGet` for
on-demand freshness; the poll loop is the primary mechanism.

The loop iterates the *live* device list each tick (not a start-time snapshot) so
devices registered later are picked up automatically.

**Alternative:** `onGet`-only (lazy). Rejected as primary — physical changes stay
invisible until the app is opened.

### D6: Startup-ordering fix via registration events (symmetry win)

`ShellyService` gains a hand-rolled listener set (matching the `DeviceRegistry`
pattern — a `Set<Handler>`, not Node's `EventEmitter`):

```ts
type ShellyDeviceType = "switch" | "outlet" | "cover";
register(name, host): void
register(name, host, type: ShellyDeviceType): void   // default "switch"
getDevices(): ShellyDevice[]
onDeviceRegistered(cb): void / offDeviceRegistered(cb): void
```

`ShellySource.start(sink)` replays already-registered devices, then subscribes to
`onDeviceRegistered`. This is exactly symmetric with `ZigbeeSource` using
`getDevices()` + `onDeviceAdded`, and it dissolves the ordering hazard (D-context)
without reordering `engine.ts` or changing the documented service lifecycle. It
also handles devices registered at runtime.

**Alternatives considered:**
- *Reorder engine to load automations before `startAll`*: inverts a documented
  lifecycle contract; automations' `onStart` and `requiredServices` validation
  assume services are already started. Wide blast radius. Rejected.
- *Post-start hook that builds Shelly accessories after `started = true`*: no such
  hook exists, and it still misses runtime registrations. Rejected.

### D7: `register` API — options object with default type

`register(name, host, type?)` with `type` defaulting to `"switch"`. Existing
2-arg calls keep working (back-compatible). An options-object overload is
preferred for future extensibility (later: channel id, exclude-from-homekit,
nice name) without further signature churn.

### D8: WindowCovering state translation

```
Shelly Cover.GetStatus         →  HAP WindowCovering
current_pos: 0..100            →  CurrentPosition 0..100   (both 0=closed, 100=open)
state "opening"                →  PositionState INCREASING (1)
state "closing"                →  PositionState DECREASING (0)
state "open"/"closed"/"stopped"→  PositionState STOPPED    (2)
HAP TargetPosition (write)     →  shelly.coverGoToPosition(name, pos)
```

Uncalibrated covers report `current_pos: null`. HAP requires a number: report
`0`, log a warning suggesting calibration, and still expose the accessory.

### D9: Factory migration to a context object (BREAKING)

Replace the positional `HomekitServiceFactory` with:

```ts
interface HomekitServiceContext {
  http: HttpClient;
  logger: Logger;
  mqtt: MqttService;
  deviceRegistry: DeviceRegistry | null;
  shelly: ShellyService | null;
}
type HomekitServiceFactory = (ctx: HomekitServiceContext) => HomekitService;
```

`HomekitService`'s constructor also gains `shelly`. `engine.ts` already resolves
`shellyService` (line ~316) before `homekitService` (line ~353), so the handle is
in scope — build the context object once and pass it. Future cross-device
integrations (e.g. nanoleaf-into-homekit) become additive, no more arg churn.

## Risks / Trade-offs

- **Breaking factory/constructor signature** → Contained to this repo (no external
  npm consumers depend on the factory form per the standalone/npm split). Mitigate
  by updating all docstrings/examples in `engine.ts` and `homekit-service.ts` in
  the same change so the codebase stays self-consistent.
- **Constant outbound HTTP traffic** → A handful of devices at ~10 s is negligible.
  Interval is configurable; document the trade-off.
- **Jerky cover animation** (poll interval >> visible motion granularity) → Accept
  for now; note as a known limitation. Accelerated-during-motion polling is a
  future refinement (Non-Goal).
- **Shelly device unreachable during a poll tick** → A failed `GetStatus` must not
  crash the loop or reject other devices; catch per-device, log, continue.
- **Zigbee extraction regressions** → Mitigate by keeping `ZigbeeSource` a
  near-verbatim move and relying on existing HomeKit/Zigbee behavior; add a focused
  test for `AccessorySource` add/remove wiring.

## Open Questions

- Should `onGet` be wired in addition to the poll loop for immediate freshness, or
  is the poll loop alone sufficient for v1? (Leaning: poll loop is sufficient;
  `onGet` optional.)
- Accessory `id` scheme for the sink: reuse Shelly `name` (unique per registration)
  vs. a `"shelly:"`-prefixed id to avoid collisions with Zigbee `friendly_name`.
  (Leaning: prefix by source to guarantee uniqueness across sources.)
