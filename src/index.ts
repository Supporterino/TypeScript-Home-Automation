import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pino from "pino";
import { loadConfig } from "./config.js";
import { MqttService } from "./core/mqtt-service.js";
import { CronScheduler } from "./core/cron-scheduler.js";
import { HttpClient } from "./core/http-client.js";
import { AutomationManager } from "./core/automation-manager.js";

const config = loadConfig();

const logger = pino({
  level: config.logLevel,
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});

logger.info("Starting Home Automation Engine");

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

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutdown signal received");
  await manager.stopAll();
  cron.stopAll();
  await mqtt.disconnect();
  logger.info("Shutdown complete");
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Start the engine
async function main(): Promise<void> {
  try {
    // Connect to MQTT broker
    await mqtt.connect();

    // Discover and register all automations
    const automationsDir = join(
      dirname(fileURLToPath(import.meta.url)),
      "automations",
    );
    await manager.discoverAndRegister(automationsDir);

    logger.info("Home Automation Engine is running");
  } catch (err) {
    logger.fatal({ err }, "Failed to start Home Automation Engine");
    process.exit(1);
  }
}

main();
