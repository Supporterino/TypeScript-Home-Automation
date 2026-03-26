import {
  Automation,
  type Trigger,
  type TriggerContext,
} from "../core/automation.js";
import type { AqaraRemoteSwitchH1Action } from "../types/zigbee.js";

/**
 * Aqara Wireless Remote Switch H1 (WXKG15LM) automation.
 *
 * Left button controls a Philips Hue lamp:
 * - Single click:  Toggle the lamp on/off
 * - Double click:  Turn on at 100% brightness
 * - Hold:          Start dimming down in 2% steps until next single click
 *
 * Right button controls a Shelly plug:
 * - Single click:  Toggle the plug on/off
 *
 * Adjust the device names below to match your Zigbee2MQTT friendly names
 * and Shelly device registrations.
 */
export default class AqaraH1Remote extends Automation {
  readonly name = "aqara-h1-remote";

  // ---- Device names (adjust to match your setup) ----
  private readonly REMOTE_NAME = "aqara_h1_remote";
  private readonly LAMP_NAME = "hue_lamp";
  private readonly PLUG_NAME = "shelly_plug";

  // ---- Dimming state ----
  private dimInterval: ReturnType<typeof setInterval> | null = null;
  private readonly DIM_STEP = 2;
  private readonly DIM_INTERVAL_MS = 200;

  readonly triggers: Trigger[] = [
    {
      type: "mqtt",
      topic: `zigbee2mqtt/${this.REMOTE_NAME}`,
      filter: (payload) => payload.action !== undefined,
    },
  ];

  async execute(context: TriggerContext): Promise<void> {
    if (context.type !== "mqtt") return;

    const action = context.payload.action as AqaraRemoteSwitchH1Action;

    switch (action) {
      case "single_left":
        await this.handleSingleLeft();
        break;
      case "double_left":
        this.handleDoubleLeft();
        break;
      case "hold_left":
        this.handleHoldLeft();
        break;
      case "single_right":
        await this.handleSingleRight();
        break;
      default:
        this.logger.debug({ action }, "Unhandled action");
    }
  }

  /**
   * Single left click: toggle the lamp.
   * Also stops any active dimming cycle.
   */
  private async handleSingleLeft(): Promise<void> {
    this.stopDimming();
    this.logger.info("Toggling lamp");
    this.mqtt.publishToDevice(this.LAMP_NAME, { state: "TOGGLE" });
  }

  /**
   * Double left click: turn lamp on at full brightness.
   */
  private handleDoubleLeft(): void {
    this.stopDimming();
    this.logger.info("Setting lamp to 100% brightness");
    this.mqtt.publishToDevice(this.LAMP_NAME, {
      state: "ON",
      brightness: 254,
    });
  }

  /**
   * Hold left: start dimming the lamp down in 2% steps.
   * Each step reduces brightness by ~5 (2% of 254).
   * Continues until a single left click stops it.
   */
  private handleHoldLeft(): void {
    if (this.dimInterval) {
      this.logger.debug("Dimming already active");
      return;
    }

    this.logger.info("Starting lamp dimming");

    const step = -Math.round((this.DIM_STEP / 100) * 254);

    this.dimInterval = setInterval(() => {
      this.mqtt.publishToDevice(this.LAMP_NAME, {
        brightness_step: step,
      });
    }, this.DIM_INTERVAL_MS);
  }

  /**
   * Single right click: toggle the Shelly plug.
   */
  private async handleSingleRight(): Promise<void> {
    this.logger.info("Toggling Shelly plug");
    await this.shelly.toggle(this.PLUG_NAME);
  }

  /**
   * Stop any active dimming interval.
   */
  private stopDimming(): void {
    if (this.dimInterval) {
      clearInterval(this.dimInterval);
      this.dimInterval = null;
      this.logger.debug("Dimming stopped");
    }
  }

  async onStop(): Promise<void> {
    this.stopDimming();
  }
}
