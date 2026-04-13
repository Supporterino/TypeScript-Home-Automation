import pino, { type Logger, multistream } from "pino";
import { type Config, loadConfig } from "../config.js";
import type { WeatherService } from "../types/weather.js";
import { AutomationManager } from "./automation-manager.js";
import { CronScheduler } from "./cron-scheduler.js";
import { HttpClient } from "./http-client.js";
import { HttpServer } from "./http-server.js";
import { LogBuffer } from "./log-buffer.js";
import { MqttService } from "./mqtt-service.js";
import { NanoleafService } from "./nanoleaf-service.js";
import type { NotificationService } from "./notification-service.js";
import { ShellyService } from "./shelly-service.js";
import { StateManager, type StateManagerOptions } from "./state-manager.js";

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
   * @example
   * ```ts
   * import { createEngine, NtfyNotificationService } from "ts-home-automation";
   *
   * const engine = createEngine({
   *   automationsDir: "...",
   *   notifications: (http, logger) =>
   *     new NtfyNotificationService({ topic: "my-home-alerts", http, logger }),
   * });
   * ```
   */
  notifications?: NotificationService | ((http: HttpClient, logger: Logger) => NotificationService);

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
   */
  weather?: WeatherService | ((http: HttpClient, logger: Logger) => WeatherService);
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

  /** The Shelly service for controlling Shelly Gen 2 devices. */
  readonly shelly: ShellyService;

  /** The Nanoleaf service for controlling Nanoleaf light panels. */
  readonly nanoleaf: NanoleafService;

  /** The HTTP client (for advanced usage). */
  readonly http: HttpClient;

  /** The shared state manager. */
  readonly state: StateManager;

  /** The notification service (if configured). */
  readonly notifications: NotificationService | null;

  /** The automation manager (for advanced usage, e.g. manual registration). */
  readonly manager: AutomationManager;
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
  const shelly = new ShellyService(http, logger.child({ service: "shelly" }));
  const stateManager = new StateManager(logger.child({ service: "state" }), {
    persist: options.state?.persist ?? config.state.persist,
    filePath: options.state?.filePath ?? config.state.filePath,
  });

  const nanoleaf = new NanoleafService(http, logger.child({ service: "nanoleaf" }));

  // Initialize optional notification service
  let notifications: NotificationService | null = null;
  if (options.notifications) {
    notifications =
      typeof options.notifications === "function"
        ? options.notifications(http, logger.child({ service: "notifications" }))
        : options.notifications;
  }

  // Initialize optional weather service
  let weather: WeatherService | null = null;
  if (options.weather) {
    weather =
      typeof options.weather === "function"
        ? options.weather(http, logger.child({ service: "weather" }))
        : options.weather;
  }

  // Initialize HTTP server (health probes + webhooks)
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
    shelly,
    nanoleaf,
    stateManager,
    httpServer,
    notifications,
    weather,
    config,
    logger.child({ service: "manager" }),
  );

  let started = false;

  return {
    config,
    logger,
    mqtt,
    shelly,
    nanoleaf,
    http,
    state: stateManager,
    notifications,
    manager,

    async start(): Promise<void> {
      if (started) {
        logger.warn("Engine already started");
        return;
      }

      logger.info("Starting Home Automation Engine");
      httpServer?.setManagers(stateManager, manager, logBuffer);

      // Mount status page if enabled (imported lazily to keep it tree-shakeable)
      if (httpServer && config.httpServer.statusPage.enabled) {
        const { createStatusPageApp } = await import("./status-page/index.js");
        const statusPagePath = config.httpServer.statusPage.path;
        const statusPageApp = createStatusPageApp({
          stateManager,
          automationManager: manager,
          logBuffer,
          mqtt,
          token: config.httpServer.token,
          path: statusPagePath,
          getStartedAt: () => httpServer.startedAt,
        });
        httpServer.mountStatusPage(statusPageApp, statusPagePath);
        logger.info({ path: statusPagePath }, "Web status page enabled");
      }

      httpServer?.start();
      await stateManager.load();
      await mqtt.connect();
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
      await stateManager.save();
      await mqtt.disconnect();
      httpServer?.stop();
      started = false;
      logger.info("Home Automation Engine stopped");
    },
  };
}
