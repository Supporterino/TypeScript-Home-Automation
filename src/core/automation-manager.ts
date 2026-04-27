import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Logger } from "pino";
import type { Config } from "../config.js";
import type { NotificationService } from "../types/notification.js";
import type { WeatherService } from "../types/weather.js";
import { Automation, type AutomationContext, type TriggerContext } from "./automation.js";
import type { HttpClient } from "./http/http-client.js";
import type { HttpServer } from "./http/http-server.js";
import type { MqttMessageHandler, MqttService } from "./mqtt/mqtt-service.js";
import type { CronScheduler } from "./scheduling/cron-scheduler.js";
import type { ServiceRegistry } from "./services/service-registry.js";
import type { StateChangeHandler, StateManager } from "./state/state-manager.js";
import type {
  DeviceAddedHandler,
  DeviceRegistry,
  DeviceRemovedHandler,
  DeviceStateChangeHandler,
} from "./zigbee/device-registry.js";

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
  /** Track device state handlers so we can cleanly unsubscribe on shutdown. */
  private deviceStateHandlers: Map<
    Automation,
    { friendlyName: string; handler: DeviceStateChangeHandler }[]
  > = new Map();
  /** Track device-joined handlers so we can cleanly unsubscribe on shutdown. */
  private deviceJoinedHandlers: Map<Automation, DeviceAddedHandler[]> = new Map();
  /** Track device-left handlers so we can cleanly unsubscribe on shutdown. */
  private deviceLeftHandlers: Map<Automation, DeviceRemovedHandler[]> = new Map();

  constructor(
    private readonly mqtt: MqttService,
    private readonly cron: CronScheduler,
    private readonly http: HttpClient,
    private readonly stateManager: StateManager,
    private readonly httpServer: HttpServer | null,
    private readonly config: Config,
    private readonly logger: Logger,
    private readonly services: ServiceRegistry,
    private readonly deviceRegistry: DeviceRegistry | null,
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

    const context: AutomationContext = {
      mqtt: this.mqtt,
      http: this.http,
      state: this.stateManager,
      logger: childLogger,
      config: this.config,
      notifications: this.services.get<NotificationService>("notifications"),
      weather: this.services.get<WeatherService>("weather"),
      deviceRegistry: this.deviceRegistry,
      services: this.services,
    };
    automation._inject(context);

    const mqttHandlers: { topic: string; handler: MqttMessageHandler }[] = [];
    const stateHandlers: { key: string; handler: StateChangeHandler }[] = [];
    const webhookPaths: string[] = [];
    const deviceStateHandlers: { friendlyName: string; handler: DeviceStateChangeHandler }[] = [];
    const deviceJoinedHandlers: DeviceAddedHandler[] = [];
    const deviceLeftHandlers: DeviceRemovedHandler[] = [];

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
      } else if (trigger.type === "device_state") {
        if (!this.deviceRegistry) {
          childLogger.warn(
            { friendlyName: trigger.friendlyName },
            "device_state trigger ignored — device registry disabled (set DEVICE_REGISTRY_ENABLED=true to enable)",
          );
          continue;
        }

        const { friendlyName } = trigger;
        const handler: DeviceStateChangeHandler = (state, _prev) => {
          const device = this.deviceRegistry?.getDevice(friendlyName);
          if (!device) {
            childLogger.debug(
              { friendlyName },
              "device_state trigger fired but device not in registry — skipping",
            );
            return;
          }

          if (trigger.filter && !trigger.filter(state, device)) {
            return;
          }

          childLogger.info({ friendlyName }, "device_state trigger fired");
          automation.execute({ type: "device_state", friendlyName, state, device }).catch((err) => {
            childLogger.error({ err, friendlyName }, "Automation execution failed");
          });
        };

        this.deviceRegistry.onDeviceStateChange(friendlyName, handler);
        deviceStateHandlers.push({ friendlyName, handler });
        childLogger.debug({ friendlyName }, "Registered device_state trigger");
      } else if (trigger.type === "device_joined") {
        if (!this.deviceRegistry) {
          childLogger.warn(
            { friendlyName: trigger.friendlyName ?? "*" },
            "device_joined trigger ignored — device registry disabled (set DEVICE_REGISTRY_ENABLED=true to enable)",
          );
          continue;
        }

        const handler: DeviceAddedHandler = (device) => {
          if (trigger.friendlyName && device.friendly_name !== trigger.friendlyName) {
            return;
          }

          childLogger.info({ friendlyName: device.friendly_name }, "device_joined trigger fired");
          automation.execute({ type: "device_joined", device }).catch((err) => {
            childLogger.error(
              { err, friendlyName: device.friendly_name },
              "Automation execution failed",
            );
          });
        };

        this.deviceRegistry.onDeviceAdded(handler);
        deviceJoinedHandlers.push(handler);
        childLogger.debug(
          { friendlyName: trigger.friendlyName ?? "*" },
          "Registered device_joined trigger",
        );
      } else if (trigger.type === "device_left") {
        if (!this.deviceRegistry) {
          childLogger.warn(
            { friendlyName: trigger.friendlyName ?? "*" },
            "device_left trigger ignored — device registry disabled (set DEVICE_REGISTRY_ENABLED=true to enable)",
          );
          continue;
        }

        const handler: DeviceRemovedHandler = (device) => {
          if (trigger.friendlyName && device.friendly_name !== trigger.friendlyName) {
            return;
          }

          childLogger.info({ friendlyName: device.friendly_name }, "device_left trigger fired");
          automation.execute({ type: "device_left", device }).catch((err) => {
            childLogger.error(
              { err, friendlyName: device.friendly_name },
              "Automation execution failed",
            );
          });
        };

        this.deviceRegistry.onDeviceRemoved(handler);
        deviceLeftHandlers.push(handler);
        childLogger.debug(
          { friendlyName: trigger.friendlyName ?? "*" },
          "Registered device_left trigger",
        );
      }
    }

    this.mqttHandlers.set(automation, mqttHandlers);
    this.stateHandlers.set(automation, stateHandlers);
    this.webhookPaths.set(automation, webhookPaths);
    this.deviceStateHandlers.set(automation, deviceStateHandlers);
    this.deviceJoinedHandlers.set(automation, deviceJoinedHandlers);
    this.deviceLeftHandlers.set(automation, deviceLeftHandlers);
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

      // Unsubscribe device state handlers
      const deviceStateH = this.deviceStateHandlers.get(automation) ?? [];
      for (const { friendlyName, handler } of deviceStateH) {
        this.deviceRegistry?.offDeviceStateChange(friendlyName, handler);
      }

      // Unsubscribe device-joined handlers
      const deviceJoinedH = this.deviceJoinedHandlers.get(automation) ?? [];
      for (const handler of deviceJoinedH) {
        this.deviceRegistry?.offDeviceAdded(handler);
      }

      // Unsubscribe device-left handlers
      const deviceLeftH = this.deviceLeftHandlers.get(automation) ?? [];
      for (const handler of deviceLeftH) {
        this.deviceRegistry?.offDeviceRemoved(handler);
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
    this.deviceStateHandlers.clear();
    this.deviceJoinedHandlers.clear();
    this.deviceLeftHandlers.clear();
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
        if (t.type === "device_state") {
          return {
            type: "device_state",
            friendlyName: t.friendlyName,
            hasFilter: !!t.filter,
            filterSource: t.filter?.toString(),
          };
        }
        if (t.type === "device_joined") {
          return { type: "device_joined", friendlyName: t.friendlyName ?? "*" };
        }
        if (t.type === "device_left") {
          return { type: "device_left", friendlyName: t.friendlyName ?? "*" };
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
