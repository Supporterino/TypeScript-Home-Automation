import { Automation, type Trigger, type TriggerContext } from "../core/automation.js";
import type { ContactPayload } from "../types/zigbee.js";

/**
 * Configuration for a single contact sensor.
 */
interface ContactSensorConfig {
  /** Zigbee2MQTT friendly name of the contact sensor. */
  name: string;
  /** Human-readable label used in notifications (e.g. "Front Door"). */
  label: string;
}

/**
 * Example: Contact sensor alarm — alert only when alarm mode is enabled.
 *
 * Listens to one or more IKEA PARASOLL (E2013) or similar contact sensors.
 * When a door/window is opened and the alarm mode state key is `true`,
 * sends a critical notification. When alarm mode is `false`, the event
 * is silently ignored.
 *
 * This automation does NOT control the alarm mode state — it only reads it.
 * Another automation (e.g. a button, cron schedule, or presence detection)
 * is responsible for setting it.
 *
 * Use case: a simple alarm system. Enable alarm mode when leaving the house,
 * disable it when arriving. If a door or window opens while armed, get an
 * immediate push notification.
 *
 * Example: pair with other automations to control alarm mode:
 * ```ts
 * // Shortcut button automation:
 * // Press → this.state.set("alarm_mode", !this.state.get("alarm_mode"));
 *
 * // Cron automation:
 * // At 23:00 → this.state.set("alarm_mode", true);
 * // At 07:00 → this.state.set("alarm_mode", false);
 * ```
 *
 * Adjust ALARM_STATE_KEY and SENSORS to match your setup.
 */
export default class ContactSensorAlarm extends Automation {
  readonly name = "contact-sensor-alarm";

  // ---- Configuration (adjust to your setup) ----

  /**
   * Boolean state key that enables/disables the alarm.
   * When `true`, contact open events trigger notifications.
   * When `false` (or not set), events are ignored.
   */
  private readonly ALARM_STATE_KEY = "alarm_mode";

  /**
   * Contact sensors to monitor.
   */
  private readonly SENSORS: ContactSensorConfig[] = [
    { name: "front_door_sensor", label: "Front Door" },
    { name: "back_door_sensor", label: "Back Door" },
    { name: "living_room_window", label: "Living Room Window" },
  ];

  // ---- Internal state ----

  private sensorByTopic: Map<string, ContactSensorConfig> = new Map();

  readonly triggers: Trigger[] = this.SENSORS.map((sensor) => ({
    type: "mqtt" as const,
    topic: `zigbee2mqtt/${sensor.name}`,
  }));

  async onStart(): Promise<void> {
    for (const sensor of this.SENSORS) {
      this.sensorByTopic.set(`zigbee2mqtt/${sensor.name}`, sensor);
    }
  }

  async execute(context: TriggerContext): Promise<void> {
    if (context.type !== "mqtt") return;

    const sensor = this.sensorByTopic.get(context.topic);
    if (!sensor) return;

    const payload = context.payload as unknown as ContactPayload;

    // Only react to door/window opened (contact === false means open)
    if (payload.contact !== false) return;

    // Check if alarm mode is enabled
    const alarmEnabled = this.state.get<boolean>(this.ALARM_STATE_KEY, false);
    if (!alarmEnabled) {
      this.logger.debug({ sensor: sensor.name }, "Contact opened but alarm mode is off, ignoring");
      return;
    }

    this.logger.warn(
      { sensor: sensor.name, label: sensor.label },
      "ALARM: contact opened while armed!",
    );

    await this.notify({
      title: `ALARM: ${sensor.label} Opened`,
      message: `${sensor.label} (${sensor.name}) was opened while alarm mode is active!`,
      priority: "urgent",
      tags: ["rotating_light", "door"],
    });
  }
}
