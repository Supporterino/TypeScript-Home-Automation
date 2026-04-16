# TypeScript Home Automation

A lightweight, fully typed home automation framework built on MQTT and [Bun](https://bun.sh/). Write automations as TypeScript classes — no YAML, no UI, just code.

[![npm](https://img.shields.io/npm/v/ts-home-automation)](https://www.npmjs.com/package/ts-home-automation)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![Docs](https://img.shields.io/badge/docs-github%20pages-blue)](https://Supporterino.github.io/TypeScript-Home-Automation/)

→ **[Full documentation](https://Supporterino.github.io/TypeScript-Home-Automation/)**

---

## Install

```bash
bun add ts-home-automation
```

Or clone and run standalone:

```bash
git clone https://github.com/Supporterino/TypeScript-Home-Automation.git
cd TypeScript-Home-Automation && bun install && bun run dev
```

Requires [Bun](https://bun.sh/) and an MQTT broker (e.g. [Mosquitto](https://mosquitto.org/)).

---

## Quick start

```ts
// src/index.ts
import { createEngine } from "ts-home-automation";

const engine = createEngine({
  automationsDir: new URL("./automations", import.meta.url).pathname,
});
process.on("SIGINT", async () => { await engine.stop(); process.exit(0); });
await engine.start();
```

```ts
// src/automations/motion-light.ts
import { Automation, type Trigger, type TriggerContext, type OccupancyPayload } from "ts-home-automation";

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
| `WEB_UI_ENABLED` | `false` | Enable the web UI dashboard |
| `DEVICE_REGISTRY_ENABLED` | `false` | Enable Zigbee device discovery and state tracking |

See [Configuration](https://Supporterino.github.io/TypeScript-Home-Automation/configuration/) for all variables.

---

## Documentation

| | |
|---|---|
| [Getting Started](https://Supporterino.github.io/TypeScript-Home-Automation/getting-started/) | Install, configure, first automation |
| [Writing Automations](https://Supporterino.github.io/TypeScript-Home-Automation/writing-automations/) | Triggers, services, lifecycle hooks |
| [Device Registry](https://Supporterino.github.io/TypeScript-Home-Automation/device-registry/) | Zigbee device discovery, state tracking, nice names |
| [Configuration](https://Supporterino.github.io/TypeScript-Home-Automation/configuration/) | All environment variables |
| [CLI Reference](https://Supporterino.github.io/TypeScript-Home-Automation/cli/) | `ts-ha` commands |
| [Web Status Page](https://Supporterino.github.io/TypeScript-Home-Automation/http/web-ui/) | Browser dashboard |
| [Architecture](https://Supporterino.github.io/TypeScript-Home-Automation/architecture/) | How the engine works |
| [Contributing](https://Supporterino.github.io/TypeScript-Home-Automation/contributing/) | Dev setup, conventions |

---

## License

[GPL-3.0](LICENSE)
