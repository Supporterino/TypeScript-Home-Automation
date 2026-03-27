import { Automation, type Trigger, type TriggerContext } from "../core/automation.js";
import type { IkeaShortcutButtonAction } from "../types/zigbee.js";

/**
 * Color presets in CIE xy for common flash colors.
 */
const COLORS = {
  red: { x: 0.7, y: 0.3 },
  green: { x: 0.17, y: 0.7 },
  blue: { x: 0.14, y: 0.06 },
  orange: { x: 0.6, y: 0.38 },
  white: { x: 0.32, y: 0.33 },
} as const;

/**
 * Example: IKEA shortcut button triggers a colored flash on a Hue light strip.
 *
 * Pressing the IKEA E1812 shortcut button makes a Philips Hue light strip
 * flash in a configured color for a set duration, then restores the light
 * to its previous state.
 *
 * Use case: visual alert button — press to flash the light strip red as
 * a "dinner is ready" signal, a doorbell indicator for hearing-impaired
 * users, or a fun party effect.
 *
 * How it works:
 * 1. Button press starts a flash loop toggling the light on/off
 * 2. Each "on" phase sets the configured color at full brightness
 * 3. After FLASH_DURATION_MS, the loop stops and the light is turned off
 *
 * Pressing the button while a flash is active restarts the sequence.
 *
 * Adjust BUTTON_NAME, LIGHT_NAME, FLASH_COLOR, FLASH_DURATION_MS,
 * and FLASH_INTERVAL_MS to match your setup.
 */
export default class ShortcutButtonFlash extends Automation {
  readonly name = "shortcut-button-flash";

  // ---- Configuration (adjust to your setup) ----

  /** Zigbee2MQTT friendly name of the IKEA E1812 shortcut button. */
  private readonly BUTTON_NAME = "alert_button";

  /** Zigbee2MQTT friendly name of the Hue light strip. */
  private readonly LIGHT_NAME = "living_room_lightstrip";

  /** Color to flash (pick from COLORS or use custom CIE xy values). */
  private readonly FLASH_COLOR = COLORS.red;

  /** Total duration of the flash sequence (in ms). */
  private readonly FLASH_DURATION_MS = 10 * 1000; // 10 seconds

  /** Interval between on/off toggles (in ms). Lower = faster flashing. */
  private readonly FLASH_INTERVAL_MS = 500;

  // ---- Internal state ----

  private flashInterval: ReturnType<typeof setInterval> | null = null;
  private flashTimeout: ReturnType<typeof setTimeout> | null = null;

  readonly triggers: Trigger[] = [
    {
      type: "mqtt",
      topic: `zigbee2mqtt/${this.BUTTON_NAME}`,
      filter: (payload) => (payload.action as IkeaShortcutButtonAction | undefined) === "on",
    },
  ];

  async execute(context: TriggerContext): Promise<void> {
    if (context.type !== "mqtt") return;

    // Stop any active flash before starting a new one
    this.stopFlash();

    this.logger.info(
      {
        light: this.LIGHT_NAME,
        color: this.FLASH_COLOR,
        durationMs: this.FLASH_DURATION_MS,
      },
      "Starting color flash",
    );

    // Start the flash loop
    let on = true;
    this.flashInterval = setInterval(() => {
      if (on) {
        this.mqtt.publishToDevice(this.LIGHT_NAME, {
          state: "ON",
          color: this.FLASH_COLOR,
          brightness: 254,
          transition: 0,
        });
      } else {
        this.mqtt.publishToDevice(this.LIGHT_NAME, {
          state: "OFF",
          transition: 0,
        });
      }
      on = !on;
    }, this.FLASH_INTERVAL_MS);

    // Stop flashing after the configured duration and restore state
    this.flashTimeout = setTimeout(() => {
      this.logger.info("Flash sequence complete, turning off light");
      this.stopFlash();
      this.mqtt.publishToDevice(this.LIGHT_NAME, { state: "OFF" });
    }, this.FLASH_DURATION_MS);
  }

  /**
   * Stop the flash loop and cancel the timeout.
   */
  private stopFlash(): void {
    if (this.flashInterval) {
      clearInterval(this.flashInterval);
      this.flashInterval = null;
    }
    if (this.flashTimeout) {
      clearTimeout(this.flashTimeout);
      this.flashTimeout = null;
    }
  }

  async onStop(): Promise<void> {
    this.stopFlash();
  }
}
