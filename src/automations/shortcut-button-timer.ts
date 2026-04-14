import { Automation, type Trigger, type TriggerContext } from "../core/automation.js";
import type { IkeaShortcutButtonAction } from "../types/zigbee/index.js";

/**
 * Example: IKEA shortcut button sets a state flag with auto-reset timer.
 *
 * Pressing the IKEA E1812 shortcut button sets a boolean state key to `true`.
 * After a configurable duration, the key is automatically reset to `false`.
 * Each press restarts the timer.
 *
 * Use case: a "do not disturb" or "movie mode" button. Press it to activate
 * for 2 hours, then it automatically deactivates. Other automations react
 * to the state key (e.g. disableable motion light stops managing lamps).
 *
 * The button's "on" action (single press) activates the timer.
 * Pressing again while active restarts the countdown.
 *
 * Example: combine with motion-light-disableable:
 * ```ts
 * // This automation sets "motion_light_enabled" to false on press
 * // and resets it to true after 2 hours.
 * // motion-light-disableable reads "motion_light_enabled" and stops
 * // managing lamps while it's false.
 * ```
 *
 * Adjust BUTTON_NAME, STATE_KEY, and DURATION_MS to match your setup.
 */
export default class ShortcutButtonTimer extends Automation {
  readonly name = "shortcut-button-timer";

  // ---- Configuration (adjust to your setup) ----

  /** Zigbee2MQTT friendly name of the IKEA E1812 shortcut button. */
  private readonly BUTTON_NAME = "movie_mode_button";

  /**
   * The state key to set when the button is pressed.
   * Set to `true` on press, reset to `false` after DURATION_MS.
   */
  private readonly STATE_KEY = "movie_mode";

  /** How long the state stays `true` after a press (in ms). */
  private readonly DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

  // ---- Internal state ----

  private resetTimer: ReturnType<typeof setTimeout> | null = null;

  readonly triggers: Trigger[] = [
    {
      type: "mqtt",
      topic: `zigbee2mqtt/${this.BUTTON_NAME}`,
      filter: (payload) => (payload.action as IkeaShortcutButtonAction | undefined) === "on",
    },
  ];

  async execute(context: TriggerContext): Promise<void> {
    if (context.type !== "mqtt") return;

    this.logger.info(
      { stateKey: this.STATE_KEY, durationMs: this.DURATION_MS },
      "Button pressed, activating state with timer",
    );

    // Set the state to true
    this.state.set(this.STATE_KEY, true);

    // Restart the reset timer
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }

    this.resetTimer = setTimeout(() => {
      this.logger.info({ stateKey: this.STATE_KEY }, "Timer expired, resetting state");
      this.state.set(this.STATE_KEY, false);
      this.resetTimer = null;
    }, this.DURATION_MS);
  }

  async onStop(): Promise<void> {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }
}
