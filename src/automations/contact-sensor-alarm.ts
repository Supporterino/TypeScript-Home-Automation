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
 * When a door/window is opened and alarm mode is active, waits a grace
 * period, then re-checks alarm mode. If still armed, sends a critical
 * notification. If alarm mode was disabled during the grace period (e.g.
 * you walked in and pressed the disarm button), no alert is sent.
 *
 * The door's open/close state after the grace period is irrelevant —
 * only the alarm mode state matters.
 *
 * This automation does NOT control the alarm mode state — it only reads it.
 * Another automation (e.g. a button, cron schedule, or presence detection)
 * is responsible for setting it.
 *
 * Use case: a simple alarm system. Enable alarm mode when leaving the house,
 * disable it when arriving. If a door or window opens while armed, you get
 * a push notification after a grace period, giving you time to disarm.
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
 * Adjust ALARM_STATE_KEY, GRACE_PERIOD_MS, and SENSORS to match your setup.
 */
export default class ContactSensorAlarm extends Automation {
  readonly name = "contact-sensor-alarm";

  // ---- Configuration (adjust to your setup) ----

  /**
   * Boolean state key that enables/disables the alarm.
   * When `true`, contact open events trigger the grace period.
   * When `false` (or not set), events are ignored.
   */
  private readonly ALARM_STATE_KEY = "alarm_mode";

  /**
   * Grace period before re-checking alarm state and sending the alert (in ms).
   * Gives you time to enter the house and disable alarm mode before the
   * notification fires. Set to 0 for immediate alerts.
   */
  private readonly GRACE_PERIOD_MS = 30 * 1000; // 30 seconds

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
  private pendingTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  readonly triggers: Trigger[] = this.SENSORS.map((sensor) => ({
    type: "mqtt" as const,
    topic: `zigbee2mqtt/${sensor.name}`,
    filter: (payload: Record<string, unknown>) =>
      (payload as unknown as ContactPayload).contact === false,
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

    // Check alarm mode — skip entirely if not armed
    const alarmEnabled = this.state.get<boolean>(this.ALARM_STATE_KEY, false);
    if (!alarmEnabled) {
      this.logger.debug({ sensor: sensor.name }, "Contact opened but alarm mode is off, ignoring");
      return;
    }

    // Cancel any existing timer for this sensor (e.g. rapid open events)
    const existing = this.pendingTimers.get(sensor.name);
    if (existing) {
      clearTimeout(existing);
    }

    this.logger.info(
      { sensor: sensor.name, graceMs: this.GRACE_PERIOD_MS },
      "Contact opened while armed, starting grace period",
    );

    // Wait the grace period, then re-check alarm mode
    const timer = setTimeout(async () => {
      this.pendingTimers.delete(sensor.name);

      const stillArmed = this.state.get<boolean>(this.ALARM_STATE_KEY, false);
      if (!stillArmed) {
        this.logger.info(
          { sensor: sensor.name },
          "Alarm mode disabled during grace period, no alert",
        );
        return;
      }

      this.logger.warn(
        { sensor: sensor.name, label: sensor.label },
        "ALARM: contact opened while armed!",
      );

      await this.notify({
        title: `ALARM: ${sensor.label}`,
        message: `${sensor.label} (${sensor.name}) was opened while alarm mode is active!`,
        priority: "urgent",
        tags: ["rotating_light", "door"],
      });
    }, this.GRACE_PERIOD_MS);

    this.pendingTimers.set(sensor.name, timer);
  }

  async onStop(): Promise<void> {
    for (const timer of this.pendingTimers.values()) {
      clearTimeout(timer);
    }
    this.pendingTimers.clear();
  }
}
