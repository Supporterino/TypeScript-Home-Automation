# HomeKit Bridge

The built-in `HomekitService` runs a [HAP-NodeJS](https://github.com/homebridge/HAP-NodeJS) bridge inside the automation engine. It exposes devices from one or more **accessory sources** — Zigbee2MQTT devices (via the device registry), Shelly devices (via HTTP polling), and boolean `StateManager` keys (as switch toggles) — as HomeKit accessories in real time. No separate Homebridge process required.

The bridge itself is source-agnostic: it owns the HAP bridge lifecycle (publish/unpublish, pairing PIN, port, persist path, the accessory map, the status endpoint) while each source handles its own discovery, freshness, and write-back.

---

## Prerequisites

- **At least one accessory source** must be available:
  - **Zigbee source** requires **`DEVICE_REGISTRY_ENABLED=true`** — it reads devices and their live state from the device registry. When the registry is absent this source is skipped with a warning.
  - **Shelly source** requires a registered `ShellyService`. When no `ShellyService` is provided this source is not created.
  - **State-toggle source** requires at least one entry in the `stateToggles` option. It exposes boolean `StateManager` keys as switches in the Home app.
- If **none** of the sources are available, the bridge logs a warning and skips startup.
- `hap-nodejs` is already bundled as a dependency of `ts-home-automation`. No additional installation is needed.

---

## Registering the service

Pass a `HomekitService` factory to the `services.homekit` field in your entry point.
The factory receives a single **`HomekitServiceContext`** object carrying every
dependency HomeKit may need, so there is no circular reference between the factory
and the `engine` object:

```ts
import { createEngine, HomekitService, HOMEKIT_SERVICE_KEY } from "ts-home-automation";

const engine = createEngine({
  automationsDir: "./src/automations",
  services: {
    [HOMEKIT_SERVICE_KEY]: ({ logger, mqtt, deviceRegistry, shelly, state }) =>
      new HomekitService(mqtt, logger, deviceRegistry, shelly, state, {
        pinCode: "031-45-154",
      }),
  },
});

await engine.start();
```

> **Note:** `HomekitService` uses a dedicated `HomekitServiceFactory` type
> `(ctx: HomekitServiceContext) => HomekitService` instead of the generic
> `ServiceFactory<T>`. The context object contains `http`, `logger`, `mqtt`,
> `deviceRegistry`, `shelly`, and `state`, all resolved by the engine before the
> factory is called.
>
> **Breaking change:** earlier versions used a positional factory
> `(http, logger, mqtt, deviceRegistry) => HomekitService` and a 4-argument
> constructor. The constructor now takes a `shelly: ShellyService | null` and a
> `state: StateManager` handle:
> `new HomekitService(mqtt, logger, deviceRegistry, shelly, state, options)`.

### Bridging Shelly devices

To expose Shelly plugs, switches, and covers, register a `ShellyService` with the
appropriate device `type` and the bridge picks them up automatically:

```ts
import { createEngine, HomekitService, ShellyService } from "ts-home-automation";

const engine = createEngine({
  automationsDir: "./src/automations",
  services: {
    shelly: (http, logger) => {
      const shelly = new ShellyService(http, logger);
      shelly.register("living_room_plug", "192.168.1.50");          // type defaults to "switch"
      shelly.register("kitchen_outlet", "192.168.1.51", "outlet");
      shelly.register("bedroom_blind", "192.168.1.60", "cover");
      return shelly;
    },
    homekit: ({ logger, mqtt, deviceRegistry, shelly }) =>
      new HomekitService(mqtt, logger, deviceRegistry, shelly, {
        pinCode: "031-45-154",
        pollIntervalMs: 10000, // how often Shelly state is refreshed over HTTP
      }),
  },
});
```

Shelly devices are HTTP-only (no MQTT). The bridge keeps their state fresh with a
single global polling loop and routes HomeKit write-back to `ShellyService`
methods (`turnOn`/`turnOff` for switches/outlets, `coverGoToPosition`/`coverStop`
for covers). Because automations register Shelly devices *after* services start,
the bridge reacts to registration events, so devices registered at any time —
including at runtime — are bridged automatically.

### Bridging state toggles

Automations already communicate through the shared `StateManager` (e.g.
`night_mode`, `away_mode` booleans). The `stateToggles` option exposes any boolean
state key as a switch in the Home app, giving automations a human-controllable
interface without writing MQTT or HTTP glue:

```ts
import { createEngine, HomekitService } from "ts-home-automation";

const engine = createEngine({
  automationsDir: "./src/automations",
  services: {
    homekit: ({ logger, mqtt, deviceRegistry, shelly, state }) =>
      new HomekitService(mqtt, logger, deviceRegistry, shelly, state, {
        pinCode: "031-45-154",
        stateToggles: [
          { stateKey: "night_mode", name: "Night Mode" },
          { stateKey: "away_mode", name: "Away Mode" },
        ],
      }),
  },
});
```

State toggles sync bidirectionally:

- **State → Home app:** when an automation calls `state.set("night_mode", true)`
  (or deletes the key), the corresponding switch's `On` characteristic updates
  immediately. A missing key reads as OFF at startup.
- **Home app → state:** flipping the switch writes a real boolean via
  `StateManager.set(stateKey, value)`, which fires `state`-trigger automations.

Each toggle's HomeKit UUID is seeded from its state key, so renaming the display
`name` in configuration does not orphan the accessory in the Home app. Duplicate
state keys are skipped with a warning. When `stateToggles` is empty or omitted,
the state source creates no accessories and does not affect the bridge.

---

## Options

```ts
new HomekitService(mqtt, logger, deviceRegistry, shelly, state, {
  pinCode: "031-45-154",        // required — shown in the Home app when pairing
  bridgeName: "My Home Bridge", // optional, default: "TS-Home-Automation"
  port: 47128,                  // optional, default: 47128
  username: "CC:22:3D:E3:CE:F8",// optional, default: "CC:22:3D:E3:CE:F8"
  persistPath: "./homekit-persist", // optional, default: "./homekit-persist"
  bind: ["net1"],               // optional — restrict mDNS to specific interfaces
  pollIntervalMs: 10000,        // optional, default: 10000 — Shelly poll interval
  stateToggles: [               // optional, default: [] — state keys bridged as switches
    { stateKey: "night_mode", name: "Night Mode" },
  ],
})
```

| Option | Type | Default | Description |
|---|---|---|---|
| `pinCode` | `string` | _(required)_ | HAP pairing PIN in `XXX-XX-XXX` format |
| `bridgeName` | `string` | `"TS-Home-Automation"` | Display name shown in the Apple Home app |
| `port` | `number` | `47128` | TCP port for the HAP server |
| `username` | `string` | `"CC:22:3D:E3:CE:F8"` | Bridge MAC address — must be unique per bridge on your network |
| `persistPath` | `string` | `"./homekit-persist"` | Directory for HAP pairing data; created automatically if missing. Resolved to an absolute path at runtime. |
| `bind` | `string \| string[]` | _(all interfaces)_ | Restrict mDNS advertisement to specific network interfaces or IPs. Interface names (e.g. `"eth0"`) are preferred over IPs because they survive address changes. For containers see below. |
| `pollIntervalMs` | `number` | `10000` | Global interval (ms) for refreshing Shelly device state over HTTP. No effect when no Shelly source is active. |
| `stateToggles` | `StateToggleConfig[]` | `[]` | Boolean `StateManager` keys exposed as switch toggles. Each entry is `{ stateKey, name }`; syncs bidirectionally and fires `state` triggers on write-back. |

---

## Pairing

1. Start the engine — the bridge is announced via mDNS automatically.
2. Open the **Home** app on iPhone/iPad, tap **+** → **Add Accessory** → **More options**.
3. Select the bridge (it will appear as `bridgeName`).
4. Enter the `pinCode` when prompted.
5. All supported devices (Zigbee and Shelly) are exposed as individual accessories inside the bridge.

---

## Supported device types

### Zigbee2MQTT

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

### Shelly

The bridge maps a registered Shelly device's `type` (set via `shelly.register(name, host, type)`) to a HomeKit service:

| Shelly `type` | HomeKit service | Notes |
|---|---|---|
| `"switch"` (default) | Switch | `Switch.GetStatus.output` → `On` |
| `"outlet"` | Outlet | `Switch.GetStatus.output` → `On` |
| `"cover"` | Window Covering | Position + direction from `Cover.GetStatus` |

For covers, `current_pos` maps to `CurrentPosition` (0 = closed, 100 = open) and `state` maps to `PositionState` (`opening` → increasing, `closing` → decreasing, otherwise stopped). An **uncalibrated** cover (`current_pos: null`) is still exposed but reports position `0` and logs a calibration warning.

### State toggles

Each entry in `stateToggles` maps to a HomeKit switch:

| `stateToggles` entry | HomeKit service |
|---|---|
| `{ stateKey, name }` | Switch — `On` mirrors the state key's value bidirectionally |

---

## Dynamic accessories

The bridge reacts to source events at runtime:

- **Zigbee device joined** — a new accessory is created and added to the bridge immediately.
- **Zigbee device left** — the accessory is removed from the bridge.
- **Zigbee state change** — the accessory's characteristics are updated in real time so the Home app always shows the current state.
- **Shelly device registered** — an accessory is created as soon as `shelly.register(...)` is called, even after the bridge has started.
- **Shelly state refresh** — a global HTTP polling loop (`pollIntervalMs`) refreshes each Shelly accessory so physical button/switch presses appear in the Home app within one interval. A device that is unreachable during a poll tick is skipped without aborting the tick for other devices.
- **State key change / delete** — the corresponding toggle's `On` characteristic updates immediately when `state.set(...)` or `state.delete(...)` runs.
- **State toggle flipped** — HomeKit write-back calls `StateManager.set(stateKey, boolean)`, firing `state`-trigger automations.

---

## Multiple bridges

If you run multiple engine instances on the same network, each bridge **must** have a unique `username` (MAC address) and `port`:

```ts
// Instance A
new HomekitService(mqtt, logger, registry, shelly, state, {
  pinCode: "031-45-154",
  username: "CC:22:3D:E3:CE:F8",
  port: 47128,
});

// Instance B — different username and port
new HomekitService(mqtt, logger, registry, shelly, state, {
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

## Running in Docker / Kubernetes

### Container networking & mDNS discovery

`hap-nodejs` advertises the bridge via **mDNS (Bonjour) multicast** so Apple devices can
discover it on the local network.  Docker bridge networks and Kubernetes pod network
namespaces **isolate multicast traffic** — the bridge starts and runs correctly, but
Apple Home cannot discover it.

Three options ranked by simplicity:

#### 1. Host networking (simplest)

| Platform | Fix |
|---|---|
| **Docker Compose** | `network_mode: host` on the service (see `docker-compose.yml`) |
| **Kubernetes** | `hostNetwork: true` in the pod spec (see `docs/deployment.md`) |

When using host networking:
- Docker: remove `networks` / `depends_on` blocks (they conflict with host mode) and
  use `localhost` or host IPs for service references.
- Kubernetes: `MQTT_HOST` must be an IP or hostname reachable from the host network,
  not a cluster-internal service DNS name.

#### 2. Multus CNI + macvlan + bind (Kubernetes, no hostNetwork)

Attach a secondary network interface with a LAN IP to the pod using
[Multus CNI](https://github.com/k8snetworkplumbingwg/multus-cni) and a macvlan
attachment.  Then use the `bind` option to advertise mDNS only on that interface:

```yaml
# NetworkAttachmentDefinition (applied once per namespace)
apiVersion: k8s.cni.cncf.io/v1
kind: NetworkAttachmentDefinition
metadata:
  name: lan-macvlan
spec:
  config: |
    {
      "cniVersion": "0.3.1",
      "type": "macvlan",
      "master": "eth0",
      "mode": "bridge",
      "ipam": {
        "type": "host-local",
        "subnet": "192.168.1.0/24",
        "rangeStart": "192.168.1.200",
        "rangeEnd": "192.168.1.210"
      }
    }
```

```yaml
# Pod (from docs/deployment.md) — add the annotation and bind option:
apiVersion: v1
kind: Pod
metadata:
  name: home-automation
  annotations:
    k8s.v1.cni.cncf.io/networks: lan-macvlan
spec:
  # hostNetwork: true  ← NOT needed with Multus
  containers:
    - name: engine
      env:
        - name: HOMEKIT_BIND
          value: net1   # the macvlan interface (first attachment = net1)
```

```ts
// Pass the bind value from the environment into HomekitServiceOptions:
bind: process.env.HOMEKIT_BIND?.split(",") ?? undefined,
```

The pod keeps its cluster network (eth0) for MQTT and HTTP while mDNS goes out the
macvlan interface (net1) directly onto the LAN.  Apple devices discover the bridge
at the macvlan IP.

#### 3. mDNS repeater (any environment)

If neither host networking nor Multus is available, run an mDNS repeater/proxy (e.g.
[avahi-reflector](https://man.archlinux.org/man/avahi-daemon.conf.5) in
reflection mode) to forward multicast between the container network and the host
network.  This approach is more complex and not covered here.

### Pairing data persistence

`hap-nodejs` uses `node-persist` for storage, and older versions of `node-persist` resolve relative paths against their own `__dirname` inside `node_modules` rather than `process.cwd()`. In a container this often points to a read-only layer, causing an `EACCES: permission denied` crash.

`HomekitService` resolves the configured `persistPath` to an **absolute path** before handing it to `hap-nodejs`, so `./homekit-persist` becomes `/app/homekit-persist` instead of `/app/node_modules/node-persist/src/storage/homekit-persist`.

For production deployments it is recommended to mount a dedicated volume and use an absolute path explicitly:

```ts
new HomekitService(mqtt, logger, registry, shelly, state, {
  pinCode: "031-45-154",
  persistPath: "/data/homekit-persist",
});
```

Make sure the container user has write access to that directory.

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
