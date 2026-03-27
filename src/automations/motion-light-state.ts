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
 * Lamp profile: which lamps to turn on and for how long,
 * selected based on a boolean state key.
 */
interface LampProfile {
  /** Lamps to control when this profile is active. */
  lamps: LampTarget[];
  /** How long to keep lights on after last motion (in ms). */
  durationMs: number;
}

/**
 * Example: Motion-activated lights controlled by an external boolean state.
 *
 * A boolean state key (e.g. "night_mode") determines which set of lamps
 * to activate on motion. This automation does NOT control the boolean —
 * it only reads it. Another automation (or manual state.set() in your
 * entry point) is responsible for toggling it.
 *
 * Use case: a "night mode" toggle set by a cron automation, a remote
 * button, or Home Assistant. When night mode is on, motion activates a
 * dim nightlight. When off, motion activates the main ceiling lights
 * at full brightness.
 *
 * Features:
 * - Two lamp profiles selected by a boolean state key
 * - Lux threshold to avoid triggering in bright conditions
 * - Auto-off timer with per-profile duration
 * - 1-second turn-on transition
 * - Clean profile switching: if the boolean changes while lights are on,
 *   the next motion event applies the new profile and turns off orphaned lamps
 *
 * Example: pair with a cron automation that sets the boolean:
 * ```ts
 * // In another automation:
 * // At 22:00 → this.state.set("night_mode", true);
 * // At 07:00 → this.state.set("night_mode", false);
 * ```
 *
 * Adjust STATE_KEY, SENSOR_NAME, LUX_THRESHOLD, PROFILE_ON, and PROFILE_OFF
 * to match your setup.
 */
export default class MotionLightState extends Automation {
  readonly name = "motion-light-state";

  // ---- Configuration (adjust to your setup) ----

  /**
   * The boolean state key that selects which lamp profile to use.
   * This key is read-only from this automation's perspective — another
   * automation or the entry point is responsible for setting it.
   */
  private readonly STATE_KEY = "night_mode";

  /** Zigbee2MQTT friendly name of the motion sensor. */
  private readonly SENSOR_NAME = "hallway_motion_sensor";

  /** Only trigger when illuminance (lux) is below this value. */
  private readonly LUX_THRESHOLD = 30;

  /**
   * Whether the sensor's lux reading is affected by the lights
   * this automation controls. When true, lux check is skipped
   * while lights are already on.
   */
  private readonly LUX_SENSOR_AFFECTED_BY_LIGHTS = true;

  /**
   * Lamp profile used when the state key is `true`.
   * Example: night mode — dim nightlight only.
   */
  private readonly PROFILE_ON: LampProfile = {
    lamps: [{ name: "hallway_nightlight", brightness: 30 }],
    durationMs: 2 * 60 * 1000, // 2 minutes
  };

  /**
   * Lamp profile used when the state key is `false` (or not set).
   * Example: day mode — full ceiling lights.
   */
  private readonly PROFILE_OFF: LampProfile = {
    lamps: [
      { name: "hallway_ceiling", brightness: 254 },
      { name: "hallway_wall_light", brightness: 200 },
    ],
    durationMs: 5 * 60 * 1000, // 5 minutes
  };

  // ---- Internal state ----

  private turnOffTimer: ReturnType<typeof setTimeout> | null = null;
  private activeLamps: Set<string> = new Set();
  private lightsAreOn = false;

  readonly triggers: Trigger[] = [
    {
      type: "mqtt",
      topic: `zigbee2mqtt/${this.SENSOR_NAME}`,
      filter: (payload: Record<string, unknown>) =>
        (payload as unknown as PhilipsHueMotionSensorPayload).occupancy === true,
    },
  ];

  async execute(context: TriggerContext): Promise<void> {
    if (context.type !== "mqtt") return;

    const payload = context.payload as unknown as PhilipsHueMotionSensorPayload;

    // Check lux threshold (skip if sensor is affected and lights are on)
    if (!(this.LUX_SENSOR_AFFECTED_BY_LIGHTS && this.lightsAreOn)) {
      const lux = payload.illuminance ?? 0;
      if (lux >= this.LUX_THRESHOLD) {
        this.logger.debug(
          { lux, threshold: this.LUX_THRESHOLD },
          "Illuminance above threshold, ignoring motion",
        );
        return;
      }
    }

    // Read the boolean state to select the active profile
    const stateValue = this.state.get<boolean>(this.STATE_KEY, false);
    const profile = stateValue ? this.PROFILE_ON : this.PROFILE_OFF;
    const newLamps = new Set(profile.lamps.map((l) => l.name));

    this.logger.info(
      {
        stateKey: this.STATE_KEY,
        stateValue,
        lamps: profile.lamps.length,
        durationMs: profile.durationMs,
      },
      "Motion detected, applying lamp profile",
    );

    // Turn off orphaned lamps from a previous profile (e.g. boolean changed)
    if (this.lightsAreOn) {
      const orphaned = [...this.activeLamps].filter((name) => !newLamps.has(name));
      if (orphaned.length > 0) {
        this.logger.info({ orphaned }, "Profile changed, turning off orphaned lamps");
        for (const name of orphaned) {
          this.mqtt.publishToDevice(name, { state: "OFF" });
        }
      }
    }

    // Turn on all lamps for the active profile with a 1-second transition
    for (const lamp of profile.lamps) {
      this.mqtt.publishToDevice(lamp.name, {
        state: "ON",
        brightness: lamp.brightness,
        transition: 1,
      });
    }

    this.activeLamps = newLamps;
    this.lightsAreOn = true;

    // Reset the turn-off timer using this profile's duration
    this.resetTurnOffTimer(profile.durationMs);
  }

  /**
   * Reset the turn-off timer.
   */
  private resetTurnOffTimer(durationMs: number): void {
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
    }, durationMs);
  }

  async onStop(): Promise<void> {
    if (this.turnOffTimer) {
      clearTimeout(this.turnOffTimer);
      this.turnOffTimer = null;
    }
  }
}
