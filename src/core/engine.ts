import pino, { type Logger } from "pino";
import { loadConfig, type Config } from "../config.js";
import { MqttService } from "./mqtt-service.js";
import { CronScheduler } from "./cron-scheduler.js";
import { HttpClient } from "./http-client.js";
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

  /** The HTTP client (for advanced usage). */
  readonly http: HttpClient;

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
  const manager = new AutomationManager(
    mqtt,
    cron,
    http,
    config,
    logger.child({ service: "manager" }),
  );

  let started = false;

  return {
    config,
    logger,
    mqtt,
    http,
    manager,

    async start(): Promise<void> {
      if (started) {
        logger.warn("Engine already started");
        return;
      }

      logger.info("Starting Home Automation Engine");
      await mqtt.connect();
      await manager.discoverAndRegister(options.automationsDir);
      started = true;
      logger.info("Home Automation Engine is running");
    },

    async stop(): Promise<void> {
      if (!started) {
        return;
      }

      logger.info("Stopping Home Automation Engine");
      await manager.stopAll();
      cron.stopAll();
      await mqtt.disconnect();
      started = false;
      logger.info("Home Automation Engine stopped");
    },
  };
}
