import { Automation, type Trigger, type TriggerContext } from "../core/automation.js";
import type { AqaraWaterLeakPayload } from "../types/zigbee/index.js";

/**
 * Configuration for a single water leak sensor.
 */
interface LeakSensor {
  /** Zigbee2MQTT friendly name of the Aqara SJCGQ11LM sensor. */
  name: string;
  /** Human-readable label used in notifications (e.g. "Kitchen Sink"). */
  label: string;
}

/**
 * Example: Water leak detection with push notifications.
 *
 * Listens to one or more Aqara SJCGQ11LM water leak sensors and sends
 * an urgent notification when a leak is detected. Optionally sends a
 * recovery notification when the leak clears.
 *
 * Requires a notification service to be configured on the engine:
 * ```ts
 * const engine = createEngine({
 *   automationsDir: "...",
 *   notifications: (http, logger) =>
 *     new NtfyNotificationService({ topic: "my-home-alerts", http, logger }),
 * });
 * ```
 *
 * Features:
 * - Multiple sensors, each with a human-readable label
 * - Urgent notification on leak detection
 * - Recovery notification when leak clears
 * - Cooldown to prevent repeated alerts for the same active leak
 *
 * Adjust SENSORS and COOLDOWN_MS to match your setup.
 */
export default class WaterLeakAlert extends Automation {
  readonly name = "water-leak-alert";

  // ---- Configuration (adjust to your setup) ----

  /**
   * Water leak sensors to monitor.
   */
  private readonly SENSORS: LeakSensor[] = [
    { name: "kitchen_leak_sensor", label: "Kitchen" },
    { name: "bathroom_leak_sensor", label: "Bathroom" },
    { name: "washing_machine_sensor", label: "Washing Machine" },
  ];

  /**
   * Cooldown between repeated leak notifications for the same sensor (in ms).
   * Prevents notification spam while the sensor remains wet.
   */
  private readonly COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

  // ---- Internal state ----

  /** Track last leak notification time per sensor to enforce cooldown. */
  private readonly lastNotified: Map<string, number> = new Map();
  /** Map sensor topics to their config for O(1) lookup. */
  private readonly sensorByTopic: Map<string, LeakSensor> = new Map();

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

    const payload = context.payload as unknown as AqaraWaterLeakPayload;

    if (payload.water_leak === undefined) return;

    if (payload.water_leak) {
      await this.handleLeakDetected(sensor);
    } else {
      await this.handleLeakCleared(sensor);
    }
  }

  /**
   * Handle a leak detection event. Sends an urgent notification
   * unless the cooldown is active.
   */
  private async handleLeakDetected(sensor: LeakSensor): Promise<void> {
    const now = Date.now();
    const lastTime = this.lastNotified.get(sensor.name) ?? 0;

    if (now - lastTime < this.COOLDOWN_MS) {
      this.logger.debug({ sensor: sensor.name }, "Leak notification suppressed (cooldown active)");
      return;
    }

    this.logger.warn({ sensor: sensor.name, label: sensor.label }, "Water leak detected!");

    await this.notify({
      title: `Water Leak: ${sensor.label}`,
      message: `Water leak detected at ${sensor.label} (${sensor.name}).\nCheck immediately!`,
      priority: "urgent",
      tags: ["droplet", "warning"],
    });

    this.lastNotified.set(sensor.name, now);
  }

  /**
   * Handle a leak cleared event. Sends a recovery notification.
   */
  private async handleLeakCleared(sensor: LeakSensor): Promise<void> {
    // Only send recovery if we previously notified about a leak
    if (!this.lastNotified.has(sensor.name)) return;

    this.logger.info({ sensor: sensor.name, label: sensor.label }, "Water leak cleared");

    await this.notify({
      title: `Leak Cleared: ${sensor.label}`,
      message: `Water leak at ${sensor.label} (${sensor.name}) has cleared.`,
      priority: "default",
      tags: ["white_check_mark", "droplet"],
    });

    // Reset cooldown so a new leak triggers immediately
    this.lastNotified.delete(sensor.name);
  }
}
