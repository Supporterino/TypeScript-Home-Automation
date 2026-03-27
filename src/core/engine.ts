import pino, { type Logger } from "pino";
import { loadConfig, type Config } from "../config.js";
import { MqttService } from "./mqtt-service.js";
import { CronScheduler } from "./cron-scheduler.js";
import { HttpClient } from "./http-client.js";
import { ShellyService } from "./shelly-service.js";
import { StateManager, type StateManagerOptions } from "./state-manager.js";
import { HealthServer } from "./health-server.js";
import type { NotificationService } from "./notification-service.js";
import type { NtfyNotificationService } from "./ntfy-notification-service.js";
import { AutomationManager } from "./automation-manager.js";

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
   * If provided, automations can use `this.notify()` to send notifications.
   * If omitted, `this.notify()` will log a warning and do nothing.
   *
   * @example
   * ```ts
   * import { createEngine, NtfyNotificationService } from "ts-home-automation";
   *
   * const engine = createEngine({
   *   automationsDir: "...",
   *   notifications: new NtfyNotificationService({
   *     topic: "my-home-alerts",
   *   }),
   * });
   * ```
   */
  notifications?: NotificationService;

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

  // Create logger
  const logger =
    options.logger ??
    pino({
      level: config.logLevel,
      transport:
        process.env.NODE_ENV !== "production"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    });

  // Initialize core services
  const mqtt = new MqttService(config, logger.child({ service: "mqtt" }));
  const cron = new CronScheduler(logger.child({ service: "cron" }));
  const http = new HttpClient(logger.child({ service: "http" }));
  const shelly = new ShellyService(http, logger.child({ service: "shelly" }));
  const stateManager = new StateManager(
    logger.child({ service: "state" }),
    {
      persist: options.state?.persist ?? config.state.persist,
      filePath: options.state?.filePath ?? config.state.filePath,
    },
  );

  // Initialize optional notification service
  const notifications = options.notifications ?? null;
  if (notifications && "_inject" in notifications) {
    (notifications as NtfyNotificationService)._inject(
      http,
      logger.child({ service: "notifications" }),
    );
  }

  // Initialize optional health server
  const healthPort = config.health.port;
  const healthServer = healthPort > 0
    ? new HealthServer(healthPort, mqtt, logger.child({ service: "health" }))
    : null;

  const manager = new AutomationManager(
    mqtt,
    cron,
    http,
    shelly,
    stateManager,
    notifications,
    config,
    logger.child({ service: "manager" }),
  );

  let started = false;

  return {
    config,
    logger,
    mqtt,
    shelly,
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
      healthServer?.start();
      await stateManager.load();
      await mqtt.connect();
      await manager.discoverAndRegister(options.automationsDir);
      started = true;
      healthServer?.setEngineStarted(true);
      logger.info("Home Automation Engine is running");
    },

    async stop(): Promise<void> {
      if (!started) {
        return;
      }

      logger.info("Stopping Home Automation Engine");
      healthServer?.setEngineStarted(false);
      await manager.stopAll();
      cron.stopAll();
      await stateManager.save();
      await mqtt.disconnect();
      healthServer?.stop();
      started = false;
      logger.info("Home Automation Engine stopped");
    },
  };
}
