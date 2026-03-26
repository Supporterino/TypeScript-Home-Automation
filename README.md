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
import { Automation, type Trigger, type TriggerContext } from "ts-home-automation";
import type { OccupancyPayload } from "ts-home-automation/types";

export default class MotionLight extends Automation {
  readonly name = "motion-light";

  readonly triggers: Trigger[] = [
    {
      type: "mqtt",
      topic: "zigbee2mqtt/hallway_sensor",
      filter: (p) => (p as unknown as OccupancyPayload).occupancy === true,
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

[MIT](LICENSE)
