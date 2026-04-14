import type { AqaraRemoteSwitchH1Action } from "../../types/zigbee.js";
import { Automation, type Trigger, type TriggerContext } from "../automation.js";

/**
 * Abstract base class for automations driven by an Aqara Wireless Remote
 * Switch H1 (WXKG15LM / WRS-R02).
 *
 * Provides a clean handler-per-action pattern. Subclasses set `remoteName`
 * and override only the action handlers they need — unhandled actions are
 * silently ignored (no-op).
 *
 * The double rocker has 12 possible actions:
 *
 * | Action           | Gesture                 |
 * |------------------|-------------------------|
 * | `single_left`    | Single tap left button  |
 * | `double_left`    | Double tap left button  |
 * | `triple_left`    | Triple tap left button  |
 * | `hold_left`      | Hold left button        |
 * | `single_right`   | Single tap right button |
 * | `double_right`   | Double tap right button |
 * | `triple_right`   | Triple tap right button |
 * | `hold_right`     | Hold right button       |
 * | `single_both`    | Single tap both buttons |
 * | `double_both`    | Double tap both buttons |
 * | `triple_both`    | Triple tap both buttons |
 * | `hold_both`      | Hold both buttons       |
 *
 * @example
 * ```ts
 * import { AqaraH1Automation } from "ts-home-automation";
 *
 * export default class MyRemote extends AqaraH1Automation {
 *   readonly name = "my-remote";
 *   protected readonly remoteName = "living_room_remote";
 *
 *   protected async onSingleLeft(): Promise<void> {
 *     this.mqtt.publishToDevice("lamp", { state: "TOGGLE" });
 *   }
 *
 *   protected async onHoldLeft(): Promise<void> {
 *     await this.shelly.toggle("plug");
 *   }
 * }
 * ```
 */
export abstract class AqaraH1Automation extends Automation {
  /**
   * Zigbee2MQTT friendly name of the Aqara H1 remote.
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
        type: "mqtt",
        topic: `zigbee2mqtt/${this.remoteName}`,
        filter: (payload: Record<string, unknown>) => payload.action !== undefined,
      },
    ];
  }

  async execute(context: TriggerContext): Promise<void> {
    if (context.type !== "mqtt") return;

    const action = context.payload.action as AqaraRemoteSwitchH1Action;

    switch (action) {
      case "single_left":
        return this.onSingleLeft();
      case "double_left":
        return this.onDoubleLeft();
      case "triple_left":
        return this.onTripleLeft();
      case "hold_left":
        return this.onHoldLeft();
      case "single_right":
        return this.onSingleRight();
      case "double_right":
        return this.onDoubleRight();
      case "triple_right":
        return this.onTripleRight();
      case "hold_right":
        return this.onHoldRight();
      case "single_both":
        return this.onSingleBoth();
      case "double_both":
        return this.onDoubleBoth();
      case "triple_both":
        return this.onTripleBoth();
      case "hold_both":
        return this.onHoldBoth();
      default:
        this.logger.debug({ action }, "Unknown action");
    }
  }

  // ---- Left button handlers ----

  /** Called on single tap of the left button. Override to handle. */
  protected async onSingleLeft(): Promise<void> {}
  /** Called on double tap of the left button. Override to handle. */
  protected async onDoubleLeft(): Promise<void> {}
  /** Called on triple tap of the left button. Override to handle. */
  protected async onTripleLeft(): Promise<void> {}
  /** Called when the left button is held. Override to handle. */
  protected async onHoldLeft(): Promise<void> {}

  // ---- Right button handlers ----

  /** Called on single tap of the right button. Override to handle. */
  protected async onSingleRight(): Promise<void> {}
  /** Called on double tap of the right button. Override to handle. */
  protected async onDoubleRight(): Promise<void> {}
  /** Called on triple tap of the right button. Override to handle. */
  protected async onTripleRight(): Promise<void> {}
  /** Called when the right button is held. Override to handle. */
  protected async onHoldRight(): Promise<void> {}

  // ---- Both buttons handlers ----

  /** Called on single tap of both buttons. Override to handle. */
  protected async onSingleBoth(): Promise<void> {}
  /** Called on double tap of both buttons. Override to handle. */
  protected async onDoubleBoth(): Promise<void> {}
  /** Called on triple tap of both buttons. Override to handle. */
  protected async onTripleBoth(): Promise<void> {}
  /** Called when both buttons are held. Override to handle. */
  protected async onHoldBoth(): Promise<void> {}
}
