# TypeScript Home Automation

A lightweight, TypeScript-based home automation engine built on MQTT. Designed to replace Home Assistant automations with fully typed, testable logic that runs as a standalone service alongside [Zigbee2MQTT](https://www.zigbee2mqtt.io/).

Each automation is a single TypeScript class. No YAML, no UI — just code.

## Architecture

```
┌──────────────────────────────────────────────────┐
│              Automation Engine                   │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Motion   │  │ Schedule │  │  Door    │  ...   │
│  │ Light    │  │ Report   │  │  Alert   │        │
│  └────┬─────┘  └─────┬────┘  └──────┬───┘        │
│       │              │              │            │
│  ┌────▼──────────────▼──────────────▼────┐       │
│  │         AutomationManager             │       │
│  └────┬──────────────┬──────────────┬────┘       │
│       │              │              │            │
│  ┌────▼────┐   ┌─────▼─────┐  ┌─────▼───┐        │
│  │  MQTT   │   │   Cron    │  │  HTTP   │        │
│  │ Service │   │ Scheduler │  │ Client  │        │
│  └────┬────┘   └───────────┘  └─────────┘        │
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

## Getting Started

```bash
# Install dependencies
bun install

# Copy and edit configuration
cp .env.example .env

# Run in development mode (hot-reload)
bun run dev

# Run in production mode
bun run start
```

## Configuration

Set these environment variables (or use a `.env` file):

| Variable | Default | Description |
|---|---|---|
| `MQTT_HOST` | `localhost` | Mosquitto broker hostname |
| `MQTT_PORT` | `1883` | Mosquitto broker port |
| `ZIGBEE2MQTT_PREFIX` | `zigbee2mqtt` | Zigbee2MQTT MQTT topic prefix |
| `LOG_LEVEL` | `info` | Log level (`fatal`, `error`, `warn`, `info`, `debug`, `trace`) |

## Writing an Automation

Create a new file in `src/automations/`. It will be auto-discovered on startup — no registration needed.

Every automation extends the `Automation` base class and defines three things:

1. **`name`** — a unique identifier (used in logs)
2. **`triggers`** — what causes it to run (MQTT messages and/or cron schedules)
3. **`execute(context)`** — the logic to run when triggered

### Minimal Example

```ts
import { Automation, type Trigger, type TriggerContext } from "../core/automation.js";

export default class DoorAlert extends Automation {
  readonly name = "door-alert";

  readonly triggers: Trigger[] = [
    {
      type: "mqtt",
      topic: "zigbee2mqtt/front_door",
      filter: (payload) => payload.contact === false,
    },
  ];

  async execute(context: TriggerContext): Promise<void> {
    this.logger.warn("Front door opened!");
    await this.http.post("https://hooks.example.com/notify", {
      text: "Front door was opened",
    });
  }
}
```

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
  } else {
    this.logger.info("Triggered by cron schedule");
  }
}
```

### Available Services

Inside `execute()` (and `onStart`/`onStop`), the following are available:

| Service | Description |
|---|---|
| `this.mqtt.publishToDevice(name, payload)` | Send a command to a Zigbee2MQTT device (publishes to `zigbee2mqtt/<name>/set`) |
| `this.mqtt.publish(topic, payload)` | Publish to any MQTT topic |
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

## Project Structure

```
src/
├── index.ts                   # Entry point
├── config.ts                  # Zod-validated environment config
├── core/
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

## Docker

Build and run as a container:

```bash
# Build the image
bun run docker:build

# Start with Docker Compose (includes Mosquitto)
bun run docker:up

# Stop
bun run docker:down
```

The included `docker-compose.yml` runs both the automation engine and a Mosquitto broker. If your Mosquitto is already running elsewhere, remove the `mosquitto` service and point `MQTT_HOST` to your broker.

## Scripts

| Command | Description |
|---|---|
| `bun run dev` | Development with hot-reload |
| `bun run start` | Production run |
| `bun run typecheck` | TypeScript type checking |
| `bun run docker:build` | Build Docker image |
| `bun run docker:up` | Start via Docker Compose |
| `bun run docker:down` | Stop Docker Compose |

## License

[MIT](LICENSE)
