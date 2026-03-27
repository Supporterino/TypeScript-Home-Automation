import { AqaraH1Automation } from "../core/aqara-h1-automation.js";

/**
 * Aqara Wireless Remote Switch H1 (WXKG15LM) automation.
 *
 * Left button controls a Philips Hue lamp:
 * - Single click:  Toggle the lamp on/off (stops dimming if active)
 * - Double click:  Turn on at 100% brightness
 * - Hold:          Start dimming down in 2% steps until next single click
 *
 * Right button controls a Shelly plug:
 * - Single click:  Toggle the plug on/off
 *
 * Adjust the device names below to match your Zigbee2MQTT friendly names
 * and Shelly device registrations.
 */
export default class AqaraH1Remote extends AqaraH1Automation {
  readonly name = "aqara-h1-remote";
  protected readonly remoteName = "aqara_h1_remote";

  // ---- Device names (adjust to match your setup) ----
  private readonly LAMP_NAME = "hue_lamp";
  private readonly PLUG_NAME = "shelly_plug";

  // ---- Dimming state ----
  private dimInterval: ReturnType<typeof setInterval> | null = null;
  private readonly DIM_STEP = 2;
  private readonly DIM_INTERVAL_MS = 200;

  /**
   * Single left click: if dimming is active, stop it. Otherwise toggle the lamp.
   */
  protected async onSingleLeft(): Promise<void> {
    if (this.dimInterval) {
      this.logger.info("Stopping dimming");
      this.stopDimming();
      return;
    }

    this.logger.info("Toggling lamp");
    this.mqtt.publishToDevice(this.LAMP_NAME, { state: "TOGGLE" });
  }

  /**
   * Double left click: turn lamp on at full brightness.
   */
  protected async onDoubleLeft(): Promise<void> {
    this.logger.info("Setting lamp to 100% brightness");
    this.mqtt.publishToDevice(this.LAMP_NAME, {
      state: "ON",
      brightness: 254,
    });
  }

  /**
   * Hold left: start dimming the lamp down in 2% steps.
   */
  protected async onHoldLeft(): Promise<void> {
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
  protected async onSingleRight(): Promise<void> {
    this.logger.info("Toggling Shelly plug");
    await this.shelly.toggle(this.PLUG_NAME);
  }

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
