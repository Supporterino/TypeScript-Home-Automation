# Shelly Devices

The built-in `ShellyService` controls Shelly Gen 2 devices (Plus Plug S, Plus 1PM Mini, Plus 2PM, etc.) over their local HTTP RPC API. No cloud account or internet connection required.

---

## Registering devices

Register devices in a factory function passed to `services.shelly` in your entry point:

```ts
import { createEngine, ShellyService } from "ts-home-automation";

const engine = createEngine({
  automationsDir: "./src/automations",
  services: {
    shelly: (http, logger) => {
      const svc = new ShellyService(http, logger);
      svc.registerMany({
        "living_room_plug": "192.168.1.50",
        "tv_plug":          "shelly-tv.local",          // mDNS hostnames work
        "desk_lamp":        "http://192.168.1.52",       // full URLs are normalised
        "bedroom_shutter":  "shelly-2pm.local:8080",     // custom ports work
      });
      return svc;
    },
  },
});

await engine.start();
```

You can also register a single device:

```ts
import { createEngine, ShellyService } from "ts-home-automation";

const engine = createEngine({
  automationsDir: "./src/automations",
  services: {
    shelly: (http, logger) => {
      const svc = new ShellyService(http, logger);
      svc.register("kitchen_plug", "192.168.1.55");
      return svc;
    },
  },
});

await engine.start();
```

---

## Switch methods

| Method | Returns | Description |
|---|---|---|
| `turnOn(name, toggleAfter?)` | `Promise<void>` | Turn on; optional auto-off after N seconds |
| `turnOff(name, toggleAfter?)` | `Promise<void>` | Turn off; optional auto-on after N seconds |
| `toggle(name)` | `Promise<void>` | Toggle the switch |
| `isOn(name)` | `Promise<boolean>` | Check if currently on |
| `getPower(name)` | `Promise<number>` | Current power draw in Watts |
| `getStatus(name)` | `Promise<SwitchStatus>` | Full switch status |
| `getConfig(name)` | `Promise<SwitchConfig>` | Switch configuration |
| `getDeviceInfo(name)` | `Promise<DeviceInfo>` | Model, firmware, MAC address |
| `getSysStatus(name)` | `Promise<SysStatus>` | Uptime, RAM, available updates |
| `reboot(name, delayMs?)` | `Promise<void>` | Reboot the device |

### Switch status fields

```ts
const shelly = this.services.get<ShellyService>("shelly");
if (!shelly) return;
const status = await shelly.getStatus("living_room_plug");

status.output      // boolean — on or off
status.apower      // number — active power in Watts
status.voltage     // number — voltage in Volts
status.current     // number — current in Amps
status.aenergy     // { total: Wh, by_minute: mWh[], minute_ts: unix }
status.temperature // { tC: number, tF: number }
```

### Example: auto-off after TV goes idle

```ts
import type { ShellyService } from "ts-home-automation";

export default class TvAutoOff extends Automation {
  readonly name = "tv-auto-off";

  readonly triggers: Trigger[] = [
    { type: "cron", expression: "0 23 * * *" },
  ];

  async execute(): Promise<void> {
    const shelly = this.services.get<ShellyService>("shelly");
    if (!shelly) return;
    const status = await shelly.getStatus("tv_plug");
    if (status.output && status.apower < 5) {
      this.logger.info("TV is idle, switching off");
      await shelly.turnOff("tv_plug");
    }
  }
}
```

---

## Cover / shutter methods

For Shelly Plus 2PM devices configured in roller mode:

| Method | Returns | Description |
|---|---|---|
| `coverOpen(name, duration?)` | `Promise<void>` | Open; optional stop after N seconds |
| `coverClose(name, duration?)` | `Promise<void>` | Close; optional stop after N seconds |
| `coverStop(name)` | `Promise<void>` | Stop movement immediately |
| `coverGoToPosition(name, pos)` | `Promise<void>` | Move to absolute position 0–100 |
| `coverMoveRelative(name, offset)` | `Promise<void>` | Move by relative offset -100 to 100 |
| `getCoverStatus(name)` | `Promise<CoverStatus>` | Full cover status |
| `getCoverConfig(name)` | `Promise<CoverConfig>` | Cover configuration |
| `getCoverPosition(name)` | `Promise<number \| null>` | Current position 0–100, null if uncalibrated |
| `getCoverState(name)` | `Promise<CoverState>` | Current state string |
| `coverCalibrate(name)` | `Promise<void>` | Start calibration (full open → close cycle) |

### Cover states

`"open"` | `"closed"` | `"opening"` | `"closing"` | `"stopped"`

### Cover status fields

```ts
const shelly = this.services.get<ShellyService>("shelly");
if (!shelly) return;
const status = await shelly.getCoverStatus("bedroom_shutter");

status.state        // CoverState string
status.current_pos  // number 0–100, or null if uncalibrated
status.apower       // active power in Watts
status.pos_control  // true if calibrated for position control
```

### Example: close shutters at sunset via cron

```ts
import type { ShellyService } from "ts-home-automation";

export default class SunsetShutters extends Automation {
  readonly name = "sunset-shutters";

  readonly triggers: Trigger[] = [
    { type: "cron", expression: "0 21 * * *" },
  ];

  async execute(): Promise<void> {
    const shelly = this.services.get<ShellyService>("shelly");
    if (!shelly) return;
    await shelly.coverClose("bedroom_shutter");
    await shelly.coverClose("living_room_shutter");
  }
}
```
