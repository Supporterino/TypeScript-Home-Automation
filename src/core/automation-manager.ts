import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Logger } from "pino";
import type { Config } from "../config.js";
import { Automation } from "./automation.js";
import type { CronScheduler } from "./cron-scheduler.js";
import type { HttpClient } from "./http-client.js";
import type { MqttMessageHandler, MqttService } from "./mqtt-service.js";
import type { NotificationService } from "./notification-service.js";
import type { ShellyService } from "./shelly-service.js";
import type { StateChangeHandler, StateManager } from "./state-manager.js";

/**
 * Discovers, registers, and manages the lifecycle of all automations.
 *
 * On startup it scans the automations directory, dynamically imports each file,
 * and wires up the declared triggers (MQTT subscriptions, cron jobs, and
 * state change listeners).
 */
export class AutomationManager {
  private automations: Automation[] = [];
  /** Track MQTT handlers so we can cleanly unsubscribe on shutdown. */
  private mqttHandlers: Map<Automation, { topic: string; handler: MqttMessageHandler }[]> =
    new Map();
  /** Track state handlers so we can cleanly unsubscribe on shutdown. */
  private stateHandlers: Map<Automation, { key: string; handler: StateChangeHandler }[]> =
    new Map();

  constructor(
    private readonly mqtt: MqttService,
    private readonly cron: CronScheduler,
    private readonly http: HttpClient,
    private readonly shelly: ShellyService,
    private readonly stateManager: StateManager,
    private readonly notifications: NotificationService | null,
    private readonly config: Config,
    private readonly logger: Logger,
  ) {}

  /**
   * Discover and register all automations from the given directory.
   * Each file should have a default export that is a class extending Automation.
   */
  async discoverAndRegister(automationsDir: string): Promise<void> {
    const absoluteDir = resolve(automationsDir);
    this.logger.info({ dir: absoluteDir }, "Discovering automations");

    let files: string[];
    try {
      const entries = await readdir(absoluteDir);
      files = entries.filter(
        (f) => (f.endsWith(".ts") || f.endsWith(".js")) && !f.endsWith(".d.ts"),
      );
    } catch (err) {
      this.logger.error({ err, dir: absoluteDir }, "Failed to read automations directory");
      return;
    }

    if (files.length === 0) {
      this.logger.warn({ dir: absoluteDir }, "No automation files found");
      return;
    }

    for (const file of files) {
      const filePath = join(absoluteDir, file);
      try {
        const module = await import(filePath);
        const AutomationClass = module.default;

        if (
          !AutomationClass ||
          typeof AutomationClass !== "function" ||
          !(AutomationClass.prototype instanceof Automation)
        ) {
          this.logger.warn({ file }, "Skipping file - no valid Automation default export");
          continue;
        }

        const instance: Automation = new AutomationClass();
        await this.register(instance);
      } catch (err) {
        this.logger.error({ err, file }, "Failed to load automation");
      }
    }

    this.logger.info({ count: this.automations.length }, "Automations registered");
  }

  /**
   * Register a single automation instance.
   * Injects dependencies, wires up triggers, and calls onStart.
   */
  async register(automation: Automation): Promise<void> {
    const childLogger = this.logger.child({ automation: automation.name });

    automation._inject(
      this.mqtt,
      this.shelly,
      this.http,
      this.stateManager,
      childLogger,
      this.config,
      this.notifications,
    );

    const mqttHandlers: { topic: string; handler: MqttMessageHandler }[] = [];
    const stateHandlers: { key: string; handler: StateChangeHandler }[] = [];

    for (let i = 0; i < automation.triggers.length; i++) {
      const trigger = automation.triggers[i];

      if (trigger.type === "mqtt") {
        const handler: MqttMessageHandler = (topic, payload) => {
          if (trigger.filter && !trigger.filter(payload)) {
            return;
          }

          childLogger.info({ topic }, "MQTT trigger fired");
          automation.execute({ type: "mqtt", topic, payload }).catch((err) => {
            childLogger.error({ err, topic }, "Automation execution failed");
          });
        };

        this.mqtt.subscribe(trigger.topic, handler);
        mqttHandlers.push({ topic: trigger.topic, handler });
        childLogger.debug({ topic: trigger.topic }, "Registered MQTT trigger");
      } else if (trigger.type === "cron") {
        const jobId = `${automation.name}:cron:${i}`;
        this.cron.schedule(jobId, trigger.expression, () => {
          childLogger.info({ expression: trigger.expression }, "Cron trigger fired");
          automation
            .execute({
              type: "cron",
              expression: trigger.expression,
              firedAt: new Date(),
            })
            .catch((err) => {
              childLogger.error(
                { err, expression: trigger.expression },
                "Automation execution failed",
              );
            });
        });
        childLogger.debug({ expression: trigger.expression }, "Registered cron trigger");
      } else if (trigger.type === "state") {
        const handler: StateChangeHandler = (key, newValue, oldValue) => {
          if (trigger.filter && !trigger.filter(newValue, oldValue)) {
            return;
          }

          childLogger.info({ key }, "State trigger fired");
          automation.execute({ type: "state", key, newValue, oldValue }).catch((err) => {
            childLogger.error({ err, key }, "Automation execution failed");
          });
        };

        this.stateManager.onChange(trigger.key, handler);
        stateHandlers.push({ key: trigger.key, handler });
        childLogger.debug({ key: trigger.key }, "Registered state trigger");
      }
    }

    this.mqttHandlers.set(automation, mqttHandlers);
    this.stateHandlers.set(automation, stateHandlers);
    this.automations.push(automation);

    try {
      await automation.onStart();
    } catch (err) {
      childLogger.error({ err }, "Automation onStart failed");
    }

    childLogger.info("Automation registered");
  }

  /**
   * Gracefully stop all automations.
   * Unsubscribes MQTT handlers, state handlers, stops cron jobs, and calls onStop.
   */
  async stopAll(): Promise<void> {
    this.logger.info("Stopping all automations");

    for (const automation of this.automations) {
      // Unsubscribe MQTT handlers
      const mqttH = this.mqttHandlers.get(automation) ?? [];
      for (const { topic, handler } of mqttH) {
        this.mqtt.unsubscribe(topic, handler);
      }

      // Unsubscribe state handlers
      const stateH = this.stateHandlers.get(automation) ?? [];
      for (const { key, handler } of stateH) {
        this.stateManager.offChange(key, handler);
      }

      // Stop cron jobs for this automation
      this.cron.removeByPrefix(`${automation.name}:`);

      // Call lifecycle hook
      try {
        await automation.onStop();
      } catch (err) {
        this.logger.error({ err, automation: automation.name }, "Automation onStop failed");
      }
    }

    this.automations = [];
    this.mqttHandlers.clear();
    this.stateHandlers.clear();
    this.logger.info("All automations stopped");
  }
}
