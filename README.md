# TypeScript Home Automation

A lightweight, TypeScript-based home automation framework built on MQTT. Designed to replace Home Assistant automations with fully typed, testable logic that runs as a standalone service alongside [Zigbee2MQTT](https://www.zigbee2mqtt.io/).

Each automation is a single TypeScript class. No YAML, no UI — just code.

Can be used in two ways:

1. **As a package** — install `ts-home-automation` in your own project and write automations there
2. **Standalone** — clone this repo, write automations in `src/automations/`, and run directly

## Table of Contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Usage as a Package](#usage-as-a-package)
- [Standalone Usage](#standalone-usage)
- [Configuration](#configuration)
- [Writing an Automation](#writing-an-automation)
- [Device-Specific Base Classes](#device-specific-base-classes)
- [Shelly Devices](#shelly-devices)
- [Nanoleaf Devices](#nanoleaf-devices)
- [Weather](#weather)
- [Notifications](#notifications)
- [State Management](#state-management)
- [Device Types](#device-types)
- [Health Probes](#health-probes)
- [CLI Tool](#cli-tool)
  - [Automations](#automations)
  - [Trigger Command](#trigger-command)
  - [Logs](#logs)
  - [State Management (CLI)](#state-management-1)
  - [Dashboard](#dashboard)
  - [Saved Targets](#saved-targets)
  - [Authentication](#authentication)
- [Building the Package](#building-the-package)
- [Docker](#docker-standalone)
- [Scripts](#scripts)
- [License](#license)

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Automation Engine                        │
│                                                              │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐  ┌──────────┐    │
│  │ Motion   │   │ Temp     │   │ Remote   │  │ Schedule │ .. │
│  │ Light    │   │ Alert    │   │ Control  │  │ Report   │    │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘  └─────┬────┘    │
│       │              │              │              │         │
│  ┌────▼──────────────▼──────────────▼──────────────▼────┐    │
│  │                AutomationManager                     │    │
│  └──┬─────────┬──────────┬──────────┬─────────┬─────┬───┘    │
│     │         │          │          │         │     │        │
│  ┌──▼──┐ ┌──▼──┐ ┌──▼──┐ ┌──▼───┐ ┌───▼───┐ ┌──▼──┐ ┌▼────┐ ┌▼──────┐ │
│  │MQTT │ │Cron │ │HTTP │ │Shelly│ │Nanolef│ │State│ │Notfy│ │Weather│ │
│  └──┬──┘ └─────┘ └─────┘ └──────┘ └───────┘ └─────┘ └─────┘ └───────┘ │
│     │                                                        │
│  ┌──▼─────────────┐                                          │
│  │ HTTP Server    │  (/healthz, /readyz, /webhook/*)         │
│  └────────────────┘                                          │
└──────┬───────────────────────────────────────────────────────┘
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
│       └── alarm.ts
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
├── index.ts                          # Package entry point (re-exports public API)
├── standalone.ts                     # Standalone runner (used by `bun run dev/start`)
├── config.ts                         # Zod-validated environment config
├── core/
│   ├── engine.ts                     # createEngine() factory
│   ├── automation.ts                 # Abstract Automation base class
│   ├── automation-manager.ts         # Auto-discovery and lifecycle management
│   ├── mqtt-service.ts               # MQTT client wrapper
│   ├── cron-scheduler.ts             # Cron job scheduling
│   ├── http-client.ts                # HTTP client with logging
│   ├── shelly-service.ts             # Shelly Gen 2 device control
│   ├── state-manager.ts              # Shared state with persistence
│   ├── aqara-h1-automation.ts         # Aqara H1 remote base class
│   ├── ikea-styrbar-automation.ts    # IKEA STYRBAR remote base class
│   ├── ikea-rodret-automation.ts     # IKEA RODRET dimmer base class
│   ├── notification-service.ts       # NotificationService interface
│   ├── nanoleaf-service.ts            # Nanoleaf light panel control
│   ├── notification-service.ts       # NotificationService interface
│   ├── ntfy-notification-service.ts  # ntfy.sh notification implementation
│   ├── open-meteo-service.ts         # Open-Meteo weather service
│   ├── openweathermap-service.ts     # OpenWeatherMap weather service
│   ├── mqtt-utils.ts                 # MQTT topic wildcard matching utility
│   ├── http-server.ts                # HTTP server (health, webhooks, debug API)
│   └── log-buffer.ts                 # In-memory ring buffer for log queries
├── cli/
│   ├── index.ts                      # CLI entry point (arg parsing, command dispatch)
│   ├── client.ts                     # Debug API HTTP client
│   ├── config.ts                     # Saved targets (~/.config/ts-ha/config.json)
│   ├── format.ts                     # Output formatting utilities
│   ├── commands/
│   │   ├── automations.ts            # automations list/get/trigger commands
│   │   ├── config.ts                 # config list/add/use/remove commands
│   │   ├── dashboard.tsx             # Interactive OpenTUI dashboard
│   │   ├── logs.ts                   # logs command (with --follow)
│   │   ├── nanoleaf.ts               # nanoleaf pair command
│   │   └── state.ts                  # state list/get/set/delete commands
│   └── components/                   # OpenTUI React components for dashboard
│       ├── automations-tab.tsx       # Automations tab (expand, trigger)
│       ├── help-modal.tsx            # Keyboard shortcuts overlay
│       ├── logs-tab.tsx              # Scrollable log viewer
│       ├── overview-tab.tsx          # Overview tab (status summary)
│       ├── state-tab.tsx             # State tab (inline editing)
│       ├── status-footer.tsx         # Animated status bar
│       ├── theme.ts                  # Dracula color palette
│       └── types.ts                  # Shared dashboard data types
├── automations/                      # Your automations go here (auto-discovered)
│   ├── aqara-h1-remote.ts            # Example: H1 remote → lamp + Shelly plug
│   ├── contact-sensor-alarm.ts       # Example: door sensor → alarm notification
│   ├── motion-light-disableable.ts   # Example: motion light with enable/disable state
│   ├── motion-light-schedule.ts      # Example: multi-sensor motion with time windows
│   ├── motion-light-state.ts         # Example: state-driven lamp profile selection
│   ├── scheduled-report.ts           # Example: daily cron → HTTP fetch
│   ├── shortcut-button-flash.ts      # Example: button → colored light flash
│   ├── shortcut-button-timer.ts      # Example: button → timed state toggle
│   ├── temperature-alert.ts          # Example: temp/humidity → notification
│   └── water-leak-alert.ts           # Example: water leak → urgent notification
└── types/
    ├── zigbee.ts                     # Zigbee2MQTT payload type definitions
    ├── shelly.ts                     # Shelly Gen 2 API type definitions
    ├── nanoleaf.ts                   # Nanoleaf API type definitions
    └── weather.ts                    # Generic weather service types
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
| `TZ` | system default | Timezone for cron schedules (e.g. `Europe/Berlin`) |
| `MQTT_HOST` | `localhost` | Mosquitto broker hostname |
| `MQTT_PORT` | `1883` | Mosquitto broker port |
| `ZIGBEE2MQTT_PREFIX` | `zigbee2mqtt` | Zigbee2MQTT MQTT topic prefix |
| `LOG_LEVEL` | `info` | Log level (`fatal`, `error`, `warn`, `info`, `debug`, `trace`) |
| `STATE_PERSIST` | `false` | Persist state to disk on shutdown (`true`/`false`) |
| `STATE_FILE_PATH` | `./state.json` | Path to the state persistence file |
| `AUTOMATIONS_RECURSIVE` | `false` | Scan subdirectories recursively for automation files |
| `HTTP_PORT` | `8080` | Port for HTTP server (health probes + webhooks). Set to `0` to disable. |
| `HTTP_TOKEN` | | Bearer token for debug/webhook endpoints. Empty = no auth. |

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

**Webhook trigger** — fires when an HTTP request hits a registered endpoint:

```ts
{
  type: "webhook",
  path: "deploy",              // Endpoint: POST /webhook/deploy
  methods: ["POST"],           // Optional, defaults to ["POST"]
}
```

Webhooks are served on the same port as health probes (default: 8080). Set `HTTP_PORT=0` to disable both. The context provides `method`, `headers`, `query`, and `body`.

### Multiple Triggers

An automation can have multiple triggers. The `context` parameter tells you which one fired:

```ts
readonly triggers: Trigger[] = [
  { type: "mqtt", topic: "zigbee2mqtt/sensor_a" },
  { type: "cron", expression: "*/5 * * * *" },
  { type: "webhook", path: "trigger-me" },
];

async execute(context: TriggerContext): Promise<void> {
  if (context.type === "mqtt") {
    this.logger.info(`Triggered by ${context.topic}`);
  } else if (context.type === "cron") {
    this.logger.info("Triggered by cron schedule");
  } else if (context.type === "state") {
    this.logger.info(`State "${context.key}" changed to ${context.newValue}`);
  } else if (context.type === "webhook") {
    this.logger.info(`Webhook ${context.path} called via ${context.method}`);
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

## Device-Specific Base Classes

For common Zigbee remotes/buttons, the framework provides abstract base classes with a dispatcher pattern — override only the handlers you need:

### Aqara H1 Remote (`AqaraH1Automation`)

12 handlers: `onSingleLeft`, `onDoubleLeft`, `onTripleLeft`, `onHoldLeft`, `onSingleRight`, `onDoubleRight`, `onTripleRight`, `onHoldRight`, `onSingleBoth`, `onDoubleBoth`, `onTripleBoth`, `onHoldBoth`

```ts
import { AqaraH1Automation } from "ts-home-automation";

export default class MyRemote extends AqaraH1Automation {
  readonly name = "my-remote";
  protected readonly remoteName = "living_room_remote";

  protected async onSingleLeft(): Promise<void> {
    this.mqtt.publishToDevice("lamp", { state: "TOGGLE" });
  }
}
```

### IKEA STYRBAR Remote (`IkeaStyrbarAutomation`)

11 handlers: `onOn`, `onOff`, `onBrightnessMoveUp`, `onBrightnessMoveDown`, `onBrightnessStop`, `onArrowLeftClick`, `onArrowLeftHold`, `onArrowLeftRelease`, `onArrowRightClick`, `onArrowRightHold`, `onArrowRightRelease`

### IKEA RODRET Dimmer (`IkeaRodretAutomation`)

5 handlers: `onOn`, `onOff`, `onBrightnessMoveUp`, `onBrightnessMoveDown`, `onBrightnessStop`

All three follow the same pattern: set `remoteName`, override handlers. The trigger and action dispatching is handled automatically.

## Shelly Devices

The framework includes a built-in `ShellyService` for controlling Shelly Gen 2 devices (like the Plus Plug S) over their local HTTP RPC API. No cloud required.

### Registering devices

Register Shelly devices in your automation's `onStart` hook or in your entry point:

```ts
// In your entry point (before engine.start()):
const engine = createEngine({ automationsDir: "..." });
engine.shelly.registerMany({
  "living_room_plug": "192.168.1.50",
  "tv_plug": "shelly-plug.local",            // mDNS hostnames work
  "desk_lamp": "http://192.168.1.52",         // URLs are normalized automatically
  "bedroom_shutter": "shelly-2pm.local:8080", // custom ports work
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

**Cover/shutter methods** (Shelly Plus 2PM in roller mode):

| Method | Description |
|---|---|
| `shelly.coverOpen(name, duration?)` | Open the cover (optional: stop after N seconds) |
| `shelly.coverClose(name, duration?)` | Close the cover (optional: stop after N seconds) |
| `shelly.coverStop(name)` | Stop cover movement |
| `shelly.coverGoToPosition(name, pos)` | Move to absolute position 0–100 (requires calibration) |
| `shelly.coverMoveRelative(name, offset)` | Move by relative offset -100 to 100 |
| `shelly.getCoverStatus(name)` | Get cover status (position, state, power) |
| `shelly.getCoverConfig(name)` | Get cover configuration |
| `shelly.getCoverPosition(name)` | Get current position 0–100 (null if uncalibrated) |
| `shelly.getCoverState(name)` | Get current state (open/closed/opening/closing/stopped) |
| `shelly.coverCalibrate(name)` | Start calibration (cover opens and closes fully) |

### Typed status responses

**Switch status** (`getStatus()`) — Plus Plug S, Plus 1PM Mini:

```ts
const status = await this.shelly.getStatus("living_room_plug");
// status.output      — boolean (on/off)
// status.apower      — active power in Watts
// status.voltage     — voltage in Volts
// status.current     — current in Amps
// status.aenergy     — { total: Wh, by_minute: mWh[], minute_ts: unix }
// status.temperature — { tC: number, tF: number }
```

**Cover status** (`getCoverStatus()`) — Plus 2PM in roller mode:

```ts
const status = await this.shelly.getCoverStatus("bedroom_shutter");
// status.state       — "open" | "closed" | "opening" | "closing" | "stopped"
// status.current_pos — 0–100 (null if uncalibrated)
// status.apower      — active power in Watts
// status.pos_control — true if calibrated
```

## Nanoleaf Devices

Control Nanoleaf light panels (Light Panels, Canvas, Shapes, Elements, Lines) over the local HTTP API.

### Pairing

Generate an auth token using the CLI:

```bash
ts-ha nanoleaf pair 192.168.1.60          # IP address
ts-ha nanoleaf pair nanoleaf-panels.local  # mDNS hostname
```

Hold the power button on the device until the LED flashes, then press Enter.

### Registering devices

```ts
engine.nanoleaf.register("panels", {
  host: "192.168.1.60",              // IP, hostname, or .local name
  token: "xxxxxxxxxxxxxxxxxxx",       // from pairing
});
```

### Using in automations

```ts
await this.nanoleaf.turnOn("panels");
await this.nanoleaf.setBrightness("panels", 80, 2);  // 80%, 2s transition
await this.nanoleaf.setColor("panels", 120, 100);     // green, full saturation
await this.nanoleaf.setEffect("panels", "Northern Lights");
```

### Available methods

| Method | Description |
|---|---|
| `nanoleaf.turnOn/turnOff/toggle(name)` | Power control |
| `nanoleaf.setBrightness(name, value, duration?)` | Brightness 0-100 with optional transition |
| `nanoleaf.setColor(name, hue, sat)` | HSB color (hue 0-360, sat 0-100) |
| `nanoleaf.setColorTemp(name, value)` | Color temperature 1200-6500K |
| `nanoleaf.setState(name, state)` | Set multiple properties at once |
| `nanoleaf.getState(name)` | Get full device state |
| `nanoleaf.getEffects(name)` | List available effects |
| `nanoleaf.setEffect(name, effectName)` | Activate an effect |
| `nanoleaf.identify(name)` | Flash panels for identification |
| `nanoleaf.getPanelLayout(name)` | Get panel positions and IDs |
| `nanoleaf.getDeviceInfo(name)` | Get device info (model, firmware, etc.) |

## Weather

The engine supports an optional weather service for fetching current conditions and forecasts. The `WeatherService` interface is abstract — two built-in implementations are provided.

### Built-in: Open-Meteo (free, no API key)

```ts
import { createEngine, OpenMeteoService } from "ts-home-automation";

const engine = createEngine({
  automationsDir: "...",
  weather: (http, logger) =>
    new OpenMeteoService({
      location: { latitude: 49.4, longitude: 8.7 },
    }, http, logger),
});
```

### Built-in: OpenWeatherMap (free tier, API key required)

```ts
import { createEngine, OpenWeatherMapService } from "ts-home-automation";

const engine = createEngine({
  automationsDir: "...",
  weather: (http, logger) =>
    new OpenWeatherMapService({
      apiKey: process.env.OWM_API_KEY!,
      location: { latitude: 49.4, longitude: 8.7 },
    }, http, logger),
});
```

### Using in automations

```ts
const current = await this.weather.getCurrent();
this.logger.info({ temp: current.temperature, condition: current.condition }, "Current weather");

const forecast = await this.weather.getForecast(3);
if (forecast[0].precipitationChance > 0.5) {
  await this.notify({ title: "Rain expected", message: "Bring an umbrella tomorrow" });
}
```

### Weather data

| Field | Type | Description |
|---|---|---|
| `temperature` | number | Temperature in Celsius |
| `feelsLike` | number | Feels-like temperature in Celsius |
| `humidity` | number | Relative humidity % |
| `condition` | string | Category: clear, clouds, rain, snow, thunderstorm, fog, etc. |
| `description` | string | Human-readable (e.g. "light rain") |
| `wind.speed` | number | Wind speed in m/s |
| `cloudCover` | number | Cloud cover % |
| `uvIndex` | number | UV index (if available) |

Forecast includes `tempHigh`, `tempLow`, `precipitationChance` (0-1), `sunrise`, `sunset` per day.

## Notifications

The engine supports an optional notification service for sending push notifications from automations. The `NotificationService` interface is abstract — implement it for any provider.

### Built-in: ntfy.sh

```ts
import { createEngine, NtfyNotificationService } from "ts-home-automation";

const engine = createEngine({
  automationsDir: "...",
  notifications: (http, logger) =>
    new NtfyNotificationService({
      topic: "my-home-alerts",
      http,
      logger,
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

The engine includes an HTTP server (enabled by default on port 8080) for health probes and webhook triggers. Set `HTTP_PORT=0` to disable it (this also disables webhook triggers).

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

The included `docker-compose.yml` configures a healthcheck automatically.

## CLI Tool

The `ts-ha` CLI lets you inspect and manage a running engine instance via its debug API.

### Usage

```bash
ts-ha [options] <command> <subcommand> [args]
```

### Options

| Option | Default | Description |
|---|---|---|
| `--host <host:port>` | from config | Override target host |
| `--token <token>` | from config | Override auth token |
| `--json` | | Output raw JSON instead of formatted text |
| `--help` | | Show help |

### Automations

```bash
# List all registered automations
ts-ha automations list

# Short alias
ts-ha a ls

# Get details for a specific automation
ts-ha automations get motion-light-schedule
```

Example output:

```
NAME                        TRIGGERS
motion-light-schedule       mqtt(2)
contact-sensor-alarm        mqtt(3)
shortcut-button-timer       mqtt(1)

3 automation(s)
```

```
Name:     motion-light-schedule
Triggers:
  mqtt     zigbee2mqtt/hallway_entry_sensor
           filter: (payload) => payload.occupancy === true
  mqtt     zigbee2mqtt/hallway_middle_sensor
           filter: (payload) => payload.occupancy === true
```

### Trigger Command

Manually fire an automation with a synthetic context for testing:

```bash
# MQTT trigger with payload
ts-ha a trigger motion-light '{"type":"mqtt","topic":"zigbee2mqtt/sensor","payload":{"occupancy":true}}'

# Cron trigger (defaults filled in automatically)
ts-ha a trigger scheduled-report '{"type":"cron"}'

# State trigger
ts-ha a trigger night-reaction '{"type":"state","key":"night_mode","newValue":true,"oldValue":false}'

# Webhook trigger
ts-ha a trigger deploy-hook '{"type":"webhook","method":"POST","body":{"service":"api"}}'
```

### Logs

Query the in-memory log buffer (last 1000 entries):

```bash
# Last 50 entries
ts-ha logs

# Filter by automation name
ts-ha logs --automation motion-light-schedule

# Filter by minimum log level
ts-ha logs --level error

# Combine filters
ts-ha logs --automation contact-sensor-alarm --level warn --limit 20

# JSON output for scripting
ts-ha --json logs | jq '.entries[] | select(.msg | contains("ALARM"))'
```

Example output:

```
07:04:17.033 INFO  [motion-light-schedule] Motion detected
07:04:17.035 INFO  [motion-light-schedule] Turning on lamps
07:09:17.040 INFO  [motion-light-schedule] No recent motion, turning off lamps
```

#### Follow mode

Stream new log entries continuously (like `tail -f`):

```bash
ts-ha logs -f                                        # Stream all logs
ts-ha logs --follow --automation contact-sensor-alarm # Stream filtered
ts-ha logs -f --level error --interval 1             # Poll every 1s
ts-ha --json logs -f | jq .msg                       # JSON per line
```

Press `Ctrl+C` to stop following.

### State Management

```bash
# List all state keys and values
ts-ha state list

# Get a single value
ts-ha state get night_mode

# Set a value (JSON-parsed: booleans, numbers, strings, objects)
ts-ha state set night_mode true
ts-ha state set alarm_mode false
ts-ha state set motion_count 42
ts-ha state set config '{"threshold": 30}'

# Delete a key
ts-ha state delete temporary_flag

# Short aliases
ts-ha s ls
ts-ha s get night_mode
ts-ha s set alarm_mode true
ts-ha s rm old_key
```

Setting state via the CLI fires state triggers in automations — it's equivalent to calling `this.state.set()` inside an automation.

### Saved Targets

The CLI stores target configurations in `~/.config/ts-ha/config.json`. A `local` target (localhost:8080) is created by default.

```bash
# List saved targets (* = active)
ts-ha config list

# Add a remote target with auth token
ts-ha config add prod 192.168.1.100:8080 my-secret-token

# Switch to the remote target
ts-ha config use prod

# Now all commands go to the prod target
ts-ha state list

# Remove a target
ts-ha config remove prod

# Override target for a single command
ts-ha --host 192.168.1.200:8080 --token secret s ls

# Output JSON for scripting
ts-ha --json state list | jq '.state.night_mode'
```

### Dashboard

Interactive terminal dashboard built with OpenTUI, showing engine status, automations, state, and logs in a tabbed interface:

```bash
ts-ha dashboard              # Live dashboard, 5s refresh
ts-ha d                      # Short alias
ts-ha d --interval 2         # Refresh every 2 seconds
```

The dashboard has four tabs switchable via number keys:

| Tab | Key | Features |
|---|---|---|
| Overview | `1` | Engine/MQTT status, uptime, automation summary, state summary, recent logs |
| Automations | `2` | Scrollable list, Enter to expand trigger details, `t` to manually trigger |
| State | `3` | Scrollable list with color-coded values, Enter to edit, `n` to add, `d` to delete |
| Logs | `4` | Scrollable log viewer, auto-sized to terminal height |

Keyboard shortcuts:

| Key | Action |
|---|---|
| `1`-`4` | Switch tabs |
| `q` / `Esc` | Quit |
| `r` | Force refresh |
| `?` | Toggle help modal |
| `Enter` | Expand automation / edit state value |
| `t` | Trigger selected automation |
| `n` / `d` | New / delete state key |

Features: ASCII art header, animated connection indicator, responsive layout (adapts to terminal size), Dracula color theme, color-coded state values (boolean green/red, number cyan, string yellow).

### Authentication

Set `HTTP_TOKEN` on the engine to require a bearer token for debug and webhook endpoints. Health probes (`/healthz`, `/readyz`) remain unauthenticated for Kubernetes compatibility.

```bash
# Engine side
HTTP_TOKEN=my-secret-token

# CLI side — save the token with a target
ts-ha config add prod 192.168.1.100:8080 my-secret-token

# Or pass it directly
ts-ha --host 192.168.1.100:8080 --token my-secret-token state list
```

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
| `bun run test` | Run tests |
| `bun run check` | Format + lint (Biome) |
| `bun run typecheck` | TypeScript type checking |
| `bun run build` | Build package (JS + declarations to `dist/`) |
| `ts-ha` | CLI tool for managing a running instance |
| `bun run docker:build` | Build Docker image |
| `bun run docker:up` | Start via Docker Compose |
| `bun run docker:down` | Stop Docker Compose |

## License

[GPL-3.0](LICENSE)
