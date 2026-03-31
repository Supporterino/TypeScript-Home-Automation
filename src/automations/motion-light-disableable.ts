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
 * Configuration for a single motion sensor.
 */
interface MotionSensor {
  /** Zigbee2MQTT friendly name of the motion sensor. */
  name: string;
  /**
   * Whether this sensor's lux reading is affected by the lights this
   * automation controls.
   */
  luxAffectedByLights: boolean;
}

/**
 * Example: State-driven motion light with an enable/disable switch.
 *
 * Extends the state-driven motion light concept with a second boolean
 * state key that can disable the entire automation. When disabled,
 * motion is ignored and lamp control is released without turning
 * them off — allowing another automation to take over seamlessly.
 *
 * Two state keys control the behavior:
 * - `PROFILE_KEY` (e.g. "night_mode") — selects which lamp profile to use
 * - `ENABLED_KEY` (e.g. "motion_light_enabled") — enables/disables the automation
 *
 * This automation only READS both keys — other automations are responsible
 * for setting them (e.g. cron schedules, remote buttons, presence detection).
 *
 * Use cases for disabling:
 * - Movie mode: disable motion lights so they don't turn on during a film
 * - Away mode: disable when nobody is home
 * - Guest mode: disable in the guest room so lights don't auto-control
 * - Manual override: someone turned lights off manually, don't fight them
 *
 * Example: pair with other automations that control the state:
 * ```ts
 * // Cron automation:
 * // At 22:00 → this.state.set("night_mode", true);
 * // At 07:00 → this.state.set("night_mode", false);
 *
 * // Button automation:
 * // On press → this.state.set("motion_light_enabled", false);
 * // On double press → this.state.set("motion_light_enabled", true);
 * ```
 *
 * Adjust PROFILE_KEY, ENABLED_KEY, SENSORS, LUX_THRESHOLD, PROFILE_ON,
 * and PROFILE_OFF to match your setup.
 */
export default class MotionLightDisableable extends Automation {
  readonly name = "motion-light-disableable";

  // ---- Configuration (adjust to your setup) ----

  /**
   * Boolean state key that selects which lamp profile to use.
   * Read-only from this automation's perspective.
   */
  private readonly PROFILE_KEY = "night_mode";

  /**
   * Boolean state key that enables or disables this automation.
   * When `false`, motion is ignored and active lights are turned off.
   * Defaults to `true` (enabled) if not set.
   */
  private readonly ENABLED_KEY = "motion_light_enabled";

  /**
   * Motion sensors that trigger this automation.
   */
  private readonly SENSORS: MotionSensor[] = [
    { name: "hallway_entry_sensor", luxAffectedByLights: false },
    { name: "hallway_middle_sensor", luxAffectedByLights: true },
  ];

  /** Only trigger when illuminance (lux) is below this value. */
  private readonly LUX_THRESHOLD = 30;

  /**
   * Lamp profile used when the profile key is `true`.
   * Example: night mode — dim nightlight only.
   */
  private readonly PROFILE_ON: LampProfile = {
    lamps: [{ name: "hallway_nightlight", brightness: 30 }],
    durationMs: 2 * 60 * 1000, // 2 minutes
  };

  /**
   * Lamp profile used when the profile key is `false` (or not set).
   * Example: day mode — full ceiling lights.
   */
  private readonly PROFILE_OFF: LampProfile = {
    lamps: [
      { name: "hallway_ceiling", brightness: 254 },
      { name: "hallway_wall_light", brightness: 200 },
    ],
    durationMs: 5 * 60 * 1000, // 5 minutes
  };

  // ---- State keys ----
  private readonly LIGHTS_ON_KEY = "motion-light-disableable:lights_on";
  private readonly ACTIVE_LAMPS_KEY = "motion-light-disableable:active_lamps";

  // ---- Internal state ----

  private turnOffTimer: ReturnType<typeof setTimeout> | null = null;
  /** Map sensor topics to their configuration for quick lookup. */
  private readonly sensorByTopic: Map<string, MotionSensor> = new Map();

  readonly triggers: Trigger[] = [
    // MQTT triggers for each motion sensor
    ...this.SENSORS.map((sensor) => ({
      type: "mqtt" as const,
      topic: `zigbee2mqtt/${sensor.name}`,
      filter: (payload: Record<string, unknown>) =>
        (payload as unknown as PhilipsHueMotionSensorPayload).occupancy === true,
    })),
    // State trigger: react when the automation is disabled
    {
      type: "state" as const,
      key: this.ENABLED_KEY,
      filter: (newValue: unknown) => newValue === false,
    },
  ];

  async onStart(): Promise<void> {
    for (const sensor of this.SENSORS) {
      this.sensorByTopic.set(`zigbee2mqtt/${sensor.name}`, sensor);
    }

    // Recovery: if lights were left on from a previous run, turn them off
    const wasOn = this.state.get<boolean>(this.LIGHTS_ON_KEY, false);
    const previousLamps = this.getActiveLamps();

    if (wasOn && previousLamps.length > 0) {
      this.logger.info(
        { lamps: previousLamps },
        "Recovering from restart: turning off previously active lamps",
      );
      this.turnOffAllLamps();
    }
  }

  async execute(context: TriggerContext): Promise<void> {
    // Handle disable trigger: release control (another automation takes over)
    if (context.type === "state") {
      this.logger.info("Automation disabled, releasing lamp control");
      this.releaseLamps();
      return;
    }

    if (context.type !== "mqtt") return;

    // Check if automation is enabled
    const enabled = this.state.get<boolean>(this.ENABLED_KEY, true);
    if (!enabled) {
      this.logger.debug("Automation disabled, ignoring motion");
      return;
    }

    const payload = context.payload as unknown as PhilipsHueMotionSensorPayload;
    const sensor = this.sensorByTopic.get(context.topic);

    if (!sensor) return;

    // Check lux threshold (skip if this sensor is affected and lights are on)
    const lightsAreOn = this.state.get<boolean>(this.LIGHTS_ON_KEY, false);
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

    // Read the profile state to select the active profile
    const profileValue = this.state.get<boolean>(this.PROFILE_KEY, false);
    const profile = profileValue ? this.PROFILE_ON : this.PROFILE_OFF;
    const newLampNames = profile.lamps.map((l) => l.name);
    const newLampSet = new Set(newLampNames);

    this.logger.info(
      {
        sensor: sensor.name,
        profileKey: this.PROFILE_KEY,
        profileValue,
        lamps: profile.lamps.length,
        durationMs: profile.durationMs,
      },
      "Motion detected, applying lamp profile",
    );

    // Turn off orphaned lamps from a previous profile (e.g. profile changed)
    if (lightsAreOn) {
      const orphaned = this.getActiveLamps().filter((name) => !newLampSet.has(name));
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

    // Update shared state
    this.state.set(this.ACTIVE_LAMPS_KEY, newLampNames);
    this.state.set(this.LIGHTS_ON_KEY, true);

    // Reset the turn-off timer using this profile's duration
    this.resetTurnOffTimer(profile.durationMs);
  }

  /**
   * Release control of the lamps without turning them off.
   * Cancels the timer and clears state so another automation can take over.
   */
  private releaseLamps(): void {
    if (this.turnOffTimer) {
      clearTimeout(this.turnOffTimer);
      this.turnOffTimer = null;
    }
    this.state.set(this.LIGHTS_ON_KEY, false);
    this.state.delete(this.ACTIVE_LAMPS_KEY);
  }

  /**
   * Turn off all active lamps, cancel the timer, and reset state.
   */
  private turnOffAllLamps(): void {
    const activeLamps = this.getActiveLamps();
    for (const name of activeLamps) {
      this.mqtt.publishToDevice(name, { state: "OFF" });
    }
    this.releaseLamps();
  }

  /**
   * Get the list of currently active lamp names from state.
   */
  private getActiveLamps(): string[] {
    return this.state.get<string[]>(this.ACTIVE_LAMPS_KEY) ?? [];
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
      this.turnOffAllLamps();
    }, durationMs);
  }

  async onStop(): Promise<void> {
    if (this.turnOffTimer) {
      clearTimeout(this.turnOffTimer);
      this.turnOffTimer = null;
    }
  }
}
