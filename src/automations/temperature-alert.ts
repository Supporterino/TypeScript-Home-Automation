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
  /** Warning threshold — sends a low-priority notification. */
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

/** ntfy.sh priority levels. */
type NtfyPriority = "min" | "low" | "default" | "high" | "urgent";

/**
 * Example: Temperature and humidity monitoring with ntfy.sh notifications.
 *
 * Listens to one or more Aqara WSDCGQ11LM temperature/humidity sensors
 * and sends push notifications via ntfy.sh when warning or critical
 * thresholds are exceeded.
 *
 * Features:
 * - Multiple sensors, each with independent thresholds
 * - Separate warning and critical levels for temperature and humidity
 * - Cooldown period to prevent notification spam
 * - Notifications via ntfy.sh (self-hosted or ntfy.sh cloud)
 *
 * Adjust NTFY_URL, NTFY_TOPIC, SENSORS, and COOLDOWN_MS to your setup.
 *
 * ntfy.sh setup:
 * 1. Install the ntfy app on your phone
 * 2. Subscribe to your chosen topic
 * 3. Set NTFY_TOPIC below to the same topic name
 */
export default class TemperatureAlert extends Automation {
  readonly name = "temperature-alert";

  // ---- ntfy.sh configuration ----

  /** ntfy.sh server URL (use your own server or the public one). */
  private readonly NTFY_URL = "https://ntfy.sh";

  /** ntfy.sh topic to publish to. Pick something hard to guess. */
  private readonly NTFY_TOPIC = "my-home-alerts";

  /**
   * Optional: ntfy.sh auth token for access-controlled topics.
   * Set to null if your topic is open.
   */
  private readonly NTFY_TOKEN: string | null = null;

  // ---- Sensor configuration ----

  /**
   * Sensors to monitor.
   *
   * Each sensor has its own warning and critical thresholds for
   * temperature and humidity. Set a threshold to null to disable it.
   *
   * Example: a bathroom sensor with high humidity alert, and a server
   * room sensor with tight temperature limits.
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

    // Check temperature thresholds
    if (payload.temperature !== undefined) {
      await this.checkThreshold(
        sensor,
        "temperature",
        payload.temperature,
        "°C",
        sensor.temperature,
      );
    }

    // Check humidity thresholds
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
    // Check critical first (higher priority wins)
    if (threshold.critical !== null && value >= threshold.critical) {
      await this.notify(sensor, metric, value, unit, "critical", threshold.critical);
      return;
    }

    if (threshold.warning !== null && value >= threshold.warning) {
      await this.notify(sensor, metric, value, unit, "warning", threshold.warning);
    }
  }

  /**
   * Send a notification via ntfy.sh, respecting the cooldown period.
   */
  private async notify(
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
        { sensor: sensor.name, metric, level, cooldownKey },
        "Notification suppressed (cooldown active)",
      );
      return;
    }

    const metricLabel = metric.charAt(0).toUpperCase() + metric.slice(1);
    const levelLabel = level.charAt(0).toUpperCase() + level.slice(1);
    const title = `${sensor.label}: ${metricLabel} ${levelLabel}`;
    const message = [
      `${metricLabel}: ${value}${unit} (threshold: ${thresholdValue}${unit})`,
      `Sensor: ${sensor.label} (${sensor.name})`,
    ].join("\n");

    const isCritical = level === "critical";
    const priority: NtfyPriority = isCritical ? "urgent" : "high";
    const tags = isCritical
      ? "rotating_light,thermometer"
      : "warning,thermometer";

    this.logger.info(
      { sensor: sensor.name, metric, value, unit, level },
      `Sending ${level} notification`,
    );

    try {
      const headers: Record<string, string> = {
        "Content-Type": "text/plain",
        Title: title,
        Priority: priority,
        Tags: tags,
      };

      if (this.NTFY_TOKEN) {
        headers.Authorization = `Bearer ${this.NTFY_TOKEN}`;
      }

      const response = await this.http.request(
        `${this.NTFY_URL}/${this.NTFY_TOPIC}`,
        {
          method: "POST",
          headers,
          body: message,
        },
      );

      if (response.ok) {
        this.lastNotified.set(cooldownKey, now);
        this.logger.info(
          { sensor: sensor.name, metric, level },
          "Notification sent",
        );
      } else {
        this.logger.error(
          { status: response.status, sensor: sensor.name },
          "ntfy.sh returned non-OK status",
        );
      }
    } catch (err) {
      this.logger.error(
        { err, sensor: sensor.name },
        "Failed to send ntfy.sh notification",
      );
    }
  }
}
