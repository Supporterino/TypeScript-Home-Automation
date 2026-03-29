import type { IkeaRodretAction } from "../types/zigbee.js";
import { Automation, type Trigger, type TriggerContext } from "./automation.js";

/**
 * Abstract base class for automations driven by an IKEA RODRET dimmer
 * (E2201).
 *
 * Provides a clean handler-per-action pattern. Subclasses set `remoteName`
 * and override only the action handlers they need — unhandled actions are
 * silently ignored (no-op).
 *
 * The RODRET has 2 buttons with 5 possible actions:
 *
 * | Action                 | Gesture                      |
 * |------------------------|------------------------------|
 * | `on`                   | Press top button             |
 * | `off`                  | Press bottom button          |
 * | `brightness_move_up`   | Hold top button              |
 * | `brightness_move_down` | Hold bottom button           |
 * | `brightness_stop`      | Release after hold           |
 *
 * @example
 * ```ts
 * import { IkeaRodretAutomation } from "../core/ikea-rodret-automation.js";
 *
 * export default class BedroomDimmer extends IkeaRodretAutomation {
 *   readonly name = "bedroom-dimmer";
 *   protected readonly remoteName = "bedroom_rodret";
 *
 *   protected async onOn(): Promise<void> {
 *     this.mqtt.publishToDevice("bedroom_light", { state: "ON", brightness: 254 });
 *   }
 *
 *   protected async onOff(): Promise<void> {
 *     this.mqtt.publishToDevice("bedroom_light", { state: "OFF" });
 *   }
 *
 *   protected async onBrightnessMoveUp(): Promise<void> {
 *     this.mqtt.publishToDevice("bedroom_light", { brightness_move: 40 });
 *   }
 *
 *   protected async onBrightnessMoveDown(): Promise<void> {
 *     this.mqtt.publishToDevice("bedroom_light", { brightness_move: -40 });
 *   }
 *
 *   protected async onBrightnessStop(): Promise<void> {
 *     this.mqtt.publishToDevice("bedroom_light", { brightness_move: 0 });
 *   }
 * }
 * ```
 */
export abstract class IkeaRodretAutomation extends Automation {
  /**
   * Zigbee2MQTT friendly name of the RODRET dimmer.
   * Override this in your subclass.
   */
  protected abstract readonly remoteName: string;

  /**
   * Triggers are computed via getter so the subclass's `remoteName`
   * is available (abstract properties aren't set during super construction).
   */
  get triggers(): Trigger[] {
    return [
      {
        type: "mqtt" as const,
        topic: `zigbee2mqtt/${this.remoteName}`,
        filter: (payload: Record<string, unknown>) => payload.action !== undefined,
      },
    ];
  }

  async execute(context: TriggerContext): Promise<void> {
    if (context.type !== "mqtt") return;

    const action = context.payload.action as IkeaRodretAction;

    switch (action) {
      case "on":
        return this.onOn();
      case "off":
        return this.onOff();
      case "brightness_move_up":
        return this.onBrightnessMoveUp();
      case "brightness_move_down":
        return this.onBrightnessMoveDown();
      case "brightness_stop":
        return this.onBrightnessStop();
      default:
        this.logger.debug({ action }, "Unknown action");
    }
  }

  // ---- Button handlers ----

  /** Called when the top button is pressed. Override to handle. */
  protected async onOn(): Promise<void> {}
  /** Called when the bottom button is pressed. Override to handle. */
  protected async onOff(): Promise<void> {}
  /** Called when the top button is held. Override to handle. */
  protected async onBrightnessMoveUp(): Promise<void> {}
  /** Called when the bottom button is held. Override to handle. */
  protected async onBrightnessMoveDown(): Promise<void> {}
  /** Called when a button is released after hold. Override to handle. */
  protected async onBrightnessStop(): Promise<void> {}
}
