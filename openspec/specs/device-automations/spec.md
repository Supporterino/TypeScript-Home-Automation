# Device Automations

## Purpose

Abstract base classes that simplify writing automations for specific physical devices. Each base class pre-defines the MQTT trigger(s) and dispatches parsed actions to typed handler methods. Users extend the class and override only the actions they care about.

## Requirements

### Aqara H1 Remote

`AqaraH1Automation` MUST extend `Automation` and provide:

**Trigger:** MQTT trigger on `zigbee2mqtt/{device}/action` with a filter for `AqaraRemoteSwitchH1Payload`.

**12 action handlers** — all optional (no-op by default):

| Handler | Triggered on |
|---------|-------------|
| `onSingleLeft()` | `action: "single_left"` |
| `onDoubleLeft()` | `action: "double_left"` |
| `onTripleLeft()` | `action: "triple_left"` |
| `onHoldLeft()` | `action: "hold_left"` |
| `onSingleRight()` | `action: "single_right"` |
| `onDoubleRight()` | `action: "double_right"` |
| `onTripleRight()` | `action: "triple_right"` |
| `onHoldRight()` | `action: "hold_right"` |
| `onSingleBoth()` | `action: "single_both"` |
| `onDoubleBoth()` | `action: "double_both"` |
| `onTripleBoth()` | `action: "triple_both"` |
| `onHoldBoth()` | `action: "hold_both"` |

The `execute()` method MUST parse `AqaraRemoteSwitchH1Payload.action` and dispatch to the corresponding handler. Unknown actions are logged as warnings.

### IKEA STYRBAR Remote

`IkeaStyrbarAutomation` MUST extend `Automation` and provide:

**Trigger:** MQTT trigger on `zigbee2mqtt/{device}/action` with a filter for `IkeaStyrbarPayload`.

**11 action handlers** — all optional (no-op by default):

| Handler | Triggered on |
|---------|-------------|
| `onOn()` | `action: "on"` |
| `onOff()` | `action: "off"` |
| `onBrightnessMoveUp()` | `action: "brightness_move_up"` |
| `onBrightnessMoveDown()` | `action: "brightness_move_down"` |
| `onBrightnessStop()` | `action: "brightness_stop"` |
| `onArrowLeftClick()` | `action: "arrow_left_click"` |
| `onArrowLeftHold()` | `action: "arrow_left_hold"` |
| `onArrowLeftRelease()` | `action: "arrow_left_release"` |
| `onArrowRightClick()` | `action: "arrow_right_click"` |
| `onArrowRightHold()` | `action: "arrow_right_hold"` |
| `onArrowRightRelease()` | `action: "arrow_right_release"` |

### IKEA RODRET Dimmer

`IkeaRodretAutomation` MUST extend `Automation` and provide:

**Trigger:** MQTT trigger on `zigbee2mqtt/{device}/action` with a filter for `IkeaRodretPayload`.

**5 action handlers** — all optional (no-op by default):

| Handler | Triggered on |
|---------|-------------|
| `onOn()` | `action: "on"` |
| `onOff()` | `action: "off"` |
| `onBrightnessMoveUp()` | `action: "brightness_move_up"` |
| `onBrightnessMoveDown()` | `action: "brightness_move_down"` |
| `onBrightnessStop()` | `action: "brightness_stop"` |

### Common Patterns

All three base classes MUST:
- Use a `get triggers()` getter (not a field) to compute triggers dynamically, because abstract properties aren't available during `super()` construction
- Use a dispatcher pattern in `execute()` routing to typed handler methods
- Handle unknown actions by logging a warning (don't throw)
- Expose all handlers as `protected async` methods (allowing subclasses to await on device operations)

### Usage Pattern

```ts
export default class MyRemote extends AqaraH1Automation {
  name = "living-room-remote";
  // `triggers` is computed by the base class based on device name

  private readonly DEVICE = "living_room_remote";

  protected async onSingleLeft(): Promise<void> {
    const shelly = this.require<ShellyService>("shelly");
    await shelly.toggle("living_room_light");
  }
}
```
