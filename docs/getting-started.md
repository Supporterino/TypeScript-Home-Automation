# Getting Started

## Prerequisites

- [Bun](https://bun.sh/) 1.x — runtime and package manager
- An MQTT broker — [Mosquitto](https://mosquitto.org/) is the most common choice
- [Zigbee2MQTT](https://www.zigbee2mqtt.io/) connected to the same broker (for Zigbee devices)

---

## Usage as a package

Install the framework in your own project:

```bash
bun add ts-home-automation
```

### Project structure

```
my-home/
├── package.json
├── tsconfig.json
├── .env
└── src/
    ├── index.ts
    └── automations/
        ├── motion-light.ts
        └── temperature-alert.ts
```

### Entry point (`src/index.ts`)

```ts
import { createEngine } from "ts-home-automation";

const engine = createEngine({
  automationsDir: new URL("./automations", import.meta.url).pathname,
});

process.on("SIGINT", async () => {
  await engine.stop();
  process.exit(0);
});

await engine.start();
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

### Your first automation

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

Automations in `automationsDir` are auto-discovered on startup — just export a default class.

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true
  }
}
```

---

## Standalone usage

Clone the repo and work directly inside it:

```bash
git clone https://github.com/Supporterino/TypeScript-Home-Automation.git
cd TypeScript-Home-Automation

bun install
cp .env.example .env
# Edit .env with your MQTT broker details

bun run dev    # Hot-reload development mode
bun run start  # Production mode
```

Write automations in `src/automations/` — they are discovered and registered automatically.

---

## Docker (standalone)

A `Dockerfile` and `docker-compose.yml` are included. The Compose setup starts both the engine and a Mosquitto broker:

```bash
bun run docker:build   # Build the image
bun run docker:up      # Start engine + Mosquitto
bun run docker:down    # Stop
```

> **Port access:** The default `docker-compose.yml` does not expose the engine's port 8080 to the host. To access the debug API, web UI, or health probes from your browser or the CLI, add a `ports` mapping to the engine service:
>
> ```yaml
> ports:
>   - "8080:8080"
> ```

### Consumer Docker image

In your own project:

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

## Next steps

- [Configuration](configuration.md) — set up env vars for your environment
- [Writing Automations](writing-automations.md) — all trigger types and available services
- [CLI Reference](cli.md) — inspect and manage a running engine
