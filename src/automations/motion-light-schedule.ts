import { Automation, type Trigger, type TriggerContext } from "../core/automation.js";
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
  /** How long to keep lights on after last motion event (in ms). */
  durationMs: number;
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

/** State key prefix for this automation. */
const STATE_PREFIX = "motion-light-schedule";

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
 * - Per-window auto-off duration (longer in the evening, shorter at night)
 * - State is shared via the state manager so other automations can check
 *   if lights are currently active (key: "motion-light-schedule:lights_on")
 * - On engine restart, recovers gracefully: turns off any lights that
 *   were left on from a previous run
 *
 * How it works:
 * 1. Any configured sensor reports occupancy + illuminance
 * 2. The sensor's luxAffectedByLights flag determines whether to check lux
 * 3. If lux is checked and above threshold, motion is ignored
 * 4. The current time is matched against TIME_WINDOWS (first match wins)
 * 5. If the time window changed, orphaned lamps are turned off
 * 6. The lamps for the matching window are turned on
 * 7. After the window's durationMs with no motion from any sensor, lights turn off
 *
 * Adjust SENSORS, LUX_THRESHOLD, and TIME_WINDOWS
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

  /**
   * Time windows defining which lamps to turn on, at what brightness,
   * and how long to keep them on after the last motion event.
   *
   * Windows are evaluated in order — the first matching window wins.
   * If no window matches, motion is ignored (but active lamps remain on
   * until the turn-off timer expires).
   *
   * Each window has its own `durationMs` so you can keep lights on longer
   * during the evening (when you're likely settled) and shorter at night
   * (just enough to walk through).
   *
   * Example setup (multiple windows):
   * - Morning (06:00–09:00): hallway at full brightness, 5 min duration
   * - Day (09:00–18:00): hallway at 60%, 3 min duration
   * - Evening (18:00–22:00): hallway + accent lamp, 10 min duration
   * - Night (22:00–06:00): hallway only at very low brightness, 2 min duration
   *
   * For a single window covering the whole day, use an overnight range:
   *   [{ from: "00:00", to: "00:00", durationMs: 5 * 60 * 1000,
   *      lamps: [{ name: "light", brightness: 200 }] }]
   * Since from === to, the window matches all times.
   */
  private readonly TIME_WINDOWS: TimeWindow[] = [
    {
      from: "06:00",
      to: "09:00",
      durationMs: 5 * 60 * 1000, // 5 minutes
      lamps: [{ name: "hallway_light", brightness: 254 }],
    },
    {
      from: "09:00",
      to: "18:00",
      durationMs: 3 * 60 * 1000, // 3 minutes
      lamps: [{ name: "hallway_light", brightness: 150 }],
    },
    {
      from: "18:00",
      to: "22:00",
      durationMs: 10 * 60 * 1000, // 10 minutes
      lamps: [
        { name: "hallway_light", brightness: 200 },
        { name: "accent_lamp", brightness: 120 },
      ],
    },
    {
      from: "22:00",
      to: "06:00",
      durationMs: 2 * 60 * 1000, // 2 minutes
      lamps: [{ name: "hallway_light", brightness: 30 }],
    },
  ];

  // ---- Internal state ----

  private turnOffTimer: ReturnType<typeof setTimeout> | null = null;
  /** Map sensor topics to their configuration for quick lookup. */
  private readonly sensorByTopic: Map<string, MotionSensor> = new Map();

  readonly triggers: Trigger[] = this.SENSORS.map((sensor) => ({
    type: "mqtt" as const,
    topic: `zigbee2mqtt/${sensor.name}`,
    filter: (payload: Record<string, unknown>) =>
      (payload as unknown as PhilipsHueMotionSensorPayload).occupancy === true,
  }));

  // ---- State keys ----
  private readonly LIGHTS_ON_KEY = `${STATE_PREFIX}:lights_on`;
  private readonly ACTIVE_LAMPS_KEY = `${STATE_PREFIX}:active_lamps`;

  async onStart(): Promise<void> {
    // Build topic → sensor lookup for O(1) access in execute
    for (const sensor of this.SENSORS) {
      this.sensorByTopic.set(`zigbee2mqtt/${sensor.name}`, sensor);
    }

    // Recovery: if lights were left on from a previous run (state was persisted),
    // turn them off and reset state. The timer didn't survive the restart, so
    // we can't know how long they've been on — safest to turn them off.
    const wasOn = this.state.get<boolean>(this.LIGHTS_ON_KEY, false);
    const previousLamps = this.state.get<string[]>(this.ACTIVE_LAMPS_KEY) ?? [];

    if (wasOn && previousLamps.length > 0) {
      this.logger.info(
        { lamps: previousLamps },
        "Recovering from restart: turning off previously active lamps",
      );
      for (const name of previousLamps) {
        this.mqtt.publishToDevice(name, { state: "OFF" });
      }
      this.state.set(this.LIGHTS_ON_KEY, false);
      this.state.delete(this.ACTIVE_LAMPS_KEY);
    }
  }

  async execute(context: TriggerContext): Promise<void> {
    if (context.type !== "mqtt") return;

    const payload = context.payload as unknown as PhilipsHueMotionSensorPayload;
    const sensor = this.sensorByTopic.get(context.topic);

    if (!sensor) return;

    const lightsAreOn = this.state.get<boolean>(this.LIGHTS_ON_KEY, false);

    this.logger.debug({ sensor: sensor.name, lux: payload.illuminance }, "Motion detected");

    // Check lux threshold (skip if this sensor is affected and lights are on)
    const skipLux = sensor.luxAffectedByLights && lightsAreOn;
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
      // Still reset the timer if lights are on — use a short fallback duration
      if (lightsAreOn) {
        this.resetTurnOffTimer(60 * 1000); // 1 minute fallback
      }
      return;
    }

    const newLampNames = window.lamps.map((l) => l.name);
    const newLampSet = new Set(newLampNames);

    // Handle time window transition: turn off lamps that are no longer needed
    if (lightsAreOn) {
      const orphaned = this.getActiveLamps().filter((name) => !newLampSet.has(name));
      if (orphaned.length > 0) {
        this.logger.info({ orphaned }, "Time window changed, turning off orphaned lamps");
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

    // Turn on all lamps for this window with a 1-second transition
    for (const lamp of window.lamps) {
      this.mqtt.publishToDevice(lamp.name, {
        state: "ON",
        brightness: lamp.brightness,
        transition: 1,
      });
    }

    // Update shared state
    this.state.set(this.ACTIVE_LAMPS_KEY, newLampNames);
    this.state.set(this.LIGHTS_ON_KEY, true);

    // Reset the turn-off timer using this window's duration
    this.resetTurnOffTimer(window.durationMs);
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
   * Get the list of currently active lamp names from state.
   */
  private getActiveLamps(): string[] {
    return this.state.get<string[]>(this.ACTIVE_LAMPS_KEY) ?? [];
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
   *
   * @param durationMs How long to wait before turning off (from the active time window)
   */
  private resetTurnOffTimer(durationMs: number): void {
    if (this.turnOffTimer) {
      clearTimeout(this.turnOffTimer);
    }

    this.turnOffTimer = setTimeout(() => {
      this.logger.info("No recent motion, turning off lamps");
      for (const name of this.getActiveLamps()) {
        this.mqtt.publishToDevice(name, { state: "OFF" });
      }
      this.state.set(this.LIGHTS_ON_KEY, false);
      this.state.delete(this.ACTIVE_LAMPS_KEY);
      this.turnOffTimer = null;
    }, durationMs);
  }

  async onStop(): Promise<void> {
    if (this.turnOffTimer) {
      clearTimeout(this.turnOffTimer);
      this.turnOffTimer = null;
    }
  }
}
