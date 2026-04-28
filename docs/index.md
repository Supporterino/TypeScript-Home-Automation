# TypeScript Home Automation

A lightweight, fully typed home automation framework built on MQTT and [Bun](https://bun.sh/). Replace Home Assistant automations with testable TypeScript classes — no YAML, no UI, just code.

---

## Why ts-home-automation?

- **Pure TypeScript** — automations are ordinary classes, fully typed end-to-end
- **MQTT-native** — designed around Zigbee2MQTT with wildcard topic support
- **Multiple trigger types** — MQTT messages, cron schedules, state changes, webhooks, and Zigbee device events
- **Zigbee device registry** — automatic device discovery and state tracking; react to any device state change, join, or departure with a single trigger
- **Rich service layer** — Shelly devices, Nanoleaf panels, weather data, push notifications, HomeKit bridge
- **Observable** — structured logging, in-memory log buffer, web status page, CLI dashboard
- **Kubernetes-ready** — `/healthz` and `/readyz` probes built in

---

## Two ways to use it

### As an npm package

Install `ts-home-automation` in your own project and bring your own automation files:

```bash
bun add ts-home-automation
```

→ [Getting Started](getting-started.md)

### Standalone

Clone the repo, drop automations into `src/automations/`, and run:

```bash
git clone https://github.com/Supporterino/TypeScript-Home-Automation.git
cd TypeScript-Home-Automation
bun install && bun run dev
```

---

## Quick links

| | |
|---|---|
| [Getting Started](getting-started.md) | Install, configure, write your first automation |
| [Configuration](configuration.md) | All environment variables |
| [Writing Automations](writing-automations.md) | Triggers, services, lifecycle hooks |
| [Device Registry](device-registry.md) | Zigbee device discovery, state tracking, nice names |
| [CLI Reference](cli.md) | `ts-ha` command reference |
| [Web UI](http/web-ui.md) | Browser dashboard |
| [HomeKit](services/homekit.md) | Apple HomeKit bridge service |
| [Architecture](architecture.md) | How the engine works internally |
| [npm package](https://www.npmjs.com/package/ts-home-automation) | `ts-home-automation` on npm |
