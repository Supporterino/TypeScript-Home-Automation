import { Automation, type Trigger, type TriggerContext } from "../core/automation.js";
import type { ColorXY, IkeaShortcutButtonAction } from "../types/zigbee/index.js";

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
 * Example: IKEA shortcut button triggers a colored flash on a Hue light.
 *
 * Pressing the IKEA E1812 shortcut button makes a Philips Hue light briefly
 * flash in a configured color, then return to its previous state.
 *
 * Use case: visual alert button — press to flash the light strip red as
 * a "dinner is ready" signal, a doorbell indicator, or an attention getter.
 * The light returns to whatever it was doing before (on, off, any color).
 *
 * How it works:
 * 1. The automation subscribes to the light's MQTT topic to continuously
 *    cache its current state (on/off, brightness, color)
 * 2. On button press, the light is set to the flash color at full brightness
 * 3. After FLASH_HOLD_MS, the original state is restored
 *
 * Pressing the button again while flashing restarts the hold timer.
 *
 * Adjust BUTTON_NAME, LIGHT_NAME, FLASH_COLOR, and FLASH_HOLD_MS
 * to match your setup.
 */
export default class ShortcutButtonFlash extends Automation {
  readonly name = "shortcut-button-flash";

  // ---- Configuration (adjust to your setup) ----

  /** Zigbee2MQTT friendly name of the IKEA E1812 shortcut button. */
  private readonly BUTTON_NAME = "alert_button";

  /** Zigbee2MQTT friendly name of the Hue light (strip, bulb, etc.). */
  private readonly LIGHT_NAME = "living_room_lightstrip";

  /** Color to flash (pick from COLORS or use custom CIE xy values). */
  private readonly FLASH_COLOR: ColorXY = COLORS.red;

  /** How long to hold the flash color before restoring (in ms). */
  private readonly FLASH_HOLD_MS = 1000;

  // ---- Internal state ----

  private restoreTimer: ReturnType<typeof setTimeout> | null = null;
  private isFlashing = false;

  /** Cached previous state from the light's MQTT topic. */
  private previousState: { on: boolean; brightness?: number; color?: ColorXY } = { on: false };

  readonly triggers: Trigger[] = [
    {
      type: "mqtt",
      topic: `zigbee2mqtt/${this.BUTTON_NAME}`,
      filter: (payload) => (payload.action as IkeaShortcutButtonAction | undefined) === "on",
    },
    // Subscribe to the light's state to keep a cached copy for restoration
    {
      type: "mqtt",
      topic: `zigbee2mqtt/${this.LIGHT_NAME}`,
    },
  ];

  async execute(context: TriggerContext): Promise<void> {
    if (context.type !== "mqtt") return;

    // Update cached light state (ignore updates caused by our own flash)
    if (context.topic === `zigbee2mqtt/${this.LIGHT_NAME}`) {
      if (!this.isFlashing) {
        this.previousState = {
          on: context.payload.state === "ON",
          brightness:
            typeof context.payload.brightness === "number" ? context.payload.brightness : undefined,
          color:
            context.payload.color && typeof context.payload.color === "object"
              ? (context.payload.color as ColorXY)
              : undefined,
        };
      }
      return;
    }

    // Button was pressed — flash the light
    this.logger.info(
      { light: this.LIGHT_NAME, color: this.FLASH_COLOR },
      "Button pressed, flashing light",
    );

    // Cancel any pending restore from a previous flash
    if (this.restoreTimer) {
      clearTimeout(this.restoreTimer);
    }

    this.isFlashing = true;

    // Set the flash color at full brightness with instant transition
    this.mqtt.publishToDevice(this.LIGHT_NAME, {
      state: "ON",
      color: this.FLASH_COLOR,
      brightness: 254,
      transition: 0,
    });

    // Restore previous state after the hold duration
    this.restoreTimer = setTimeout(() => {
      this.restoreTimer = null;
      this.isFlashing = false;

      if (this.previousState.on) {
        this.logger.debug("Restoring light to previous on-state");
        this.mqtt.publishToDevice(this.LIGHT_NAME, {
          state: "ON",
          ...(this.previousState.brightness !== undefined && {
            brightness: this.previousState.brightness,
          }),
          ...(this.previousState.color && {
            color: this.previousState.color,
          }),
          transition: 0,
        });
      } else {
        this.logger.debug("Restoring light to off-state");
        this.mqtt.publishToDevice(this.LIGHT_NAME, {
          state: "OFF",
          transition: 0,
        });
      }
    }, this.FLASH_HOLD_MS);
  }

  async onStop(): Promise<void> {
    this.isFlashing = false;
    if (this.restoreTimer) {
      clearTimeout(this.restoreTimer);
      this.restoreTimer = null;
    }
  }
}
