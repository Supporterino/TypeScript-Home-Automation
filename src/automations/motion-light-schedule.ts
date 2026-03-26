import {
  Automation,
  type Trigger,
  type TriggerContext,
} from "../core/automation.js";
import type { PhilipsHueMotionSensorPayload } from "../types/zigbee.js";

/**
 * A single lamp target with its friendly name and brightness (0–254).
 */
interface LampTarget {
  /** Zigbee2MQTT friendly name of the lamp. */
  name: string;
  /** Brightness to set (0–254). */
  brightness: number;
}

/**
 * A time window defining which lamps to control and at what brightness.
 *
 * Times are in 24-hour format "HH:MM". A window that crosses midnight
 * (e.g. from "22:00" to "06:00") is handled automatically.
 */
interface TimeWindow {
  /** Start time in "HH:MM" format (inclusive). */
  from: string;
  /** End time in "HH:MM" format (exclusive). */
  to: string;
  /** Lamps to control during this window. */
  lamps: LampTarget[];
}

/**
 * Configuration for a single motion sensor.
 */
interface MotionSensor {
  /** Zigbee2MQTT friendly name of the motion sensor. */
  name: string;
  /**
   * Whether this sensor's lux reading is affected by the lights this
   * automation controls (e.g. sensor is in the same room as the lights).
   *
   * When true, the lux check is skipped for this sensor while lights are
   * already on. This prevents the flickering cycle where the sensor reads
   * high lux from the lights it triggered, causing motion to be ignored.
   *
   * Set to false for sensors that are not influenced by the controlled
   * lights (e.g. a sensor at a room entrance pointing away from the lights).
   */
  luxAffectedByLights: boolean;
}

/**
 * Example: Motion-activated lights with multiple sensors, lux threshold,
 * and time-based schedules.
 *
 * Uses one or more Philips Hue motion sensors (9290012607 / 9290030675) to
 * detect motion and measure illuminance, controlling Philips Hue lights
 * based on time-of-day schedules.
 *
 * Features:
 * - Multiple motion sensors: any sensor triggering activates the lights
 *   and resets the turn-off timer. Useful for rooms with multiple entry
 *   points or long hallways where one sensor can't cover the whole area.
 * - Per-sensor lux handling: each sensor can be marked as affected or
 *   unaffected by the lights. A sensor in the room skips the lux check
 *   when lights are on; a sensor at the entrance always checks lux.
 * - Only triggers when illuminance is below a configurable lux threshold
 * - Time windows define which lamps turn on and at what brightness
 * - Each window can target different lamps with different brightness levels
 * - Handles time window transitions correctly: orphaned lamps from the
 *   previous window are turned off when the window changes
 * - Auto-off after a configurable duration of no motion from any sensor
 *
 * How it works:
 * 1. Any configured sensor reports occupancy + illuminance
 * 2. The sensor's luxAffectedByLights flag determines whether to check lux
 * 3. If lux is checked and above threshold, motion is ignored
 * 4. The current time is matched against TIME_WINDOWS (first match wins)
 * 5. If the time window changed, orphaned lamps are turned off
 * 6. The lamps for the matching window are turned on
 * 7. After LIGHT_DURATION_MS with no motion from any sensor, lights turn off
 *
 * Adjust SENSORS, LUX_THRESHOLD, LIGHT_DURATION_MS, and TIME_WINDOWS
 * to match your setup.
 */
export default class MotionLightSchedule extends Automation {
  readonly name = "motion-light-schedule";

  // ---- Configuration (adjust to your setup) ----

  /**
   * Motion sensors that trigger this automation.
   *
   * Any sensor firing resets the turn-off timer. Each sensor can
   * independently control whether lux is checked when lights are on.
   *
   * Example: a hallway with sensors at each end
   * - "hallway_entry_sensor" is near the door, not affected by hallway lights
   * - "hallway_middle_sensor" is in the middle, affected by hallway lights
   */
  private readonly SENSORS: MotionSensor[] = [
    { name: "hallway_entry_sensor", luxAffectedByLights: false },
    { name: "hallway_middle_sensor", luxAffectedByLights: true },
  ];

  /** Only trigger when illuminance (lux) is below this value. */
  private readonly LUX_THRESHOLD = 30;

  /** How long to keep lights on after last motion event (in ms). */
  private readonly LIGHT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Time windows defining which lamps to turn on and at what brightness.
   *
   * Windows are evaluated in order — the first matching window wins.
   * If no window matches, motion is ignored (but active lamps remain on
   * until the turn-off timer expires).
   *
   * Example setup:
   * - Morning (06:00–09:00): hallway at full brightness
   * - Day (09:00–18:00): hallway at 60%
   * - Evening (18:00–22:00): hallway + accent lamp, warm brightness
   * - Night (22:00–06:00): hallway only at very low brightness
   */
  private readonly TIME_WINDOWS: TimeWindow[] = [
    {
      from: "06:00",
      to: "09:00",
      lamps: [{ name: "hallway_light", brightness: 254 }],
    },
    {
      from: "09:00",
      to: "18:00",
      lamps: [{ name: "hallway_light", brightness: 150 }],
    },
    {
      from: "18:00",
      to: "22:00",
      lamps: [
        { name: "hallway_light", brightness: 200 },
        { name: "accent_lamp", brightness: 120 },
      ],
    },
    {
      from: "22:00",
      to: "06:00",
      lamps: [{ name: "hallway_light", brightness: 30 }],
    },
  ];

  // ---- Internal state ----

  private turnOffTimer: ReturnType<typeof setTimeout> | null = null;
  /** Track which lamps are currently active so we can turn them off. */
  private activeLamps: Set<string> = new Set();
  /** Whether lamps are currently on (managed by this automation). */
  private lightsAreOn = false;
  /** Map sensor topics to their configuration for quick lookup. */
  private sensorByTopic: Map<string, MotionSensor> = new Map();

  readonly triggers: Trigger[] = this.SENSORS.map((sensor) => ({
    type: "mqtt" as const,
    topic: `zigbee2mqtt/${sensor.name}`,
    filter: (payload: Record<string, unknown>) =>
      (payload as unknown as PhilipsHueMotionSensorPayload).occupancy === true,
  }));

  async onStart(): Promise<void> {
    // Build topic → sensor lookup for O(1) access in execute
    for (const sensor of this.SENSORS) {
      this.sensorByTopic.set(`zigbee2mqtt/${sensor.name}`, sensor);
    }
  }

  async execute(context: TriggerContext): Promise<void> {
    if (context.type !== "mqtt") return;

    const payload =
      context.payload as unknown as PhilipsHueMotionSensorPayload;
    const sensor = this.sensorByTopic.get(context.topic);

    if (!sensor) return;

    this.logger.debug(
      { sensor: sensor.name, lux: payload.illuminance },
      "Motion detected",
    );

    // Check lux threshold (skip if this sensor is affected and lights are on)
    const skipLux = sensor.luxAffectedByLights && this.lightsAreOn;
    if (!skipLux) {
      const lux = payload.illuminance ?? 0;
      if (lux >= this.LUX_THRESHOLD) {
        this.logger.debug(
          { sensor: sensor.name, lux, threshold: this.LUX_THRESHOLD },
          "Illuminance above threshold, ignoring motion",
        );
        return;
      }
    }

    // Find matching time window
    const now = new Date();
    const window = this.findActiveWindow(now);

    if (!window) {
      this.logger.debug("No time window matches current time, ignoring motion");
      // Still reset the timer if lights are on — they'll turn off on schedule
      if (this.lightsAreOn) {
        this.resetTurnOffTimer();
      }
      return;
    }

    const newLamps = new Set(window.lamps.map((l) => l.name));

    // Handle time window transition: turn off lamps that are no longer needed
    if (this.lightsAreOn) {
      const orphaned = [...this.activeLamps].filter(
        (name) => !newLamps.has(name),
      );
      if (orphaned.length > 0) {
        this.logger.info(
          { orphaned },
          "Time window changed, turning off orphaned lamps",
        );
        for (const name of orphaned) {
          this.mqtt.publishToDevice(name, { state: "OFF" });
        }
      }
    }

    this.logger.info(
      {
        sensor: sensor.name,
        lux: payload.illuminance,
        window: `${window.from}-${window.to}`,
        lamps: window.lamps.length,
      },
      "Turning on lamps",
    );

    // Turn on all lamps for this window
    this.activeLamps = newLamps;
    for (const lamp of window.lamps) {
      this.mqtt.publishToDevice(lamp.name, {
        state: "ON",
        brightness: lamp.brightness,
      });
    }
    this.lightsAreOn = true;

    // Reset the turn-off timer
    this.resetTurnOffTimer();
  }

  /**
   * Find the first time window that matches the given time.
   */
  private findActiveWindow(now: Date): TimeWindow | undefined {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    for (const window of this.TIME_WINDOWS) {
      const from = this.parseTime(window.from);
      const to = this.parseTime(window.to);

      if (from < to) {
        // Normal window (e.g. 06:00–18:00)
        if (currentMinutes >= from && currentMinutes < to) {
          return window;
        }
      } else {
        // Overnight window (e.g. 22:00–06:00)
        if (currentMinutes >= from || currentMinutes < to) {
          return window;
        }
      }
    }

    return undefined;
  }

  /**
   * Parse a "HH:MM" time string into minutes since midnight.
   */
  private parseTime(time: string): number {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Reset the turn-off timer. Each motion event from any sensor restarts it.
   */
  private resetTurnOffTimer(): void {
    if (this.turnOffTimer) {
      clearTimeout(this.turnOffTimer);
    }

    this.turnOffTimer = setTimeout(() => {
      this.logger.info("No recent motion, turning off lamps");
      for (const name of this.activeLamps) {
        this.mqtt.publishToDevice(name, { state: "OFF" });
      }
      this.activeLamps.clear();
      this.lightsAreOn = false;
      this.turnOffTimer = null;
    }, this.LIGHT_DURATION_MS);
  }

  async onStop(): Promise<void> {
    if (this.turnOffTimer) {
      clearTimeout(this.turnOffTimer);
      this.turnOffTimer = null;
    }
  }
}
