import {
  Automation,
  type Trigger,
  type TriggerContext,
} from "../core/automation.js";
import type { AqaraTemperatureHumidityPayload } from "../types/zigbee.js";

/**
 * Threshold configuration for a specific measurement.
 * Set to null to disable the threshold.
 */
interface Threshold {
  /** Warning threshold — sends a high-priority notification. */
  warning: number | null;
  /** Critical threshold — sends an urgent notification. */
  critical: number | null;
}

/**
 * Configuration for a single sensor.
 */
interface SensorConfig {
  /** Zigbee2MQTT friendly name of the Aqara WSDCGQ11LM sensor. */
  name: string;
  /** Human-readable label used in notifications (e.g. "Living Room"). */
  label: string;
  /** Temperature thresholds in °C. Alerts when value exceeds the threshold. */
  temperature: Threshold;
  /** Humidity thresholds in %. Alerts when value exceeds the threshold. */
  humidity: Threshold;
}

/**
 * Example: Temperature and humidity monitoring with push notifications.
 *
 * Listens to one or more Aqara WSDCGQ11LM temperature/humidity sensors
 * and sends push notifications via the engine's notification service when
 * warning or critical thresholds are exceeded.
 *
 * Requires a notification service to be configured on the engine:
 *
 * ```ts
 * import { createEngine, NtfyNotificationService } from "ts-home-automation";
 *
 * const engine = createEngine({
 *   automationsDir: "...",
 *   notifications: new NtfyNotificationService({
 *     topic: "my-home-alerts",
 *   }),
 * });
 * ```
 *
 * Features:
 * - Multiple sensors, each with independent thresholds
 * - Separate warning and critical levels for temperature and humidity
 * - Cooldown period to prevent notification spam
 * - Uses the engine's notification service (ntfy.sh, or any custom impl)
 *
 * Adjust SENSORS and COOLDOWN_MS to your setup.
 */
export default class TemperatureAlert extends Automation {
  readonly name = "temperature-alert";

  // ---- Sensor configuration ----

  /**
   * Sensors to monitor.
   *
   * Each sensor has its own warning and critical thresholds for
   * temperature and humidity. Set a threshold to null to disable it.
   */
  private readonly SENSORS: SensorConfig[] = [
    {
      name: "bathroom_sensor",
      label: "Bathroom",
      temperature: { warning: 28, critical: 35 },
      humidity: { warning: 75, critical: 90 },
    },
    {
      name: "server_room_sensor",
      label: "Server Room",
      temperature: { warning: 30, critical: 38 },
      humidity: { warning: 60, critical: 80 },
    },
  ];

  /**
   * Cooldown period between notifications for the same sensor and metric
   * (in ms). Prevents notification spam when a sensor hovers around a
   * threshold value.
   */
  private readonly COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

  // ---- Internal state ----

  /**
   * Track the last notification time per sensor+metric+level to enforce
   * cooldown. Key format: "sensorName:metric:level"
   */
  private lastNotified: Map<string, number> = new Map();

  /** Map sensor topics to their config for O(1) lookup. */
  private sensorByTopic: Map<string, SensorConfig> = new Map();

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

    const payload =
      context.payload as unknown as AqaraTemperatureHumidityPayload;

    if (payload.temperature !== undefined) {
      await this.checkThreshold(
        sensor,
        "temperature",
        payload.temperature,
        "°C",
        sensor.temperature,
      );
    }

    if (payload.humidity !== undefined) {
      await this.checkThreshold(
        sensor,
        "humidity",
        payload.humidity,
        "%",
        sensor.humidity,
      );
    }
  }

  /**
   * Check a value against warning and critical thresholds.
   * Critical is checked first — if both are exceeded, only the critical
   * notification is sent.
   */
  private async checkThreshold(
    sensor: SensorConfig,
    metric: string,
    value: number,
    unit: string,
    threshold: Threshold,
  ): Promise<void> {
    if (threshold.critical !== null && value >= threshold.critical) {
      await this.sendAlert(
        sensor,
        metric,
        value,
        unit,
        "critical",
        threshold.critical,
      );
      return;
    }

    if (threshold.warning !== null && value >= threshold.warning) {
      await this.sendAlert(
        sensor,
        metric,
        value,
        unit,
        "warning",
        threshold.warning,
      );
    }
  }

  /**
   * Send a notification via the engine's notification service,
   * respecting the cooldown period.
   */
  private async sendAlert(
    sensor: SensorConfig,
    metric: string,
    value: number,
    unit: string,
    level: "warning" | "critical",
    thresholdValue: number,
  ): Promise<void> {
    const cooldownKey = `${sensor.name}:${metric}:${level}`;
    const now = Date.now();
    const lastTime = this.lastNotified.get(cooldownKey) ?? 0;

    if (now - lastTime < this.COOLDOWN_MS) {
      this.logger.debug(
        { sensor: sensor.name, metric, level },
        "Notification suppressed (cooldown active)",
      );
      return;
    }

    const metricLabel = metric.charAt(0).toUpperCase() + metric.slice(1);
    const levelLabel = level.charAt(0).toUpperCase() + level.slice(1);
    const isCritical = level === "critical";

    this.logger.info(
      { sensor: sensor.name, metric, value, unit, level },
      `Sending ${level} notification`,
    );

    await this.notify({
      title: `${sensor.label}: ${metricLabel} ${levelLabel}`,
      message: [
        `${metricLabel}: ${value}${unit} (threshold: ${thresholdValue}${unit})`,
        `Sensor: ${sensor.label} (${sensor.name})`,
      ].join("\n"),
      priority: isCritical ? "urgent" : "high",
      tags: isCritical
        ? ["rotating_light", "thermometer"]
        : ["warning", "thermometer"],
    });

    this.lastNotified.set(cooldownKey, now);
  }
}
