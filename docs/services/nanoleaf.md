# Nanoleaf

Control Nanoleaf light panels (Light Panels, Canvas, Shapes, Elements, Lines) over the local HTTP API. No cloud account required.

---

## Pairing

Generate an auth token using the CLI `nanoleaf pair` command. Hold the power button on your Nanoleaf device until the LED starts flashing, then run:

```bash
ts-ha nanoleaf pair 192.168.1.60          # by IP address
ts-ha nanoleaf pair nanoleaf-panels.local  # by mDNS hostname
```

Press Enter when prompted. The command prints an auth token — save it in your `.env` or config file.

---

## Registering devices

Register Nanoleaf devices in a factory function passed to `services.nanoleaf` in your entry point:

```ts
import { createEngine, NanoleafService } from "ts-home-automation";

const engine = createEngine({
  automationsDir: "./src/automations",
  services: {
    nanoleaf: (http, logger) => {
      const svc = new NanoleafService(http, logger);
      svc.register("panels", {
        host: "192.168.1.60",       // IP, hostname, or .local name
        token: "xxxxxxxxxxxxxxxxxxx", // from pairing
        // port: 16021,             // optional, defaults to 16021
      });
      return svc;
    },
  },
});
```

### Bulk registration

Use `registerMany()` to register multiple devices at once:

```ts
svc.registerMany({
  panels: { host: "192.168.1.60", token: "xxx" },
  bedroom: { host: "192.168.1.61", token: "yyy", port: 16021 },
});
```

---

## Available methods

| Method | Description |
|---|---|
| `turnOn(name)` | Turn the panels on |
| `turnOff(name)` | Turn the panels off |
| `toggle(name)` | Toggle power |
| `setBrightness(name, value, duration?)` | Set brightness 0–100 with optional transition in seconds |
| `setColor(name, hue, saturation)` | Set HSB color; hue 0–360, saturation 0–100 |
| `setColorTemp(name, kelvin)` | Set color temperature 1200–6500 K |
| `setState(name, state)` | Set multiple properties at once (on, brightness, hue, sat, ct, effect) |
| `getState(name)` | Get the full device state |
| `getEffects(name)` | List all available effects by name |
| `getCurrentEffect(name)` | Get the name of the currently active effect |
| `setEffect(name, effectName)` | Activate a named effect |
| `identify(name)` | Flash the panels for physical identification |
| `getPanelLayout(name)` | Get panel positions and IDs |
| `getDeviceInfo(name)` | Get device info (model, firmware version, serial number) |

---

## Example: activate a scene when motion is detected

```ts
import type { NanoleafService } from "ts-home-automation";

export default class NanoleafMotion extends Automation {
  readonly name = "nanoleaf-motion";

  readonly triggers: Trigger[] = [
    {
      type: "mqtt",
      topic: "zigbee2mqtt/office_sensor",
      filter: (p) => (p as OccupancyPayload).occupancy === true,
    },
  ];

  async execute(): Promise<void> {
    const nanoleaf = this.services.get<NanoleafService>("nanoleaf");
    if (!nanoleaf) return;
    await nanoleaf.turnOn("panels");
    await nanoleaf.setBrightness("panels", 80, 1);
    await nanoleaf.setEffect("panels", "Northern Lights");
  }
}
```

## Example: set a warm evening scene

```ts
const nanoleaf = this.services.get<NanoleafService>("nanoleaf");
if (!nanoleaf) return;
await nanoleaf.setColorTemp("panels", 2700);  // warm white
await nanoleaf.setBrightness("panels", 40, 3); // 40%, 3s transition
```

---

## Web UI and HomeKit

Registered Nanoleaf devices are also exposed through the engine's shared,
source-neutral device layer (`Engine.devices`) — the same layer Zigbee,
Shelly, and state-toggle devices go through — so they appear in the web UI
and (when configured) HomeKit automatically, with no separate wiring beyond
registering the service.

- **Addressing:** each device is addressed as the qualified identifier
  `nanoleaf:<name>` (the name passed to `register()`/`registerMany()`),
  e.g. `nanoleaf:panels` — see [API Reference](../api-reference.md#httpserver)
  for the qualified identifier format.
- **Liveness:** Nanoleaf has no push transport. Every device is refreshed on
  a fixed interval, `NANOLEAF_POLL_MS` (default `10000`), rather than
  reacting to a stream. A single unreachable device is marked unreachable
  and logged without disrupting the poll for the others.
- **Effects as a capability:** the effect list is described as an enumerated
  writable property, not a bespoke Nanoleaf panel — the web UI's generic
  device-detail view renders it as a plain select control populated from
  `getEffects()`, refreshed whenever the device's own effect list changes
  (design.md D17).
- **Optimistic actuation:** because Nanoleaf is polled rather than
  push-backed, the web UI's revert deadline for an unconfirmed command on a
  Nanoleaf device is derived from its reported refresh interval plus a
  margin — not a short fixed deadline as for a push-backed device — read
  from the device's own descriptor rather than hardcoded per source
  (design.md D21).

See [HomeKit: Supported device types](homekit.md#supported-device-types) and
[Device Registry: Capability vocabulary](../device-registry.md#capability-vocabulary)
for how the same mapped capability schema is projected onto HAP.
