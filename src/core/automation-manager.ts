import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Logger } from "pino";
import type { Config } from "../config.js";
import { Automation, type TriggerContext } from "./automation.js";
import type { CronScheduler } from "./cron-scheduler.js";
import type { HttpClient } from "./http-client.js";
import type { HttpServer } from "./http-server.js";
import type { MqttMessageHandler, MqttService } from "./mqtt-service.js";
import type { NanoleafService } from "./nanoleaf-service.js";
import type { NotificationService } from "./notification-service.js";
import type { ShellyService } from "./shelly-service.js";
import type { StateChangeHandler, StateManager } from "./state-manager.js";

/**
 * Discovers, registers, and manages the lifecycle of all automations.
 *
 * On startup it scans the automations directory, dynamically imports each file,
 * and wires up the declared triggers (MQTT subscriptions, cron jobs,
 * state change listeners, and webhook endpoints).
 */
export class AutomationManager {
  private automations: Automation[] = [];
  /** Track MQTT handlers so we can cleanly unsubscribe on shutdown. */
  private mqttHandlers: Map<Automation, { topic: string; handler: MqttMessageHandler }[]> =
    new Map();
  /** Track state handlers so we can cleanly unsubscribe on shutdown. */
  private stateHandlers: Map<Automation, { key: string; handler: StateChangeHandler }[]> =
    new Map();
  /** Track webhook paths so we can cleanly remove on shutdown. */
  private webhookPaths: Map<Automation, string[]> = new Map();

  constructor(
    private readonly mqtt: MqttService,
    private readonly cron: CronScheduler,
    private readonly http: HttpClient,
    private readonly shelly: ShellyService,
    private readonly nanoleaf: NanoleafService,
    private readonly stateManager: StateManager,
    private readonly httpServer: HttpServer | null,
    private readonly notifications: NotificationService | null,
    private readonly config: Config,
    private readonly logger: Logger,
  ) {}

  /**
   * Discover and register all automations from the given directory.
   * Each file should have a default export that is a class extending Automation.
   *
   * @param automationsDir Path to the automations directory
   * @param recursive Whether to scan subdirectories recursively (default: false)
   */
  async discoverAndRegister(automationsDir: string, recursive = false): Promise<void> {
    const absoluteDir = resolve(automationsDir);
    this.logger.info({ dir: absoluteDir, recursive }, "Discovering automations");

    let files: string[];
    try {
      const entries = await readdir(absoluteDir, { recursive });
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
      this.nanoleaf,
      this.http,
      this.stateManager,
      childLogger,
      this.config,
      this.notifications,
    );

    const mqttHandlers: { topic: string; handler: MqttMessageHandler }[] = [];
    const stateHandlers: { key: string; handler: StateChangeHandler }[] = [];
    const webhookPaths: string[] = [];

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
      } else if (trigger.type === "webhook") {
        if (!this.httpServer) {
          childLogger.warn(
            { path: trigger.path },
            "Webhook trigger ignored — HTTP server disabled (set HTTP_PORT to enable)",
          );
          continue;
        }

        const methods = trigger.methods ?? ["POST"];
        this.httpServer.registerWebhook(trigger.path, methods, (ctx) => {
          childLogger.info({ path: trigger.path, method: ctx.method }, "Webhook trigger fired");
          return automation
            .execute({
              type: "webhook",
              path: trigger.path,
              method: ctx.method,
              headers: ctx.headers,
              query: ctx.query,
              body: ctx.body,
            })
            .catch((err) => {
              childLogger.error({ err, path: trigger.path }, "Automation execution failed");
            });
        });

        webhookPaths.push(trigger.path);
        childLogger.debug({ path: trigger.path, methods }, "Registered webhook trigger");
      }
    }

    this.mqttHandlers.set(automation, mqttHandlers);
    this.stateHandlers.set(automation, stateHandlers);
    this.webhookPaths.set(automation, webhookPaths);
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
   * Unsubscribes MQTT handlers, state handlers, webhook routes, stops cron jobs, and calls onStop.
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

      // Remove webhook routes
      const webhookP = this.webhookPaths.get(automation) ?? [];
      for (const path of webhookP) {
        this.httpServer?.removeWebhook(path);
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
    this.webhookPaths.clear();
    this.logger.info("All automations stopped");
  }

  // -------------------------------------------------------------------------
  // Query methods (used by debug API)
  // -------------------------------------------------------------------------

  /**
   * List all registered automations with their trigger summaries.
   */
  listAutomations(): { name: string; triggers: { type: string; [key: string]: unknown }[] }[] {
    return this.automations.map((auto) => this.serializeAutomation(auto));
  }

  /**
   * Get details for a single automation by name.
   * Returns null if not found.
   */
  getAutomation(
    name: string,
  ): { name: string; triggers: { type: string; [key: string]: unknown }[] } | null {
    const automation = this.automations.find((a) => a.name === name);
    if (!automation) return null;
    return this.serializeAutomation(automation);
  }

  /**
   * Serialize an automation's triggers for the debug API.
   */
  private serializeAutomation(auto: Automation): {
    name: string;
    triggers: { type: string; [key: string]: unknown }[];
  } {
    return {
      name: auto.name,
      triggers: auto.triggers.map((t) => {
        if (t.type === "mqtt") {
          return {
            type: "mqtt",
            topic: t.topic,
            hasFilter: !!t.filter,
            filterSource: t.filter?.toString(),
          };
        }
        if (t.type === "cron") {
          return { type: "cron", expression: t.expression };
        }
        if (t.type === "state") {
          return {
            type: "state",
            key: t.key,
            hasFilter: !!t.filter,
            filterSource: t.filter?.toString(),
          };
        }
        if (t.type === "webhook") {
          return { type: "webhook", path: t.path, methods: t.methods ?? ["POST"] };
        }
        return { type: (t as { type: string }).type };
      }),
    };
  }

  /**
   * Manually trigger an automation with a synthetic context.
   * Used by the debug API for testing automations without real device events.
   *
   * @param name Automation name
   * @param context The trigger context to pass to execute()
   * @returns true if the automation was found and triggered
   */
  async triggerAutomation(name: string, context: TriggerContext): Promise<boolean> {
    const automation = this.automations.find((a) => a.name === name);
    if (!automation) return false;

    this.logger.info({ automation: name, type: context.type }, "Manual trigger via debug API");
    await automation.execute(context);
    return true;
  }
}
