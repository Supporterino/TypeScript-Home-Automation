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
      });
      return svc;
    },
  },
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
    await this.nanoleaf.turnOn("panels");
    await this.nanoleaf.setBrightness("panels", 80, 1);
    await this.nanoleaf.setEffect("panels", "Northern Lights");
  }
}
```

## Example: set a warm evening scene

```ts
await this.nanoleaf.setColorTemp("panels", 2700);  // warm white
await this.nanoleaf.setBrightness("panels", 40, 3); // 40%, 3s transition
```
