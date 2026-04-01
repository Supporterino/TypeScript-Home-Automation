import type { Logger } from "pino";
import type { Config } from "../config.js";
import type { WeatherService } from "../types/weather.js";
import type { HttpClient } from "./http-client.js";
import type { MqttService } from "./mqtt-service.js";
import type { NanoleafService } from "./nanoleaf-service.js";
import type { NotificationOptions, NotificationService } from "./notification-service.js";
import type { ShellyService } from "./shelly-service.js";
import type { StateManager } from "./state-manager.js";

/**
 * Trigger types for automations.
 *
 * - mqtt:  Fires when a message is received on the given topic.
 *          Use the Zigbee2MQTT friendly name as the topic suffix.
 *          Supports MQTT wildcards (+ for single level, # for multi level).
 *          An optional `filter` function can narrow which payloads trigger execution.
 *
 * - cron:  Fires on a cron schedule (e.g. "0 7 * * *" = daily at 7 AM).
 *
 * - state:   Fires when a state key changes value. Use this to react to state
 *            changes made by other automations.
 *
 * - webhook: Fires when an HTTP request is received on the configured path.
 *            The endpoint is `POST /webhook/<path>` on the health server port.
 *            Supports optional method restriction (default: POST only).
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
    }
  | {
      type: "state";
      /** The state key to watch. */
      key: string;
      /** Optional filter — return true to trigger, false to ignore. */
      filter?: (newValue: unknown, oldValue: unknown) => boolean;
    }
  | {
      type: "webhook";
      /**
       * URL path for the webhook (without leading slash).
       * The full endpoint will be `POST /webhook/<path>`.
       * Example: "deploy" → POST /webhook/deploy
       */
      path: string;
      /** HTTP methods to accept (default: ["POST"]). */
      methods?: ("GET" | "POST" | "PUT" | "DELETE")[];
    };

/**
 * Context passed to an automation's execute method.
 *
 * For MQTT triggers, contains the topic that fired and the parsed payload.
 * For cron triggers, contains the cron expression and the time it fired.
 * For state triggers, contains the key, new value, and old value.
 * For webhook triggers, contains the path, HTTP method, headers, query, and body.
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
    }
  | {
      type: "state";
      key: string;
      newValue: unknown;
      oldValue: unknown;
    }
  | {
      type: "webhook";
      /** The webhook path that was called. */
      path: string;
      /** The HTTP method used. */
      method: string;
      /** Request headers. */
      headers: Record<string, string>;
      /** URL query parameters. */
      query: Record<string, string>;
      /** Parsed request body (JSON object, or raw string). */
      body: unknown;
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
 * - `this.nanoleaf` - Control Nanoleaf light panels
 * - `this.weather` - Fetch weather data (if a WeatherService is configured)
 * - `this.notify` - Send push notifications (if a NotificationService is configured)
 * - `this.state`  - Shared state manager (get/set/delete, persisted across restarts)
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
  protected nanoleaf!: NanoleafService;
  protected http!: HttpClient;
  protected state!: StateManager;
  protected logger!: Logger;
  protected config!: Config;
  private notificationService: NotificationService | null = null;
  private weatherService: WeatherService | null = null;

  /**
   * Called by the AutomationManager to inject dependencies.
   * Do not call this yourself.
   */
  _inject(
    mqtt: MqttService,
    shelly: ShellyService,
    nanoleaf: NanoleafService,
    http: HttpClient,
    state: StateManager,
    logger: Logger,
    config: Config,
    notifications: NotificationService | null,
    weather: WeatherService | null,
  ): void {
    this.mqtt = mqtt;
    this.shelly = shelly;
    this.nanoleaf = nanoleaf;
    this.http = http;
    this.state = state;
    this.logger = logger;
    this.config = config;
    this.notificationService = notifications;
    this.weatherService = weather;
  }

  /**
   * Send a push notification via the configured notification service.
   *
   * If no notification service is configured on the engine, this logs a
   * warning and does nothing.
   *
   * @example
   * ```ts
   * await this.notify({
   *   title: "Door opened",
   *   message: "Front door was opened at 3 AM",
   *   priority: "urgent",
   *   tags: ["warning", "door"],
   * });
   * ```
   */
  protected async notify(options: NotificationOptions): Promise<void> {
    if (!this.notificationService) {
      this.logger.warn("notify() called but no notification service is configured");
      return;
    }
    await this.notificationService.send(options);
  }

  /**
   * Get the weather service. Returns the configured WeatherService or throws
   * if none is configured.
   *
   * @example
   * ```ts
   * const current = await this.weather.getCurrent();
   * const forecast = await this.weather.getForecast(3);
   * ```
   */
  protected get weather(): WeatherService {
    if (!this.weatherService) {
      throw new Error("weather accessed but no WeatherService is configured on the engine");
    }
    return this.weatherService;
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
