# TypeScript Home Automation

A lightweight, TypeScript-based home automation framework built on MQTT. Designed to replace Home Assistant automations with fully typed, testable logic that runs as a standalone service alongside [Zigbee2MQTT](https://www.zigbee2mqtt.io/).

Each automation is a single TypeScript class. No YAML, no UI — just code.

Can be used in two ways:

1. **As a package** — install `ts-home-automation` in your own project and write automations there
2. **Standalone** — clone this repo, write automations in `src/automations/`, and run directly

## Architecture

```
┌──────────────────────────────────────────────────┐
│              Automation Engine                   │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Motion   │  │ Schedule │  │  Door    │  ...  │
│  │ Light    │  │ Report   │  │  Alert   │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │              │              │            │
│  ┌────▼──────────────▼──────────────▼────┐       │
│  │         AutomationManager             │       │
│  └────┬──────────────┬──────────────┬────┘       │
│       │              │              │            │
│  ┌────▼────┐   ┌─────▼─────┐  ┌────▼────┐       │
│  │  MQTT   │   │   Cron    │  │  HTTP   │       │
│  │ Service │   │ Scheduler │  │ Client  │       │
│  └────┬────┘   └───────────┘  └─────────┘       │
└───────┼──────────────────────────────────────────┘
        │
   ┌────▼──────┐      ┌───────────────┐
   │ Mosquitto │◄────►│ Zigbee2MQTT   │
   │  Broker   │      │ zigbee2mqtt/# │
   └───────────┘      └───────────────┘
```

## Prerequisites

- [Bun](https://bun.sh/) (runtime and package manager)
- An MQTT broker (e.g. [Mosquitto](https://mosquitto.org/))
- [Zigbee2MQTT](https://www.zigbee2mqtt.io/) connected to the same broker

---

## Usage as a Package

Install the framework in your own project:

```bash
bun add ts-home-automation
```

Create your project structure:

```
my-home/
├── package.json
├── tsconfig.json
├── .env
├── src/
│   ├── index.ts
│   └── automations/
│       ├── motion-light.ts
│       └── night-mode.ts
```

### Entry point (`src/index.ts`)

```ts
import { createEngine } from "ts-home-automation";

const engine = createEngine({
  automationsDir: new URL("./automations", import.meta.url).pathname,
});

// Graceful shutdown
process.on("SIGINT", async () => {
  await engine.stop();
  process.exit(0);
});

await engine.start();
```

### Writing automations

```ts
import {
  Automation,
  type Trigger,
  type TriggerContext,
  type OccupancyPayload,
} from "ts-home-automation";

export default class MotionLight extends Automation {
  readonly name = "motion-light";

  readonly triggers: Trigger[] = [
    {
      type: "mqtt",
      topic: "zigbee2mqtt/hallway_sensor",
      filter: (p) => (p as OccupancyPayload).occupancy === true,
    },
  ];

  async execute(context: TriggerContext): Promise<void> {
    this.mqtt.publishToDevice("hallway_light", { state: "ON", brightness: 254 });
  }
}
```

### Engine options

```ts
const engine = createEngine({
  // Required: path to your automations directory
  automationsDir: "./src/automations",

  // Optional: override environment-based config
  config: {
    mqtt: { host: "192.168.1.10", port: 1883 },
    zigbee2mqttPrefix: "zigbee2mqtt",
    logLevel: "debug",
  },

  // Optional: provide your own pino logger
  logger: myCustomLogger,
});
```

### Publishing your own Docker image

In your consumer project, create a `Dockerfile`:

```dockerfile
FROM oven/bun:1
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src
COPY tsconfig.json ./

CMD ["bun", "run", "src/index.ts"]
```

---

## Standalone Usage

Clone this repo and work directly in it:

```bash
git clone https://github.com/Supporterino/TypeScript-Home-Automation.git
cd TypeScript-Home-Automation

bun install
cp .env.example .env

# Run in development mode (hot-reload)
bun run dev

# Run in production mode
bun run start
```

Write automations in `src/automations/` — they are auto-discovered on startup.

### Standalone project structure

```
src/
├── index.ts                   # Package entry point (re-exports public API)
├── standalone.ts              # Standalone runner (used by `bun run dev/start`)
├── config.ts                  # Zod-validated environment config
├── core/
│   ├── engine.ts              # createEngine() factory
│   ├── automation.ts          # Abstract Automation base class
│   ├── automation-manager.ts  # Auto-discovery and lifecycle management
│   ├── mqtt-service.ts        # MQTT client wrapper
│   ├── cron-scheduler.ts      # Cron job scheduling
│   └── http-client.ts         # HTTP client with logging
├── automations/               # Your automations go here (auto-discovered)
│   ├── motion-light.ts        # Example: motion → light on
│   └── scheduled-report.ts    # Example: daily cron → HTTP fetch
└── types/
    └── zigbee.ts              # Zigbee2MQTT payload type definitions
```

### Docker (standalone)

```bash
bun run docker:build
bun run docker:up      # starts engine + Mosquitto via docker-compose
bun run docker:down
```

---

## Configuration

Set these environment variables (or use a `.env` file):

| Variable | Default | Description |
|---|---|---|
| `MQTT_HOST` | `localhost` | Mosquitto broker hostname |
| `MQTT_PORT` | `1883` | Mosquitto broker port |
| `ZIGBEE2MQTT_PREFIX` | `zigbee2mqtt` | Zigbee2MQTT MQTT topic prefix |
| `LOG_LEVEL` | `info` | Log level (`fatal`, `error`, `warn`, `info`, `debug`, `trace`) |
| `STATE_PERSIST` | `false` | Persist state to disk on shutdown (`true`/`false`) |
| `STATE_FILE_PATH` | `./state.json` | Path to the state persistence file |
| `HEALTH_PORT` | `0` (disabled) | Port for health probe HTTP server (set to `8080` to enable) |

## Writing an Automation

Every automation extends the `Automation` base class and defines three things:

1. **`name`** — a unique identifier (used in logs)
2. **`triggers`** — what causes it to run (MQTT messages and/or cron schedules)
3. **`execute(context)`** — the logic to run when triggered

### Trigger Types

**MQTT trigger** — reacts to device messages from Zigbee2MQTT:

```ts
{
  type: "mqtt",
  topic: "zigbee2mqtt/motion_sensor",     // Use your device's friendly name
  filter: (payload) => payload.occupancy === true,  // Optional payload filter
}
```

Topics support MQTT wildcards: `+` matches one level, `#` matches all remaining levels.

**Cron trigger** — runs on a schedule:

```ts
{
  type: "cron",
  expression: "0 7 * * *",  // Every day at 7:00 AM
}
```

**State trigger** — reacts to shared state changes (set by any automation):

```ts
{
  type: "state",
  key: "night_mode",
  filter: (newValue) => newValue === true,  // Optional filter
}
```

### Multiple Triggers

An automation can have multiple triggers. The `context` parameter tells you which one fired:

```ts
readonly triggers: Trigger[] = [
  { type: "mqtt", topic: "zigbee2mqtt/sensor_a" },
  { type: "mqtt", topic: "zigbee2mqtt/sensor_b" },
  { type: "cron", expression: "*/5 * * * *" },
];

async execute(context: TriggerContext): Promise<void> {
  if (context.type === "mqtt") {
    this.logger.info(`Triggered by ${context.topic}`);
  } else if (context.type === "cron") {
    this.logger.info("Triggered by cron schedule");
  } else if (context.type === "state") {
    this.logger.info(`State "${context.key}" changed to ${context.newValue}`);
  }
}
```

### Available Services

Inside `execute()` (and `onStart`/`onStop`), the following are available:

| Service | Description |
|---|---|
| `this.mqtt.publishToDevice(name, payload)` | Send a command to a Zigbee2MQTT device (publishes to `zigbee2mqtt/<name>/set`) |
| `this.mqtt.publish(topic, payload)` | Publish to any MQTT topic |
| `this.shelly.turnOn(name)` | Turn a Shelly plug/switch on |
| `this.shelly.turnOff(name)` | Turn a Shelly plug/switch off |
| `this.shelly.toggle(name)` | Toggle a Shelly plug/switch |
| `this.shelly.getStatus(name)` | Get Shelly switch status (power, voltage, etc.) |
| `this.shelly.isOn(name)` | Check if a Shelly switch is on |
| `this.shelly.getPower(name)` | Get current power draw in Watts |
| `this.notify({ title, message, ... })` | Send a push notification (requires notification service) |
| `this.state.get<T>(key, default?)` | Get a value from shared state |
| `this.state.set<T>(key, value)` | Set a value in shared state (fires state triggers) |
| `this.state.delete(key)` | Delete a key from shared state |
| `this.state.has(key)` | Check if a key exists |
| `this.http.get(url)` | HTTP GET request |
| `this.http.post(url, body)` | HTTP POST request |
| `this.http.put(url, body)` | HTTP PUT request |
| `this.http.request(url, options)` | HTTP request with full control |
| `this.logger` | Structured pino logger scoped to this automation |
| `this.config` | Application configuration |

### Lifecycle Hooks

Override `onStart()` or `onStop()` for setup/teardown logic:

```ts
async onStart(): Promise<void> {
  // Called when the automation is registered (e.g. initialize state)
}

async onStop(): Promise<void> {
  // Called on shutdown (e.g. clear timers)
}
```

## Shelly Devices

The framework includes a built-in `ShellyService` for controlling Shelly Gen 2 devices (like the Plus Plug S) over their local HTTP RPC API. No cloud required.

### Registering devices

Register Shelly devices in your automation's `onStart` hook or in your entry point:

```ts
// In your entry point (before engine.start()):
const engine = createEngine({ automationsDir: "..." });
engine.shelly.registerMany({
  "living_room_plug": "192.168.1.50",
  "tv_plug": "192.168.1.51",
  "desk_lamp": "192.168.1.52",
});
await engine.start();
```

### Using in automations

```ts
export default class TvAutoOff extends Automation {
  readonly name = "tv-auto-off";

  readonly triggers: Trigger[] = [
    { type: "cron", expression: "0 23 * * *" },  // Every night at 11 PM
  ];

  async execute(): Promise<void> {
    const status = await this.shelly.getStatus("tv_plug");

    if (status.output && status.apower < 5) {
      this.logger.info("TV appears idle, turning off plug");
      await this.shelly.turnOff("tv_plug");
    }
  }
}
```

### Available methods

| Method | Description |
|---|---|
| `shelly.register(name, host)` | Register a device by name and IP |
| `shelly.registerMany(devices)` | Register multiple devices at once |
| `shelly.turnOn(name, toggleAfter?)` | Turn on (optional auto-off timer in seconds) |
| `shelly.turnOff(name, toggleAfter?)` | Turn off (optional auto-on timer in seconds) |
| `shelly.toggle(name)` | Toggle the switch |
| `shelly.getStatus(name)` | Get full status (power, voltage, current, energy, temperature) |
| `shelly.getConfig(name)` | Get switch configuration |
| `shelly.getDeviceInfo(name)` | Get device identification (model, firmware, MAC) |
| `shelly.getSysStatus(name)` | Get system status (uptime, RAM, updates) |
| `shelly.isOn(name)` | Check if the switch is currently on |
| `shelly.getPower(name)` | Get current power consumption in Watts |
| `shelly.reboot(name, delayMs?)` | Reboot the device |

### Typed status response

The `getStatus()` method returns a `ShellySwitchStatus` with full power metering:

```ts
const status = await this.shelly.getStatus("living_room_plug");
// status.output      — boolean (on/off)
// status.apower      — active power in Watts
// status.voltage     — voltage in Volts
// status.current     — current in Amps
// status.aenergy     — { total: Wh, by_minute: mWh[], minute_ts: unix }
// status.temperature — { tC: number, tF: number }
```

## Notifications

The engine supports an optional notification service for sending push notifications from automations. The `NotificationService` interface is abstract — implement it for any provider.

### Built-in: ntfy.sh

```ts
import { createEngine, NtfyNotificationService } from "ts-home-automation";

const engine = createEngine({
  automationsDir: "...",
  notifications: new NtfyNotificationService({
    topic: "my-home-alerts",
    // url: "https://ntfy.example.com",  // optional, defaults to ntfy.sh
    // token: "tk_...",                   // optional, for auth
  }),
});
```

### Using in automations

```ts
await this.notify({
  title: "Front door opened",
  message: "Front door was opened while nobody is home",
  priority: "urgent",
  tags: ["warning", "door"],
});
```

If no notification service is configured, `this.notify()` logs a warning and does nothing.

### Custom notification service

Implement the `NotificationService` interface to integrate any provider:

```ts
import type { NotificationService, NotificationOptions } from "ts-home-automation";

class TelegramNotificationService implements NotificationService {
  async send(options: NotificationOptions): Promise<void> {
    // Send via Telegram Bot API
  }
}

const engine = createEngine({
  automationsDir: "...",
  notifications: new TelegramNotificationService(),
});
```

## State Management

The engine includes a shared state manager for persisting values across automations and engine restarts. Any automation can read/write state, and other automations can react to changes via `state` triggers.

### Setup

```ts
const engine = createEngine({
  automationsDir: "...",
  state: {
    persist: true,                    // Save state to disk on shutdown
    filePath: "./data/state.json",    // Optional, defaults to ./state.json
  },
});
```

State is always available in-memory. The `persist` flag controls whether it's saved to and restored from a JSON file.

### Using in automations

```ts
// Set state (fires state triggers in other automations)
this.state.set<boolean>("night_mode", true);
this.state.set<number>("motion_count", 42);
this.state.set("last_motion", { room: "hallway", time: Date.now() });

// Get state (typed with generics)
const isNight = this.state.get<boolean>("night_mode", false);
const count = this.state.get<number>("motion_count", 0);

// Check and delete
if (this.state.has("temporary_flag")) {
  this.state.delete("temporary_flag");
}
```

### Reacting to state changes

Use the `state` trigger type to run an automation when a key changes:

```ts
export default class NightModeReaction extends Automation {
  readonly name = "night-mode-reaction";

  readonly triggers: Trigger[] = [
    {
      type: "state",
      key: "night_mode",
      filter: (newValue) => newValue === true,
    },
  ];

  async execute(context: TriggerContext): Promise<void> {
    if (context.type !== "state") return;
    this.logger.info("Night mode activated, dimming all lights");
    // ...
  }
}
```

This enables cross-automation communication: one automation sets `night_mode`, and any number of other automations react to it.

## Device Types

The framework provides typed payloads organized in three layers:

1. **Generic types** — work across any brand (e.g. `DimmableLightPayload`, `OccupancyPayload`, `ButtonPayload`)
2. **Brand-specific types** — narrowed types with exact fields and action values per manufacturer
3. **Common primitives** — shared enums and color types (`DeviceState`, `ColorXY`, `PowerOnBehavior`)

Use generic types when writing automations that should work with any device in a category. Use brand-specific types when you need exact typing for a particular model.

### Generic types

| Type | Category | Description |
|---|---|---|
| `DimmableLightPayload` / `DimmableLightSetCommand` | Lights | Any dimmable bulb |
| `WhiteSpectrumLightPayload` / `WhiteSpectrumLightSetCommand` | Lights | Any color-temperature bulb |
| `ColorLightPayload` / `ColorLightSetCommand` | Lights | Any RGB/color bulb |
| `LightPayload` / `LightSetCommand` | Lights | Catch-all for any light |
| `OccupancyPayload` | Sensors | Any motion/occupancy sensor |
| `TemperatureHumidityPayload` | Sensors | Any temp/humidity sensor |
| `ContactPayload` | Sensors | Any door/window contact sensor |
| `WaterLeakPayload` | Sensors | Any water leak sensor |
| `AirQualitySensorPayload` | Sensors | Any air quality sensor |
| `AirPurifierPayload` | Appliances | Any air purifier |
| `ButtonPayload` | Remotes | Any button/remote (`action: string`) |
| `PlugPayload` / `SwitchSetCommand` | Plugs | Any smart plug/switch |

### Brand-specific types

**Philips Hue:**

| Type | Devices |
|---|---|
| `PhilipsDimmableLightSetCommand` | LWG004, 9290030514, 929002241201, 8718699673147 |
| `PhilipsWhiteSpectrumLightSetCommand` | 8719514301481 |
| `PhilipsColorLightSetCommand` | 9290022166, 8718699703424 |
| `PhilipsHueMotionSensorPayload` / `PhilipsHueMotionSensorSetCommand` | 9290012607, 9290030675 |

**IKEA:**

| Type | Devices |
|---|---|
| `IkeaDimmableLightSetCommand` | LED2102G3, ICPSHC24 |
| `IkeaWhiteSpectrumLightSetCommand` | LED2005R5/LED2106R3 |
| `IkeaStarkvindPayload` / `IkeaStarkvindSetCommand` | E2007 (STARKVIND air purifier) |
| `IkeaVindstyrkaPayload` | E2112 (VINDSTYRKA air quality sensor) |
| `IkeaStyrbarPayload` / `IkeaStyrbarAction` | E2001/E2002/E2313 (STYRBAR remote) |
| `IkeaShortcutButtonPayload` / `IkeaShortcutButtonAction` | E1812 (shortcut button) |
| `IkeaRodretPayload` / `IkeaRodretAction` | E2201 (RODRET dimmer) |

**Aqara:**

| Type | Devices |
|---|---|
| `AqaraRemoteSwitchH1Payload` / `AqaraRemoteSwitchH1SetCommand` | WXKG15LM/WRS-R02 (double rocker) |
| `AqaraWaterLeakPayload` | SJCGQ11LM (water leak sensor) |
| `AqaraTemperatureHumidityPayload` | WSDCGQ11LM (temp/humidity/pressure) |

### Example: generic vs brand-specific

```ts
// Generic — works with any motion sensor
import type { OccupancyPayload } from "ts-home-automation";

// Brand-specific — includes Philips-specific fields like motion_sensitivity
import type { PhilipsHueMotionSensorPayload } from "ts-home-automation";

// Generic — works with any remote (action is a plain string)
import type { ButtonPayload } from "ts-home-automation";

// Brand-specific — action is a typed union of exact STYRBAR values
import type { IkeaStyrbarPayload } from "ts-home-automation";
```

## Health Probes

The engine includes an optional HTTP health server for container deployments (Docker, Kubernetes). Enable it by setting the `HEALTH_PORT` environment variable.

```bash
HEALTH_PORT=8080
```

### Endpoints

| Endpoint | Purpose | Success | Failure |
|---|---|---|---|
| `GET /healthz` | Liveness — is the process alive? | `200` always | Process is dead |
| `GET /readyz` | Readiness — is the engine ready? | `200` when all checks pass | `503` with failed checks |

### Readiness checks

The `/readyz` endpoint verifies:

- **`mqtt`** — MQTT client is connected to the broker
- **`engine`** — the engine has completed startup

Response body:

```json
{
  "status": "ready",
  "checks": { "mqtt": true, "engine": true }
}
```

### Kubernetes example

```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 10
readinessProbe:
  httpGet:
    path: /readyz
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 5
```

### Docker Compose

The included `docker-compose.yml` configures a healthcheck automatically when `HEALTH_PORT` is set.

## Building the Package

To build the distributable package (compiled JS + type declarations):

```bash
bun run build
```

This outputs to `dist/` using `tsconfig.build.json`. The build excludes `standalone.ts` and the example automations — only the framework core is included.

To publish:

```bash
npm publish
```

The `prepublishOnly` script runs the build automatically before publishing.

## Scripts

| Command | Description |
|---|---|
| `bun run dev` | Development with hot-reload (standalone mode) |
| `bun run start` | Production run (standalone mode) |
| `bun run build` | Build package (JS + declarations to `dist/`) |
| `bun run typecheck` | TypeScript type checking |
| `bun run docker:build` | Build Docker image |
| `bun run docker:up` | Start via Docker Compose |
| `bun run docker:down` | Stop Docker Compose |

## License

[GPL-3.0](LICENSE)
