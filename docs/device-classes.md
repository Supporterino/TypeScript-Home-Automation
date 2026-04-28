# Device Base Classes

For common Zigbee remotes and buttons the framework provides abstract base classes that implement the MQTT trigger and action-dispatching pattern. Override only the handlers you need — all others are no-ops by default.

---

## Aqara H1 Remote (`AqaraH1Automation`)

The Aqara H1 double-rocker switch (WXKG15LM / WRS-R02) exposes 12 distinct actions. Extend `AqaraH1Automation` and set `remoteName` to the device's Zigbee2MQTT friendly name:

```ts
import { AqaraH1Automation } from "ts-home-automation";
import type { ShellyService } from "ts-home-automation";

export default class LivingRoomRemote extends AqaraH1Automation {
  readonly name = "living-room-remote";
  protected readonly remoteName = "living_room_switch";

  protected async onSingleLeft(): Promise<void> {
    this.mqtt.publishToDevice("living_room_lamp", { state: "TOGGLE" });
  }

  protected async onHoldLeft(): Promise<void> {
    this.mqtt.publishToDevice("living_room_lamp", { brightness: 50 });
  }

  protected async onSingleRight(): Promise<void> {
    const shelly = this.services.get<ShellyService>("shelly");
    if (!shelly) return;
    await shelly.toggle("living_room_plug");
  }
}
```

### Available handlers

| Handler | Action |
|---|---|
| `onSingleLeft()` | Single press — left button |
| `onDoubleLeft()` | Double press — left button |
| `onTripleLeft()` | Triple press — left button |
| `onHoldLeft()` | Hold — left button |
| `onSingleRight()` | Single press — right button |
| `onDoubleRight()` | Double press — right button |
| `onTripleRight()` | Triple press — right button |
| `onHoldRight()` | Hold — right button |
| `onSingleBoth()` | Single press — both buttons |
| `onDoubleBoth()` | Double press — both buttons |
| `onTripleBoth()` | Triple press — both buttons |
| `onHoldBoth()` | Hold — both buttons |

---

## IKEA STYRBAR Remote (`IkeaStyrbarAutomation`)

The IKEA STYRBAR (E2001 / E2002 / E2313) remote with four buttons. Set `remoteName` to the device's Zigbee2MQTT friendly name:

```ts
import { IkeaStyrbarAutomation } from "ts-home-automation";

export default class BedroomRemote extends IkeaStyrbarAutomation {
  readonly name = "bedroom-remote";
  protected readonly remoteName = "bedroom_styrbar";

  protected async onOn(): Promise<void> {
    this.mqtt.publishToDevice("bedroom_lamp", { state: "ON" });
  }

  protected async onOff(): Promise<void> {
    this.mqtt.publishToDevice("bedroom_lamp", { state: "OFF" });
  }

  protected async onBrightnessMoveUp(): Promise<void> {
    this.mqtt.publishToDevice("bedroom_lamp", { brightness_move: 40 });
  }

  protected async onBrightnessStop(): Promise<void> {
    this.mqtt.publishToDevice("bedroom_lamp", { brightness_move: 0 });
  }
}
```

### Available handlers

| Handler | Action |
|---|---|
| `onOn()` | Top button press |
| `onOff()` | Bottom button press |
| `onBrightnessMoveUp()` | Hold top button (brightness increase) |
| `onBrightnessMoveDown()` | Hold bottom button (brightness decrease) |
| `onBrightnessStop()` | Release after hold |
| `onArrowLeftClick()` | Left arrow short press |
| `onArrowLeftHold()` | Left arrow hold |
| `onArrowLeftRelease()` | Left arrow release |
| `onArrowRightClick()` | Right arrow short press |
| `onArrowRightHold()` | Right arrow hold |
| `onArrowRightRelease()` | Right arrow release |

---

## IKEA RODRET Dimmer (`IkeaRodretAutomation`)

The IKEA RODRET (E2201) two-button dimmer. Set `remoteName` to the Zigbee2MQTT friendly name:

```ts
import { IkeaRodretAutomation } from "ts-home-automation";

export default class HallwayDimmer extends IkeaRodretAutomation {
  readonly name = "hallway-dimmer";
  protected readonly remoteName = "hallway_rodret";

  protected async onOn(): Promise<void> {
    this.mqtt.publishToDevice("hallway_lamp", { state: "ON", brightness: 254 });
  }

  protected async onOff(): Promise<void> {
    this.mqtt.publishToDevice("hallway_lamp", { state: "OFF" });
  }
}
```

### Available handlers

| Handler | Action |
|---|---|
| `onOn()` | Top button press |
| `onOff()` | Bottom button press |
| `onBrightnessMoveUp()` | Hold top button |
| `onBrightnessMoveDown()` | Hold bottom button |
| `onBrightnessStop()` | Release after hold |

---

## How it works

All three base classes follow the same pattern internally:

1. A single MQTT trigger subscribes to `zigbee2mqtt/<remoteName>`
2. `execute()` reads `context.payload.action` and dispatches to the matching handler method
3. Handler methods have empty default implementations — override only what you need
4. The `triggers` getter is used (not a field) because abstract properties are not available during `super()` construction

> **Note on topic prefix:** The device base classes always use the `zigbee2mqtt/` prefix — they do not read the `ZIGBEE2MQTT_PREFIX` environment variable. If your Zigbee2MQTT uses a non-standard prefix, override `get triggers()` in your subclass to supply the correct topic.
