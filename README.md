# TypeScript Home Automation

A lightweight, fully typed home automation framework built on MQTT and [Bun](https://bun.sh/). Write automations as TypeScript classes — no YAML, no UI, just code.

[![npm](https://img.shields.io/npm/v/@ts-ha/core)](https://www.npmjs.com/package/@ts-ha/core)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![Docs](https://img.shields.io/badge/docs-github%20pages-blue)](https://Supporterino.github.io/TypeScript-Home-Automation/)

→ **[Full documentation](https://Supporterino.github.io/TypeScript-Home-Automation/)**

> This project is developed with the assistance of AI tools (code generation, documentation, and testing).

---

## Install

The engine library is `@ts-ha/core`; the runner (`ts-ha run`) is `@ts-ha/cli`.

```bash
bun add @ts-ha/core @ts-ha/cli
```

Or clone and run from source:

```bash
git clone https://github.com/Supporterino/TypeScript-Home-Automation.git
cd TypeScript-Home-Automation && bun install && bun run dev
```

Requires [Bun](https://bun.sh/) and an MQTT broker (e.g. [Mosquitto](https://mosquitto.org/)).

---

## Quick start

Run an engine with `ts-ha run`, which loads automations from `./automations` by
default (create the directory; no examples ship with the packages):

```bash
mkdir -p automations
bunx ts-ha run --automations ./automations
```

Or embed the engine in your own project:

```ts
// src/index.ts
import { createEngine } from "@ts-ha/core";

const engine = createEngine({
  automationsDir: new URL("./automations", import.meta.url).pathname,
});
process.on("SIGINT", async () => { await engine.stop(); process.exit(0); });
await engine.start();
```

```ts
// automations/motion-light.ts
import { Automation, type Trigger, type TriggerContext } from "@ts-ha/core";
import type { OccupancyPayload } from "@ts-ha/shared/types";

export default class MotionLight extends Automation {
  readonly name = "motion-light";
  readonly triggers: Trigger[] = [
    { type: "mqtt", topic: "zigbee2mqtt/hallway_sensor",
      filter: (p) => (p as OccupancyPayload).occupancy === true },
  ];
  async execute(_ctx: TriggerContext): Promise<void> {
    this.mqtt.publishToDevice("hallway_light", { state: "ON", brightness: 254 });
  }
}
```

---

## Key environment variables

| Variable | Default | Description |
|---|---|---|
| `MQTT_HOST` | `localhost` | MQTT broker hostname |
| `LOG_LEVEL` | `info` | `trace` · `debug` · `info` · `warn` · `error` |
| `HTTP_PORT` | `8080` | HTTP server port (`0` = disabled) |
| `WEB_UI_ENABLED` | `false` | Enable the web UI dashboard (parsed by `@ts-ha/web-ui`; requires the optional peer installed) |
| `DEVICE_REGISTRY_ENABLED` | `false` | Enable Zigbee device discovery and state tracking |

See [Configuration](https://Supporterino.github.io/TypeScript-Home-Automation/configuration/) for all variables.

---

## Documentation

| | |
|---|---|
| [Getting Started](https://Supporterino.github.io/TypeScript-Home-Automation/getting-started/) | Install, configure, first automation |
| [Writing Automations](https://Supporterino.github.io/TypeScript-Home-Automation/writing-automations/) | Triggers, services, lifecycle hooks |
| [API Reference](https://Supporterino.github.io/TypeScript-Home-Automation/api-reference/) | All public classes, types, and methods |
| [Device Registry](https://Supporterino.github.io/TypeScript-Home-Automation/device-registry/) | Zigbee device discovery, state tracking, nice names |
| [Configuration](https://Supporterino.github.io/TypeScript-Home-Automation/configuration/) | All environment variables |
| [CLI Reference](https://Supporterino.github.io/TypeScript-Home-Automation/cli/) | `ts-ha` commands |
| [Web UI](https://Supporterino.github.io/TypeScript-Home-Automation/http/web-ui/) | Browser dashboard |
| [Deployment](https://Supporterino.github.io/TypeScript-Home-Automation/deployment/) | Docker, Kubernetes, production setup |
| [Architecture](https://Supporterino.github.io/TypeScript-Home-Automation/architecture/) | How the engine works |
| [Troubleshooting](https://Supporterino.github.io/TypeScript-Home-Automation/troubleshooting/) | Common issues and solutions |
| [Contributing](https://Supporterino.github.io/TypeScript-Home-Automation/contributing/) | Dev setup, conventions |

---

## License

[GPL-3.0](LICENSE)
