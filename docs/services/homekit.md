# HomeKit Bridge

The built-in `HomekitService` runs a [HAP-NodeJS](https://github.com/homebridge/HAP-NodeJS) bridge inside the automation engine. It translates every Zigbee2MQTT device tracked by the device registry into a HomeKit accessory in real time — no separate Homebridge process required.

---

## Prerequisites

- **`DEVICE_REGISTRY_ENABLED=true`** — the service reads devices and their live state from the device registry. If the registry is not available the bridge skips startup and logs a warning.
- `hap-nodejs` is already bundled as a dependency of `ts-home-automation`. No additional installation is needed.

---

## Registering the service

Pass a `HomekitService` instance (or factory) to the `services.homekit` field in your entry point:

```ts
import { createEngine, HomekitService, HOMEKIT_SERVICE_KEY } from "ts-home-automation";

const engine = createEngine({
  automationsDir: "./src/automations",
  services: {
    [HOMEKIT_SERVICE_KEY]: (_http, logger) =>
      new HomekitService(engine.mqtt, logger, engine.deviceRegistry, {
        pinCode: "031-45-154",
      }),
  },
});

await engine.start();
```

> **Important:** the service needs `engine.mqtt` and `engine.deviceRegistry`. Access them via the `engine` object returned by `createEngine()` — both are available immediately after calling `createEngine()`, before `start()`.

---

## Options

```ts
new HomekitService(mqtt, logger, deviceRegistry, {
  pinCode: "031-45-154",        // required — shown in the Home app when pairing
  bridgeName: "My Home Bridge", // optional, default: "TS-Home-Automation"
  port: 47128,                  // optional, default: 47128
  username: "CC:22:3D:E3:CE:F8",// optional, default: "CC:22:3D:E3:CE:F8"
  persistPath: "./homekit-persist", // optional, default: "./homekit-persist"
})
```

| Option | Type | Default | Description |
|---|---|---|---|
| `pinCode` | `string` | _(required)_ | HAP pairing PIN in `XXX-XX-XXX` format |
| `bridgeName` | `string` | `"TS-Home-Automation"` | Display name shown in the Apple Home app |
| `port` | `number` | `47128` | TCP port for the HAP server |
| `username` | `string` | `"CC:22:3D:E3:CE:F8"` | Bridge MAC address — must be unique per bridge on your network |
| `persistPath` | `string` | `"./homekit-persist"` | Directory for HAP pairing data; created automatically if missing |

---

## Pairing

1. Start the engine — the bridge is announced via mDNS automatically.
2. Open the **Home** app on iPhone/iPad, tap **+** → **Add Accessory** → **More options**.
3. Select the bridge (it will appear as `bridgeName`).
4. Enter the `pinCode` when prompted.
5. All supported Zigbee devices are exposed as individual accessories inside the bridge.

---

## Supported device types

The bridge maps Zigbee2MQTT device capabilities to HomeKit services automatically:

| Zigbee capability | HomeKit service |
|---|---|
| On/off + brightness | Lightbulb (dimmable) |
| On/off + brightness + color temperature | Lightbulb (white spectrum) |
| On/off + brightness + color (XY or HS) | Lightbulb (full color) |
| On/off only (no brightness) | Switch / Outlet |
| `occupancy` | Motion Sensor |
| `contact` | Contact Sensor |
| `water_leak` | Leak Sensor |
| `temperature` | Temperature Sensor |
| `humidity` | Humidity Sensor |
| `battery` | Battery level (added to any sensor above) |

Devices that expose none of the above capabilities are silently skipped.

---

## Dynamic accessories

The bridge reacts to device registry events at runtime:

- **Device joined** — a new accessory is created and added to the bridge immediately.
- **Device left** — the accessory is removed from the bridge.
- **State change** — the accessory's characteristics are updated in real time so the Home app always shows the current state.

---

## Multiple bridges

If you run multiple engine instances on the same network, each bridge **must** have a unique `username` (MAC address) and `port`:

```ts
// Instance A
new HomekitService(mqtt, logger, registry, {
  pinCode: "031-45-154",
  username: "CC:22:3D:E3:CE:F8",
  port: 47128,
});

// Instance B — different username and port
new HomekitService(mqtt, logger, registry, {
  pinCode: "031-45-155",
  username: "DD:33:4E:F4:DF:A9",
  port: 47129,
});
```

---

## Status API

The service registers a route on the shared HTTP server:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/homekit/status` | Returns the current bridge status snapshot |

Example response:

```json
{
  "running": true,
  "bridgeName": "My Home Bridge",
  "port": 47128,
  "username": "CC:22:3D:E3:CE:F8",
  "persistPath": "./homekit-persist",
  "accessoryCount": 12
}
```

This endpoint is protected by the same `HTTP_TOKEN` bearer auth as all other `/api/*` routes.

---

## CLI dashboard

The interactive `ts-ha dashboard` includes a dedicated **HomeKit** tab (key `6`) showing:

- Bridge running/stopped status
- Number of registered accessories
- Full configuration (bridge name, HAP port, MAC address, pairing PIN, persist path)

When the service is not configured the tab displays a setup hint. The Overview tab (key `1`) also shows a **HomeKit: running / stopped** badge whenever the service is present.

---

## Web UI

The browser dashboard includes a **HomeKit** page in the navigation sidebar. It shows:

- Status cards: bridge running state, accessory count, HAP port, paired/offline badge
- A configuration panel with all bridge settings

When the service is not configured an informational notice is shown explaining how to register it.
