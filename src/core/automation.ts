import type { Logger } from "pino";
import type { Config } from "../config.js";
import type { NotificationOptions, NotificationService } from "../types/notification.js";
import type { WeatherService } from "../types/weather.js";
import type { ZigbeeDevice } from "../types/zigbee/bridge.js";
import type { HttpClient } from "./http/http-client.js";
import type { MqttService } from "./mqtt/mqtt-service.js";
import type { NanoleafService } from "./services/nanoleaf-service.js";
import type { ServiceRegistry } from "./services/service-registry.js";
import type { ShellyService } from "./services/shelly-service.js";
import type { StateManager } from "./state/state-manager.js";
import type { DeviceRegistry } from "./zigbee/device-registry.js";

/**
 * Trigger types for automations.
 *
 * - mqtt:          Fires when a message is received on the given topic.
 *                  Use the Zigbee2MQTT friendly name as the topic suffix.
 *                  Supports MQTT wildcards (+ for single level, # for multi level).
 *                  An optional `filter` function can narrow which payloads trigger execution.
 *
 * - cron:          Fires on a cron schedule (e.g. "0 7 * * *" = daily at 7 AM).
 *
 * - state:         Fires when a state key changes value. Use this to react to state
 *                  changes made by other automations.
 *
 * - webhook:       Fires when an HTTP request is received on the configured path.
 *                  The endpoint is `POST /webhook/<path>` on the health server port.
 *                  Supports optional method restriction (default: POST only).
 *
 * - device_state:  Fires when a tracked Zigbee2MQTT device's state changes.
 *                  Requires `DEVICE_REGISTRY_ENABLED=true`. The trigger receives the
 *                  full merged device state and device metadata. An optional filter
 *                  function can narrow which state changes trigger execution.
 *
 * - device_joined: Fires when a Zigbee device joins the network (is added to the
 *                  device registry). Requires `DEVICE_REGISTRY_ENABLED=true`.
 *                  Optionally scoped to a specific friendly name.
 *
 * - device_left:   Fires when a Zigbee device leaves the network (is removed from
 *                  the device registry). Requires `DEVICE_REGISTRY_ENABLED=true`.
 *                  Optionally scoped to a specific friendly name.
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
    }
  | {
      type: "device_state";
      /** Zigbee2MQTT friendly name of the device to watch. */
      friendlyName: string;
      /**
       * Optional filter — return true to trigger, false to ignore.
       * Receives the full merged device state and the device metadata.
       */
      filter?: (state: Record<string, unknown>, device: ZigbeeDevice) => boolean;
    }
  | {
      type: "device_joined";
      /**
       * If provided, only fires when this specific device joins.
       * Omit to fire whenever any device joins the network.
       */
      friendlyName?: string;
    }
  | {
      type: "device_left";
      /**
       * If provided, only fires when this specific device leaves.
       * Omit to fire whenever any device leaves the network.
       */
      friendlyName?: string;
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
    }
  | {
      type: "device_state";
      /** The friendly name of the device whose state changed. */
      friendlyName: string;
      /** Full merged device state at the time the trigger fired. */
      state: Record<string, unknown>;
      /** The ZigbeeDevice metadata from the registry. */
      device: ZigbeeDevice;
    }
  | {
      type: "device_joined";
      /** The device that joined the network. */
      device: ZigbeeDevice;
    }
  | {
      type: "device_left";
      /** The device that left the network. */
      device: ZigbeeDevice;
    };

/**
 * Dependencies injected into every automation by the AutomationManager.
 *
 * Passed as a single context object to `_inject()` so that adding new
 * optional services in the future is a non-breaking extension.
 *
 * Optional services (notifications, weather, shelly, nanoleaf, and any custom
 * services) are available via `services.get<T>(key)`.
 */
export interface AutomationContext {
  mqtt: MqttService;
  http: HttpClient;
  state: StateManager;
  logger: Logger;
  config: Config;
  /**
   * `null` when `DEVICE_REGISTRY_ENABLED` is `false` (the default).
   * Enable via config to get automatic Zigbee2MQTT device discovery and state tracking.
   */
  deviceRegistry: DeviceRegistry | null;
  /**
   * The shared service registry.
   *
   * Use this to access any optional service registered with the engine,
   * including `shelly`, `nanoleaf`, or any custom service:
   *
   * ```ts
   * const shelly = this.services.get<ShellyService>("shelly");
   * if (shelly) await shelly.turnOn("plug");
   * ```
   */
  services: ServiceRegistry;
}

/**
 * Abstract base class for all automations.
 *
 * To create a new automation:
 * 1. Create a new file in src/automations/
 * 2. Export a class that extends Automation as the default export
 * 3. Implement `name`, `triggers`, and `execute`
 *
 * The base class provides access to:
 * - `this.mqtt`        - Publish messages and interact with Zigbee2MQTT devices
 * - `this.shelly`      - Shelly Gen 2 service (null unless registered with the engine)
 * - `this.nanoleaf`    - Nanoleaf service (null unless registered with the engine)
 * - `this.weather`     - Fetch weather data (null if no WeatherService is configured)
 * - `this.notify`      - Send push notifications (no-op if no NotificationService is configured)
 * - `this.state`       - Shared state manager (get/set/delete, persisted across restarts)
 * - `this.http`        - Make outbound HTTP requests
 * - `this.logger`      - Structured logger (child logger scoped to this automation)
 * - `this.config`      - Application configuration
 * - `this.services`    - Generic registry for any additional registered services
 *
 * @example
 * ```ts
 * import { Automation, type Trigger, type TriggerContext } from "../core/automation.js";
 * import type { OccupancyPayload } from "../types/zigbee/index.js";
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

  /**
   * Declare services that must be present when this automation starts.
   *
   * The `AutomationManager` checks every key listed here at registration time
   * (before `onStart` is called) and throws a descriptive error if any of them
   * are missing from the registry. This gives you fail-fast startup validation
   * instead of silent `null` surprises at the first trigger.
   *
   * Inside `execute()` you can then retrieve those services safely with
   * `this.require<T>(key)`, which is a non-null assertion (no `if` guard needed).
   *
   * Optional services that are NOT listed here continue to use
   * `this.services.get<T>(key)` with the usual null-check.
   *
   * @example
   * ```ts
   * readonly requiredServices = ["shelly"] as const;
   *
   * async execute(): Promise<void> {
   *   const shelly = this.require<ShellyService>("shelly");
   *   await shelly.turnOff("tv_plug");
   * }
   * ```
   */
  readonly requiredServices?: readonly string[];

  protected mqtt!: MqttService;
  protected http!: HttpClient;
  protected state!: StateManager;
  protected logger!: Logger;
  protected config!: Config;
  private deviceRegistryService: DeviceRegistry | null = null;
  private servicesRegistry!: ServiceRegistry;

  /**
   * Called by the AutomationManager to inject dependencies.
   * Do not call this yourself.
   */
  _inject(context: AutomationContext): void {
    this.mqtt = context.mqtt;
    this.http = context.http;
    this.state = context.state;
    this.logger = context.logger;
    this.config = context.config;
    this.deviceRegistryService = context.deviceRegistry;
    this.servicesRegistry = context.services;
  }

  /**
   * The Shelly service, or `null` if none was registered with the engine.
   *
   * Always null-check before use:
   *
   * @example
   * ```ts
   * const shelly = this.shelly;
   * if (!shelly) return;
   * await shelly.turnOn("my-plug");
   * ```
   */
  protected get shelly(): ShellyService | null {
    return this.servicesRegistry.get<ShellyService>("shelly");
  }

  /**
   * The Nanoleaf service, or `null` if none was registered with the engine.
   *
   * Always null-check before use:
   *
   * @example
   * ```ts
   * const nanoleaf = this.nanoleaf;
   * if (!nanoleaf) return;
   * await nanoleaf.turnOn("panels");
   * ```
   */
  protected get nanoleaf(): NanoleafService | null {
    return this.servicesRegistry.get<NanoleafService>("nanoleaf");
  }

  /**
   * The shared service registry.
   *
   * Use this to access any optional service registered with the engine,
   * including custom services not exposed as named getters.
   *
   * Three retrieval styles are available — choose the one that fits:
   *
   * **`get`** — nullable; you handle the absent case:
   * ```ts
   * const svc = this.services.get<MyService>("my-service");
   * if (!svc) return;
   * await svc.doSomething();
   * ```
   *
   * **`getOrThrow`** — throws if not registered (use for required services):
   * ```ts
   * const svc = this.services.getOrThrow<MyService>("my-service");
   * await svc.doSomething();
   * ```
   *
   * **`use`** — callback wrapper; no-ops when absent (best for one-liners):
   * ```ts
   * await this.services.use<MyService>("my-service", (s) => s.doSomething());
   * ```
   *
   * For services declared in `requiredServices`, prefer `this.require<T>(key)`
   * which is validated at startup and has a non-null return type.
   */
  protected get services(): ServiceRegistry {
    return this.servicesRegistry;
  }

  /**
   * Retrieve a service that was declared in `requiredServices`.
   *
   * The `AutomationManager` already verified at startup that this service is
   * registered, so this method never returns `null` — no null-check needed.
   *
   * Calling `require()` for a key that is **not** listed in `requiredServices`
   * is allowed but will throw at runtime if the service is absent, identical
   * to `this.services.getOrThrow(key)`.
   *
   * @example
   * ```ts
   * readonly requiredServices = ["shelly"] as const;
   *
   * async execute(): Promise<void> {
   *   const shelly = this.require<ShellyService>("shelly");
   *   await shelly.turnOff("tv_plug");
   * }
   * ```
   */
  protected require<T>(key: string): T {
    return this.servicesRegistry.getOrThrow<T>(key);
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
    const svc = this.servicesRegistry.get<NotificationService>("notifications");
    if (!svc) {
      this.logger.warn("notify() called but no notification service is configured");
      return;
    }
    await svc.send(options);
  }

  /**
   * The configured weather service, or `null` if none was provided to the engine.
   *
   * Always null-check before use:
   *
   * @example
   * ```ts
   * const weather = this.weather;
   * if (!weather) return;
   * const current = await weather.getCurrent();
   * const forecast = await weather.getForecast(3);
   * ```
   */
  protected get weather(): WeatherService | null {
    return this.servicesRegistry.get<WeatherService>("weather");
  }

  /**
   * The Zigbee2MQTT device registry, or `null` if disabled (`DEVICE_REGISTRY_ENABLED=false`).
   *
   * Always null-check before use:
   *
   * @example
   * ```ts
   * const registry = this.deviceRegistry;
   * if (!registry) return;
   * const device = registry.getDevice("my_sensor");
   * const state = registry.getDeviceState("my_sensor");
   * ```
   */
  protected get deviceRegistry(): DeviceRegistry | null {
    return this.deviceRegistryService;
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
