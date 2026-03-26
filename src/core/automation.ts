import type { Logger } from "pino";
import type { MqttService } from "./mqtt-service.js";
import type { HttpClient } from "./http-client.js";
import type { ShellyService } from "./shelly-service.js";
import type { Config } from "../config.js";

/**
 * Trigger types for automations.
 *
 * - mqtt: Fires when a message is received on the given topic.
 *         Use the Zigbee2MQTT friendly name as the topic suffix.
 *         Supports MQTT wildcards (+ for single level, # for multi level).
 *         An optional `filter` function can narrow which payloads trigger execution.
 *
 * - cron: Fires on a cron schedule (e.g. "0 7 * * *" = daily at 7 AM).
 */
export type Trigger =
  | {
      type: "mqtt";
      topic: string;
      filter?: (payload: Record<string, unknown>) => boolean;
    }
  | {
      type: "cron";
      expression: string;
    };

/**
 * Context passed to an automation's execute method.
 *
 * For MQTT triggers, contains the topic that fired and the parsed payload.
 * For cron triggers, contains the cron expression and the time it fired.
 */
export type TriggerContext =
  | {
      type: "mqtt";
      topic: string;
      payload: Record<string, unknown>;
    }
  | {
      type: "cron";
      expression: string;
      firedAt: Date;
    };

/**
 * Abstract base class for all automations.
 *
 * To create a new automation:
 * 1. Create a new file in src/automations/
 * 2. Export a class that extends Automation as the default export
 * 3. Implement `name`, `triggers`, and `execute`
 *
 * The base class provides access to:
 * - `this.mqtt`   - Publish messages and interact with Zigbee2MQTT devices
 * - `this.shelly` - Control Shelly Gen 2 devices (plugs, switches)
 * - `this.http`   - Make outbound HTTP requests
 * - `this.logger` - Structured logger (child logger scoped to this automation)
 * - `this.config` - Application configuration
 *
 * @example
 * ```ts
 * import { Automation, type Trigger, type TriggerContext } from "../core/automation.js";
 * import type { OccupancyPayload } from "../types/zigbee.js";
 *
 * export default class MotionLight extends Automation {
 *   name = "motion-light";
 *
 *   triggers: Trigger[] = [
 *     {
 *       type: "mqtt",
 *       topic: "zigbee2mqtt/hallway_sensor",
 *       filter: (p) => (p as OccupancyPayload).occupancy === true,
 *     },
 *   ];
 *
 *   async execute(context: TriggerContext): Promise<void> {
 *     this.mqtt.publishToDevice("hallway_light", { state: "ON" });
 *   }
 * }
 * ```
 */
export abstract class Automation {
  /** Unique name identifying this automation. Used in logs and job IDs. */
  abstract readonly name: string;

  /** The trigger(s) that cause this automation to execute. */
  abstract readonly triggers: Trigger[];

  /** Injected services - set by AutomationManager before start. */
  protected mqtt!: MqttService;
  protected shelly!: ShellyService;
  protected http!: HttpClient;
  protected logger!: Logger;
  protected config!: Config;

  /**
   * Called by the AutomationManager to inject dependencies.
   * Do not call this yourself.
   */
  _inject(
    mqtt: MqttService,
    shelly: ShellyService,
    http: HttpClient,
    logger: Logger,
    config: Config,
  ): void {
    this.mqtt = mqtt;
    this.shelly = shelly;
    this.http = http;
    this.logger = logger;
    this.config = config;
  }

  /**
   * The automation logic. Called whenever one of the defined triggers fires.
   *
   * @param context Information about which trigger fired and its data.
   */
  abstract execute(context: TriggerContext): Promise<void>;

  /**
   * Optional lifecycle hook called when the automation is registered.
   * Override this to perform setup work (e.g. initialize state).
   */
  async onStart(): Promise<void> {}

  /**
   * Optional lifecycle hook called when the automation is stopped.
   * Override this to perform cleanup work (e.g. clear timers).
   */
  async onStop(): Promise<void> {}
}
