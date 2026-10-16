import type { IkeaStyrbarAction } from "@ts-ha/shared/types";
import { Automation, type Trigger, type TriggerContext } from "../automation.js";

/**
 * Abstract base class for automations driven by an IKEA STYRBAR remote
 * (E2001 / E2002 / E2313). Subclasses set `remoteName` and override only the action
 * handlers they need; unhandled actions are a no-op.
 */
export abstract class IkeaStyrbarAutomation extends Automation {
  /**
   * Zigbee2MQTT friendly name of the STYRBAR remote.
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

    const action = context.payload.action as IkeaStyrbarAction;

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
      case "arrow_left_click":
        return this.onArrowLeftClick();
      case "arrow_left_hold":
        return this.onArrowLeftHold();
      case "arrow_left_release":
        return this.onArrowLeftRelease();
      case "arrow_right_click":
        return this.onArrowRightClick();
      case "arrow_right_hold":
        return this.onArrowRightHold();
      case "arrow_right_release":
        return this.onArrowRightRelease();
      default:
        this.logger.debug({ action }, "Unknown action");
    }
  }

  // ---- Top/bottom button handlers ----

  /** Called when the top button is pressed. Override to handle. */
  protected async onOn(): Promise<void> {}
  /** Called when the bottom button is pressed. Override to handle. */
  protected async onOff(): Promise<void> {}
  /** Called when the top button is held. Override to handle. */
  protected async onBrightnessMoveUp(): Promise<void> {}
  /** Called when the bottom button is held. Override to handle. */
  protected async onBrightnessMoveDown(): Promise<void> {}
  /** Called when the top or bottom button is released after hold. Override to handle. */
  protected async onBrightnessStop(): Promise<void> {}

  // ---- Left arrow button handlers ----

  /** Called when the left arrow button is clicked. Override to handle. */
  protected async onArrowLeftClick(): Promise<void> {}
  /** Called when the left arrow button is held. Override to handle. */
  protected async onArrowLeftHold(): Promise<void> {}
  /** Called when the left arrow button is released after hold. Override to handle. */
  protected async onArrowLeftRelease(): Promise<void> {}

  // ---- Right arrow button handlers ----

  /** Called when the right arrow button is clicked. Override to handle. */
  protected async onArrowRightClick(): Promise<void> {}
  /** Called when the right arrow button is held. Override to handle. */
  protected async onArrowRightHold(): Promise<void> {}
  /** Called when the right arrow button is released after hold. Override to handle. */
  protected async onArrowRightRelease(): Promise<void> {}
}
