import {
  Automation,
  type Trigger,
  type TriggerContext,
} from "../core/automation.js";
import type { OccupancyPayload } from "../types/zigbee.js";

/**
 * Example: Turn on a light when motion is detected.
 *
 * - Trigger: Motion sensor reports occupancy via Zigbee2MQTT
 * - Action:  Turn on the living room light, then turn it off after 5 minutes
 *
 * Adjust the device friendly names to match your Zigbee2MQTT setup.
 */
export default class MotionLight extends Automation {
  readonly name = "motion-light";

  private turnOffTimer: ReturnType<typeof setTimeout> | null = null;

  /** Duration in ms to keep the light on after motion (5 minutes). */
  private readonly lightDuration = 5 * 60 * 1000;

  readonly triggers: Trigger[] = [
    {
      type: "mqtt",
      // Replace "motion_sensor" with your sensor's friendly name in Zigbee2MQTT
      topic: "zigbee2mqtt/motion_sensor",
      filter: (payload) =>
        (payload as unknown as OccupancyPayload).occupancy === true,
    },
  ];

  async execute(context: TriggerContext): Promise<void> {
    if (context.type !== "mqtt") return;

    this.logger.info("Motion detected - turning on light");

    // Turn on the light
    // Replace "living_room_light" with your light's friendly name
    this.mqtt.publishToDevice("living_room_light", {
      state: "ON",
      brightness: 254,
    });

    // Clear any existing turn-off timer
    if (this.turnOffTimer) {
      clearTimeout(this.turnOffTimer);
    }

    // Schedule turning the light off
    this.turnOffTimer = setTimeout(() => {
      this.logger.info("No recent motion - turning off light");
      this.mqtt.publishToDevice("living_room_light", { state: "OFF" });
      this.turnOffTimer = null;
    }, this.lightDuration);
  }

  async onStop(): Promise<void> {
    if (this.turnOffTimer) {
      clearTimeout(this.turnOffTimer);
      this.turnOffTimer = null;
    }
  }
}
