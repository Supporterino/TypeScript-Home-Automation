# HomeKit Bridge

## Purpose

Runs a HAP (HomeKit Accessory Protocol) bridge inside the engine process using `hap-nodejs`. Automatically translates Zigbee2MQTT devices tracked by the `DeviceRegistry` into HomeKit accessories, enabling control via Apple's Home app and Siri.

## Requirements

### Configuration

The `HomekitService` MUST accept `HomekitServiceOptions`:

```ts
interface HomekitServiceOptions {
  pinCode: string;           // REQUIRED — format "XXX-XX-XXX"
  persistPath?: string;      // default: "./homekit-persist"
  bridgeName?: string;        // default: "TS-Home-Automation"
  port?: number;             // default: 47128
  username?: string;         // default: "CC:22:3D:E3:CE:F8" (MAC format)
  bind?: string | string[];  // Network interfaces/IPs to advertise on
}
```

### Requirements

The system MUST require `DEVICE_REGISTRY_ENABLED=true`. If the registry is absent, the service MUST log a warning and skip startup.

### ServicePlugin Implementation

The service MUST implement `ServicePlugin`:
- `readonly serviceKey = "homekit"`
- `onStart(ctx: CoreContext)` — Lazy-load hap-nodejs, create bridge, register accessories
- `onStop()` — Unpublish bridge, detach listeners, clear accessories
- `registerRoutes(app: Hono)` — Mount `GET /api/homekit/status`

### Startup Behavior

`onStart()` MUST:

1. Verify `DeviceRegistry` is available
2. Lazy-load `hap-nodejs` (to avoid evaluating native modules at import time)
3. Lazily import `homekit-accessory-factory.ts` for the `createAccessory` function
4. Configure HAP storage path (persists pairing data between restarts)
5. Create a `Bridge` with the configured name and UUID (generated from `username`)
6. For each device already in the registry, create a HomeKit accessory via the factory
7. Subscribe to `onDeviceAdded` and `onDeviceRemoved` events for dynamic updates
8. Call `bridge.publish()` with pin code, port, and category (bridge = 2)
9. Mark `published = true` only after `publish()` resolves

### Accessory Creation

For each Zigbee device, the accessory factory MUST:

1. **Detect capabilities** — Examine `device.definition.exposes` to determine what HomeKit service to create:
   - Lightbulb (on/off, brightness, color temperature, color)
   - Motion sensor
   - Contact sensor
   - Water leak sensor
   - Temperature sensor / Humidity sensor
   - Switch / Outlet
   - Battery service (added to battery-powered devices)

2. **Create the HAP accessory** — Generate a UUID from the IEEE address for stable identity

3. **Wire state updates** — Register a `DeviceStateChangeHandler` that calls `updateState(state)` to sync Zigbee state → HomeKit characteristic values

4. **Wire write-back** — Register `onSet` callbacks on controllable characteristics that publish MQTT commands to Zigbee2MQTT (e.g., `{ state: "ON" }`, `{ brightness: 128 }`)

5. **Skip unsupported devices** — If a device has no recognized capability, skip with a debug log

### Dynamic Device Management

When a new device joins the network:
- `onDeviceAdded` fires → `addAccessory(device)` creates and bridges the accessory

When a device leaves the network:
- `onDeviceRemoved` fires → `removeAccessory(device)` removes the accessory and detaches listeners

### Shutdown

`onStop()` MUST:
1. Detach `onDeviceAdded` / `onDeviceRemoved` listeners
2. Detach all per-device state change handlers
3. Clear accessory map and handler map
4. Call `bridge.unpublish()`
5. Set `published = false` and `bridge = null`

### Status API

`getStatus(): HomekitStatus` MUST return:
```ts
{
  running: boolean;       // Whether the bridge is published
  bridgeName: string;
  port: number;
  username: string;
  persistPath: string;
  accessoryCount: number; // Current number of bridged accessories
  bind?: string | string[];
}
```

`GET /api/homekit/status` MUST return this status (protected by `/api/*` auth middleware).

### Crypto Polyfill

The system MUST load a crypto polyfill for Bun compatibility before importing `hap-nodejs`, because Bun does not support the `chacha20-poly1305` cipher used by HAP.

### Color Conversion

The factory MUST convert CIE xy color space (used by HomeKit) to hue/saturation (used by Zigbee2MQTT) and vice versa, enabling color light control through the Home app.
