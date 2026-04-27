import pino, { type Logger, multistream } from "pino";
import { type Config, loadConfig } from "../config.js";
import type { NotificationService } from "../types/notification.js";
import type { WeatherService } from "../types/weather.js";
import { AutomationManager } from "./automation-manager.js";
import { HttpClient } from "./http/http-client.js";
import { HttpServer } from "./http/http-server.js";
import { LogBuffer } from "./logging/log-buffer.js";
import { MqttService } from "./mqtt/mqtt-service.js";
import { CronScheduler } from "./scheduling/cron-scheduler.js";
import type { NanoleafService } from "./services/nanoleaf-service.js";
import type { CoreContext } from "./services/service-plugin.js";
import { ServiceRegistry } from "./services/service-registry.js";
import type { ShellyService } from "./services/shelly-service.js";
import { StateManager, type StateManagerOptions } from "./state/state-manager.js";
import {
  type DeviceNiceNames,
  DeviceRegistry,
  type DeviceRegistryPersistenceOptions,
} from "./zigbee/device-registry.js";

/**
 * Factory function type for optional services.
 *
 * Receives the engine's shared `HttpClient` and a scoped `Logger` so the
 * service can use them without creating its own.
 *
 * @example
 * ```ts
 * notifications: (http, logger) =>
 *   new NtfyNotificationService({ topic: "alerts", http, logger }),
 * ```
 */
export type ServiceFactory<T> = (http: HttpClient, logger: Logger) => T;

/**
 * Options for creating an automation engine.
 *
 * All fields are optional — sensible defaults are derived from
 * environment variables (see `.env.example`).
 */
export interface EngineOptions {
  /**
   * Path to the directory containing automation files.
   * Each `.ts` / `.js` file should default-export a class extending `Automation`.
   */
  automationsDir: string;

  /**
   * Whether to scan subdirectories recursively for automation files.
   * When true, all `.ts` / `.js` files in subdirectories are also loaded.
   * Useful for organizing automations into folders (e.g. `lights/`, `sensors/`).
   *
   * @default false
   */
  recursive?: boolean;

  /**
   * Override the environment-derived config.
   * If omitted, config is loaded from environment variables.
   */
  config?: Partial<Config>;

  /**
   * Provide your own pino logger instance.
   * If omitted, a default logger is created based on the config log level.
   */
  logger?: Logger;

  /**
   * Optional notification service for sending push notifications.
   *
   * Can be a `NotificationService` instance or a factory function that
   * receives the engine's `HttpClient` and `Logger` for dependency injection.
   *
   * If provided, automations can use `this.notify()` to send notifications.
   * If omitted, `this.notify()` will log a warning and do nothing.
   *
   * @deprecated Pass via `services.notifications` instead.
   *
   * @example
   * ```ts
   * import { createEngine, NtfyNotificationService } from "ts-home-automation";
   *
   * const engine = createEngine({
   *   automationsDir: "...",
   *   services: {
   *     notifications: (http, logger) =>
   *       new NtfyNotificationService({ topic: "my-home-alerts", http, logger }),
   *   },
   * });
   * ```
   */
  notifications?: NotificationService | ServiceFactory<NotificationService>;

  /**
   * State manager options.
   *
   * Controls whether state is persisted to disk on shutdown and restored
   * on startup. State is always available in-memory regardless of this setting.
   *
   * @example
   * ```ts
   * const engine = createEngine({
   *   automationsDir: "...",
   *   state: {
   *     persist: true,
   *     filePath: "./data/state.json",
   *   },
   * });
   * ```
   */
  state?: StateManagerOptions;

  /**
   * Optional weather service for fetching weather data.
   * Accepts a `WeatherService` instance or a factory function.
   *
   * @deprecated Pass via `services.weather` instead.
   */
  weather?: WeatherService | ServiceFactory<WeatherService>;

  /**
   * Runtime options for the Zigbee2MQTT device registry.
   * Only relevant when `DEVICE_REGISTRY_ENABLED=true`.
   *
   * @example
   * ```ts
   * const engine = createEngine({
   *   automationsDir: "...",
   *   deviceRegistry: {
   *     names: {
   *       devices: {
   *         "kitchen_motion_0x1a2b": "Kitchen Motion Sensor",
   *       },
   *       transform: (name) => name.replace(/_/g, " "),
   *     },
   *   },
   * });
   * ```
   */
  deviceRegistry?: {
    /** Human-readable name mappings. Used by `registry.getNiceName()`. */
    names?: DeviceNiceNames;
    /**
     * Whether to persist the device list and state to disk on shutdown
     * and restore them on startup.
     *
     * @default false
     */
    persist?: boolean;
    /**
     * Path to the device registry JSON persistence file.
     *
     * @default "./device-registry.json"
     */
    filePath?: string;
  };

  /**
   * Optional services to register with the engine.
   *
   * Well-known service keys (`notifications`, `weather`, `shelly`, `nanoleaf`)
   * accept either a service instance or a `ServiceFactory` function. Additional
   * services can be registered under any custom key.
   *
   * Registered services are available to automations via `this.services.get<T>(key)`.
   * Well-known services (`shelly`, `nanoleaf`) are also accessible as typed getters
   * (`this.shelly`, `this.nanoleaf`) that return `T | null`.
   *
   * @example
   * ```ts
   * import { createEngine, ShellyService, NanoleafService } from "ts-home-automation";
   *
   * const engine = createEngine({
   *   automationsDir: "...",
   *   services: {
   *     shelly: (http, logger) => {
   *       const shelly = new ShellyService(http, logger);
   *       shelly.register("living_room_plug", "192.168.1.50");
   *       return shelly;
   *     },
   *     nanoleaf: (http, logger) =>
   *       new NanoleafService(http, logger),
   *     notifications: (http, logger) =>
   *       new NtfyNotificationService({ topic: "alerts", http, logger }),
   *   },
   * });
   * ```
   */
  services?: {
    notifications?: NotificationService | ServiceFactory<NotificationService>;
    weather?: WeatherService | ServiceFactory<WeatherService>;
    shelly?: ShellyService | ServiceFactory<ShellyService>;
    nanoleaf?: NanoleafService | ServiceFactory<NanoleafService>;
    /** Any additional custom services registered under arbitrary keys. */
    [key: string]: unknown;
  };
}

/**
 * A running automation engine. Returned by `createEngine()`.
 */
export interface Engine {
  /** Start the engine: connect to MQTT and register all automations. */
  start(): Promise<void>;

  /** Gracefully stop the engine: unregister automations, stop crons, disconnect MQTT. */
  stop(): Promise<void>;

  /** The resolved configuration. */
  readonly config: Config;

  /** The logger instance. */
  readonly logger: Logger;

  /** The MQTT service (for advanced usage). */
  readonly mqtt: MqttService;

  /**
   * The Shelly service, or `null` if not registered via `services.shelly`.
   *
   * @example
   * ```ts
   * engine.shelly?.register("plug", "192.168.1.50");
   * ```
   */
  readonly shelly: ShellyService | null;

  /**
   * The Nanoleaf service, or `null` if not registered via `services.nanoleaf`.
   */
  readonly nanoleaf: NanoleafService | null;

  /** The HTTP client (for advanced usage). */
  readonly http: HttpClient;

  /** The shared state manager. */
  readonly state: StateManager;

  /** The notification service (if configured). */
  readonly notifications: NotificationService | null;

  /** The shared service registry. Use this to access any registered optional service. */
  readonly services: ServiceRegistry;

  /** The automation manager (for advanced usage, e.g. manual registration). */
  readonly manager: AutomationManager;

  /**
   * The Zigbee2MQTT device registry.
   * `null` when `DEVICE_REGISTRY_ENABLED` is `false` (the default).
   */
  readonly deviceRegistry: DeviceRegistry | null;
}

/**
 * Create and configure an automation engine.
 *
 * This is the main entry point for using the framework as a package.
 *
 * @example
 * ```ts
 * import { createEngine } from "ts-home-automation";
 *
 * const engine = await createEngine({
 *   automationsDir: new URL("./automations", import.meta.url).pathname,
 * });
 *
 * await engine.start();
 * ```
 */
export function createEngine(options: EngineOptions): Engine {
  // Load and merge config
  const envConfig = loadConfig();
  const config: Config = {
    ...envConfig,
    ...options.config,
    mqtt: {
      ...envConfig.mqtt,
      ...options.config?.mqtt,
    },
  };

  // Create log buffer for debug API
  const logBuffer = new LogBuffer(2500);

  // Create logger with multistream (stdout + log buffer)
  const logger =
    options.logger ??
    (() => {
      const isProd = process.env.NODE_ENV === "production";
      const prettyStream = isProd
        ? process.stdout
        : pino.transport({ target: "pino-pretty", options: { colorize: true } });
      const streams = multistream([{ stream: prettyStream }, { stream: logBuffer }]);
      return pino({ level: config.logLevel }, streams);
    })();

  // Initialize core services
  const mqtt = new MqttService(config, logger.child({ service: "mqtt" }));
  const cron = new CronScheduler(logger.child({ service: "cron" }));
  const http = new HttpClient(logger.child({ service: "http" }));
  const stateManager = new StateManager(logger.child({ service: "state" }), {
    persist: options.state?.persist ?? config.state.persist,
    filePath: options.state?.filePath ?? config.state.filePath,
  });

  // ── Service registry ──────────────────────────────────────────────────────

  const serviceRegistry = new ServiceRegistry();

  /**
   * Resolve a service value that may be a direct instance or a factory function.
   * Returns `null` when the value is `undefined`.
   */
  function resolveService<T>(
    value: T | ServiceFactory<T> | undefined,
    serviceKey: string,
  ): T | null {
    if (value === undefined) return null;
    return typeof value === "function"
      ? (value as ServiceFactory<T>)(http, logger.child({ service: serviceKey }))
      : value;
  }

  // Backwards-compat: top-level `options.notifications` / `options.weather` are
  // deprecated aliases for `options.services.notifications` / `options.services.weather`.
  const notificationsValue = options.services?.notifications ?? options.notifications;
  const weatherValue = options.services?.weather ?? options.weather;
  const shellyValue = options.services?.shelly;
  const nanoleafValue = options.services?.nanoleaf;

  const notificationService = resolveService(notificationsValue, "notifications");
  const weatherService = resolveService(weatherValue, "weather");
  const shellyService = resolveService(shellyValue, "shelly");
  const nanoleafService = resolveService(nanoleafValue, "nanoleaf");

  if (notificationService) serviceRegistry.register("notifications", notificationService);
  if (weatherService) serviceRegistry.register("weather", weatherService);
  if (shellyService) serviceRegistry.register("shelly", shellyService);
  if (nanoleafService) serviceRegistry.register("nanoleaf", nanoleafService);

  // Register any additional custom services from the services map.
  if (options.services) {
    const WELL_KNOWN = new Set(["notifications", "weather", "shelly", "nanoleaf"]);
    for (const [key, value] of Object.entries(options.services)) {
      if (!WELL_KNOWN.has(key) && value !== undefined) {
        serviceRegistry.register(key, value);
      }
    }
  }

  // ── Device registry ───────────────────────────────────────────────────────

  const deviceRegistryPersistence: DeviceRegistryPersistenceOptions = {
    persist: options.deviceRegistry?.persist ?? config.deviceRegistry.persist,
    filePath: options.deviceRegistry?.filePath ?? config.deviceRegistry.filePath,
  };

  const deviceRegistry = config.deviceRegistry.enabled
    ? new DeviceRegistry(
        mqtt,
        config,
        logger.child({ service: "device-registry" }),
        options.deviceRegistry?.names,
        deviceRegistryPersistence,
      )
    : null;

  if (!deviceRegistry) {
    logger.info(
      "Device registry disabled (DEVICE_REGISTRY_ENABLED=false) — set to true to enable automatic device discovery",
    );
  }

  // ── HTTP server ───────────────────────────────────────────────────────────

  const httpServerPort = config.httpServer.port;
  const httpServer =
    httpServerPort > 0
      ? new HttpServer(
          httpServerPort,
          mqtt,
          config.httpServer.token,
          logger.child({ service: "http-server" }),
        )
      : null;

  if (!httpServer) {
    logger.info(
      "HTTP server disabled (HTTP_PORT=0) — health probes and webhook triggers unavailable",
    );
  }

  const manager = new AutomationManager(
    mqtt,
    cron,
    http,
    stateManager,
    httpServer,
    config,
    logger.child({ service: "manager" }),
    serviceRegistry,
    deviceRegistry,
  );

  let started = false;

  return {
    config,
    logger,
    mqtt,
    get shelly(): ShellyService | null {
      return serviceRegistry.get<ShellyService>("shelly");
    },
    get nanoleaf(): NanoleafService | null {
      return serviceRegistry.get<NanoleafService>("nanoleaf");
    },
    http,
    state: stateManager,
    get notifications(): NotificationService | null {
      return serviceRegistry.get<NotificationService>("notifications");
    },
    services: serviceRegistry,
    manager,
    deviceRegistry,

    async start(): Promise<void> {
      if (started) {
        logger.warn("Engine already started");
        return;
      }

      logger.info("Starting Home Automation Engine");
      httpServer?.setManagers(stateManager, manager, logBuffer);
      httpServer?.setDeviceRegistry(deviceRegistry);

      // Mount routes from service plugins before the server starts listening.
      if (httpServer) {
        httpServer.mountServiceRoutes(serviceRegistry);
      }

      // Mount web UI if enabled (imported lazily to keep it tree-shakeable)
      if (httpServer && config.httpServer.webUi.enabled) {
        const webUiPath = config.httpServer.webUi.path;
        await httpServer.mountWebUi(webUiPath, config.httpServer.token);
        logger.info({ path: webUiPath }, "Web UI enabled");
      }

      httpServer?.start();
      await stateManager.load();
      await deviceRegistry?.load();

      // Run onStart() lifecycle hooks for all registered ServicePlugins.
      const coreCtx: CoreContext = { http, logger };
      await serviceRegistry.startAll(coreCtx);

      await mqtt.connect();
      deviceRegistry?.start();
      const recursive = options.recursive ?? config.automations.recursive;
      await manager.discoverAndRegister(options.automationsDir, recursive);
      started = true;
      httpServer?.setEngineStarted(true);
      logger.info("Home Automation Engine is running");
    },

    async stop(): Promise<void> {
      if (!started) {
        return;
      }

      logger.info("Stopping Home Automation Engine");
      httpServer?.setEngineStarted(false);
      await manager.stopAll();
      cron.stopAll();

      // Run onStop() lifecycle hooks for all registered ServicePlugins.
      await serviceRegistry.stopAll();

      await deviceRegistry?.save();
      deviceRegistry?.stop();
      await stateManager.save();
      await mqtt.disconnect();
      httpServer?.stop();
      started = false;
      logger.info("Home Automation Engine stopped");
    },
  };
}
