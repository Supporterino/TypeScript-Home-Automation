import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Logger } from "pino";
import type { Config } from "../config.js";
import {
  Automation,
  type AutomationContext,
  type Trigger,
  type TriggerContext,
} from "./automation.js";
import type { HttpClient } from "./http/http-client.js";
import type { HttpServer } from "./http/http-server.js";
import type { MqttMessageHandler, MqttService } from "./mqtt/mqtt-service.js";
import { type ExecutionRecord, ExecutionRecorder } from "./observability/execution-recorder.js";
import { wireStateWriteAttribution } from "./observability/state-write-attribution.js";
import type { CronScheduler } from "./scheduling/cron-scheduler.js";
import type { ServiceRegistry } from "./services/service-registry.js";
import {
  INTERNAL_STATE_PREFIX,
  type StateChangeHandler,
  type StateManager,
} from "./state/state-manager.js";
import type {
  DeviceAddedHandler,
  DeviceRegistry,
  DeviceRemovedHandler,
  DeviceStateChangeHandler,
} from "./zigbee/device-registry.js";

/**
 * Reserved-namespace prefix under which each automation's enabled preference
 * is stored, keyed by automation name (design.md D20, D30).
 */
export const AUTOMATION_ENABLED_PREFIX = `${INTERNAL_STATE_PREFIX}automation-enabled:`;

/** Returns the reserved state key storing `name`'s enabled preference. */
export function automationEnabledKey(name: string): string {
  return `${AUTOMATION_ENABLED_PREFIX}${name}`;
}

/**
 * Derives a device name from an MQTT trigger's topic for relationship
 * reporting (design.md task 8.5). Every example automation subscribes to
 * `zigbee2mqtt/<friendly-name>` (per `Trigger`'s own "mqtt" doc comment); the
 * prefix is stripped when present so the reported name matches the one used
 * by device triggers, and the raw topic is reported unchanged otherwise,
 * since an MQTT trigger is not required to name a device at all.
 */
function stripZigbeeMqttPrefix(topic: string): string {
  const prefix = "zigbee2mqtt/";
  return topic.startsWith(prefix) ? topic.slice(prefix.length) : topic;
}

/** Result of a source-retrieval request, keyed by automation name only. */
export type AutomationSourceResult =
  | { status: "found"; source: string }
  | { status: "not_found" }
  | { status: "error"; message: string };

/** Result of a `start(name)` request. */
export type AutomationStartResult =
  | { status: "started" }
  | { status: "not_found" }
  | { status: "error"; message: string };

/** Result of a manual `triggerAutomation()` request. */
export type AutomationTriggerResult = "executed" | "not_found" | "disabled";

/**
 * A declared required service and whether it is currently registered
 * (design.md D11; task 8.5).
 */
export interface RequiredServiceStatus {
  name: string;
  registered: boolean;
}

/**
 * An automation's relationships, split into what is declared (and therefore
 * complete, without ever having run) and what has been observed at runtime
 * (and is therefore partial, growing only with use — design.md D11, R12;
 * task 8.5).
 */
export interface AutomationRelationships {
  declared: {
    requiredServices: RequiredServiceStatus[];
    /** Device names referenced by device and MQTT triggers. */
    relatedDevices: string[];
    /** State keys watched by state triggers. */
    watchedStateKeys: string[];
  };
  observed: {
    /** State keys observed being written, oldest-retained first. */
    writtenStateKeys: string[];
    /** `true` once the retained set has ever exceeded its bound (design.md R15). */
    truncated: boolean;
  };
}

/**
 * A discovered or directly-registered automation and its current lifecycle
 * state.
 *
 * `instance` is `null` while the automation is disabled: no triggers are
 * wired and no live instance exists to run — disabling is a full stop, not a
 * guard flag (design.md D4). `triggers` and `requiredServices` are cached
 * from the most recent instance so the automation remains listable (with its
 * declared triggers and relationships) while disabled.
 */
interface AutomationRecord {
  name: string;
  /** Path to the file this automation was loaded from, or `null` when it was
   * registered directly (bypassing discovery) and has no source file. */
  filePath: string | null;
  /** Constructor used to build a fresh instance on `start()`. */
  ctor: new () => Automation;
  /** Live, wired instance, or `null` when disabled. */
  instance: Automation | null;
  /** Declared triggers, cached across disable/enable cycles. */
  triggers: Trigger[];
  /** Declared required service keys, cached across disable/enable cycles. */
  requiredServices: readonly string[];
}

/**
 * Discovers, registers, and manages the lifecycle of all automations.
 *
 * On startup it scans the automations directory, dynamically imports each file,
 * and wires up the declared triggers (MQTT subscriptions, cron jobs,
 * state change listeners, and webhook endpoints).
 */
export class AutomationManager {
  private records: AutomationRecord[] = [];
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

  /**
   * Execution history, observed state writes, and completion broadcasts for
   * every automation (design.md D11). Exposed for the observability
   * endpoints (task 8.6), the realtime event stream (task 8.7), and the
   * Prometheus counters (task 8.8) via {@link getExecutionRecorder}.
   */
  private readonly executionRecorder: ExecutionRecorder;

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
    executionRecorder?: ExecutionRecorder,
  ) {
    this.executionRecorder =
      executionRecorder ?? new ExecutionRecorder(logger.child({ service: "execution-recorder" }));
    // Attributes state writes made during an automation's execute() to that
    // automation, without any change to StateManager itself (design.md D11;
    // task 8.2). Lives for the manager's lifetime — there is exactly one
    // manager per engine, so this is never unwired.
    wireStateWriteAttribution(this.stateManager, this.executionRecorder);
  }

  /**
   * The shared execution recorder, for wiring the realtime event stream's
   * `automation_execution` category and the Prometheus execution/failure
   * counters (design.md D18; tasks 8.7, 8.8).
   */
  getExecutionRecorder(): ExecutionRecorder {
    return this.executionRecorder;
  }

  /**
   * Runs `automation.execute(context)` inside the execution context,
   * recording its outcome (design.md D11; tasks 8.1, 8.3). Shared by every
   * trigger dispatch path and by `triggerAutomation()`, so every run — MQTT,
   * cron, state, webhook, device, and manual — is recorded identically.
   */
  private runExecution(automation: Automation, context: TriggerContext): Promise<void> {
    return this.executionRecorder.run(automation.name, context, () => automation.execute(context));
  }

  /**
   * Discover and register all automations from the given directory.
   * Each file should have a default export that is a class extending Automation.
   *
   * A discovered automation whose stored preference is disabled is
   * registered — listed by the query API — but has no triggers wired and no
   * `onStart()` invoked (design.md D4, D20).
   *
   * @param automationsDir Path to the automations directory
   * @param recursive Whether to scan subdirectories recursively (default: false)
   */
  async discoverAndRegister(automationsDir: string, recursive = false): Promise<void> {
    const absoluteDir = resolve(automationsDir);
    this.logger.info({ dir: absoluteDir, recursive }, "Discovering automations");

    let files: string[] = [];
    try {
      const entries = await readdir(absoluteDir, { recursive });
      files = entries.filter(
        (f) => (f.endsWith(".ts") || f.endsWith(".js")) && !f.endsWith(".d.ts"),
      );
    } catch (err) {
      this.logger.error({ err, dir: absoluteDir }, "Failed to read automations directory");
    }

    if (files.length === 0) {
      this.logger.warn({ dir: absoluteDir }, "No automation files found");
    }

    // Names successfully discovered this scan — used to decide which stored
    // enabled preferences are stale (design.md D30). An empty set here is
    // indistinguishable from an unreadable or unmounted directory, so the
    // reap below is skipped entirely rather than run against it.
    const discoveredNames = new Set<string>();

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

        if (this.records.some((r) => r.name === instance.name)) {
          this.logger.warn(
            { file, automation: instance.name },
            `Duplicate automation name "${instance.name}" — skipping`,
          );
          continue;
        }

        discoveredNames.add(instance.name);

        const enabled = this.stateManager.get<boolean>(automationEnabledKey(instance.name), true);
        if (enabled) {
          await this.register(instance, { filePath });
        } else {
          this.records.push({
            name: instance.name,
            filePath,
            ctor: AutomationClass,
            instance: null,
            triggers: instance.triggers,
            requiredServices: instance.requiredServices ?? [],
          });
          this.logger.info(
            { automation: instance.name },
            "Automation registered disabled per stored preference",
          );
        }
      } catch (err) {
        this.logger.error({ err, file }, "Failed to load automation");
      }
    }

    if (discoveredNames.size > 0) {
      this.reapStaleEnabledPreferences(discoveredNames);
    }

    this.logger.info(
      { count: this.records.filter((r) => r.instance).length },
      "Automations registered",
    );
  }

  /**
   * Discards stored enabled preferences naming no discovered automation,
   * logging each at warning level (design.md D30). Callers MUST only invoke
   * this when discovery yielded at least one automation — an empty scan is
   * indistinguishable from an unreadable directory, and reaping on it would
   * re-enable every deliberately disabled automation on the next start.
   */
  private reapStaleEnabledPreferences(discoveredNames: Set<string>): void {
    const keys = this.stateManager.keysInternal(AUTOMATION_ENABLED_PREFIX);
    for (const key of keys) {
      const name = key.slice(AUTOMATION_ENABLED_PREFIX.length);
      if (!discoveredNames.has(name)) {
        this.stateManager.deleteInternal(key);
        this.logger.warn(
          { automation: name },
          "Discarding stale automation enabled preference — automation no longer discovered",
        );
      }
    }
  }

  /**
   * Register a single automation instance.
   * Injects dependencies, wires up triggers, and calls onStart.
   *
   * A name that names an existing but currently disabled record is not a
   * duplicate — the record is replaced in place (task 3.6).
   */
  async register(automation: Automation, options?: { filePath?: string }): Promise<void> {
    // Detect duplicate *active* automation names (would cause cron job ID
    // collisions). A disabled record for the same name is not a duplicate.
    const existingIdx = this.records.findIndex((r) => r.name === automation.name);
    if (existingIdx !== -1 && this.records[existingIdx].instance) {
      throw new Error(
        `Duplicate automation name "${automation.name}". ` +
          `Each automation must have a unique name.`,
      );
    }

    automation._inject(this.buildContext(automation));

    // Validate required services before calling onStart.
    this.validateRequiredServices(automation);

    const childLogger = this.logger.child({ automation: automation.name });

    try {
      await this.wireAndStart(automation);
    } catch (err) {
      childLogger.error({ err }, "Automation onStart failed — unregistering");
      if (existingIdx !== -1) this.records.splice(existingIdx, 1);
      return;
    }

    const filePath =
      options?.filePath ?? (existingIdx !== -1 ? this.records[existingIdx].filePath : null);
    const record: AutomationRecord = {
      name: automation.name,
      filePath,
      ctor: automation.constructor as new () => Automation,
      instance: automation,
      triggers: automation.triggers,
      requiredServices: automation.requiredServices ?? [],
    };

    if (existingIdx !== -1) {
      this.records[existingIdx] = record;
    } else {
      this.records.push(record);
    }

    childLogger.info("Automation registered");
  }

  /**
   * Disable an automation by name: deregisters every trigger and invokes
   * `onStop()`, then discards the live instance (design.md D4). Persists the
   * disabled preference under the reserved namespace (design.md D20).
   *
   * A no-op, without side effects, when the automation is already disabled.
   */
  async stop(name: string): Promise<"stopped" | "not_found"> {
    const record = this.records.find((r) => r.name === name);
    if (!record) return "not_found";
    if (!record.instance) return "stopped"; // already disabled — no-op

    await this.unwireAndStop(record.instance);
    record.instance = null;
    this.stateManager.setInternal(automationEnabledKey(name), false);
    return "stopped";
  }

  /**
   * Enable a previously disabled automation by name: re-imports its source
   * file with a cache-busting suffix, constructs a fresh instance, validates
   * required services, wires triggers in declared order, and invokes
   * `onStart()` (design.md D4, D5).
   *
   * A no-op, without side effects, when the automation is already enabled.
   * A failed enable unwinds any partially wired triggers and leaves the
   * automation disabled, reporting a descriptive error (task 3.6).
   */
  async start(name: string): Promise<AutomationStartResult> {
    const record = this.records.find((r) => r.name === name);
    if (!record) return { status: "not_found" };
    if (record.instance) return { status: "started" }; // already enabled — no-op

    let ctor = record.ctor;
    if (record.filePath) {
      try {
        const cacheBustedUrl = `${pathToFileURL(record.filePath).href}?t=${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const module = await import(cacheBustedUrl);
        const AutomationClass = module.default;
        if (
          !AutomationClass ||
          typeof AutomationClass !== "function" ||
          !(AutomationClass.prototype instanceof Automation)
        ) {
          return {
            status: "error",
            message: `"${record.filePath}" no longer exports a valid Automation`,
          };
        }
        ctor = AutomationClass;
      } catch (err) {
        return {
          status: "error",
          message: `Failed to reload automation "${name}": ${(err as Error).message}`,
        };
      }
    }

    const instance = new ctor();
    instance._inject(this.buildContext(instance));

    try {
      this.validateRequiredServices(instance);
      this.assertNoWebhookConflict(instance);
    } catch (err) {
      return { status: "error", message: (err as Error).message };
    }

    try {
      await this.wireAndStart(instance);
    } catch (err) {
      // wireAndStart() has already unwound any partially wired triggers.
      return { status: "error", message: (err as Error).message };
    }

    record.instance = instance;
    record.ctor = ctor;
    record.triggers = instance.triggers;
    record.requiredServices = instance.requiredServices ?? [];
    this.stateManager.setInternal(automationEnabledKey(name), true);
    return { status: "started" };
  }

  /**
   * Wire every declared trigger for `automation` and invoke `onStart()`.
   * Shared by `register()` and `start()`.
   *
   * If `onStart()` throws, any triggers wired during this call are unwound
   * and `onStop()` is invoked best-effort before the error is rethrown to
   * the caller — the caller decides what "stopped" means for its record.
   */
  private async wireAndStart(automation: Automation): Promise<void> {
    const childLogger = this.logger.child({ automation: automation.name });

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
          this.runExecution(automation, { type: "mqtt", topic, payload }).catch((err) => {
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
          this.runExecution(automation, {
            type: "cron",
            expression: trigger.expression,
            firedAt: new Date(),
          }).catch((err) => {
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
          this.runExecution(automation, { type: "state", key, newValue, oldValue }).catch((err) => {
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
          return this.runExecution(automation, {
            type: "webhook",
            path: trigger.path,
            method: ctx.method,
            headers: ctx.headers,
            query: ctx.query,
            body: ctx.body,
          }).catch((err) => {
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
          this.runExecution(automation, {
            type: "device_state",
            friendlyName,
            state,
            device,
          }).catch((err) => {
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
          this.runExecution(automation, { type: "device_joined", device }).catch((err) => {
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
          this.runExecution(automation, { type: "device_left", device }).catch((err) => {
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

    try {
      await automation.onStart();
    } catch (err) {
      // Release everything just wired, plus anything the partial onStart()
      // created, before reporting the failure to the caller.
      await this.unwireAndStop(automation);
      throw err;
    }
  }

  /**
   * Deregister every trigger wired for `automation` — MQTT subscriptions,
   * cron jobs, state listeners, webhook routes, and device joined/left/state
   * listeners — then invoke `onStop()` best-effort. Shared by the
   * onStart-failure rollback, `stop()`, and `stopAll()` (tasks 3.2, 3.3).
   *
   * Errors from `onStop()` are logged and swallowed; the automation is
   * considered stopped regardless (design.md R18/D4).
   */
  private async unwireAndStop(automation: Automation): Promise<void> {
    const mqttH = this.mqttHandlers.get(automation) ?? [];
    for (const { topic, handler } of mqttH) {
      this.mqtt.unsubscribe(topic, handler);
    }

    const stateH = this.stateHandlers.get(automation) ?? [];
    for (const { key, handler } of stateH) {
      this.stateManager.offChange(key, handler);
    }

    const webhookP = this.webhookPaths.get(automation) ?? [];
    for (const path of webhookP) {
      this.httpServer?.removeWebhook(path);
    }

    const deviceStateH = this.deviceStateHandlers.get(automation) ?? [];
    for (const { friendlyName, handler } of deviceStateH) {
      this.deviceRegistry?.offDeviceStateChange(friendlyName, handler);
    }

    const deviceJoinedH = this.deviceJoinedHandlers.get(automation) ?? [];
    for (const handler of deviceJoinedH) {
      this.deviceRegistry?.offDeviceAdded(handler);
    }

    const deviceLeftH = this.deviceLeftHandlers.get(automation) ?? [];
    for (const handler of deviceLeftH) {
      this.deviceRegistry?.offDeviceRemoved(handler);
    }

    this.cron.removeByPrefix(`${automation.name}:`);

    this.mqttHandlers.delete(automation);
    this.stateHandlers.delete(automation);
    this.webhookPaths.delete(automation);
    this.deviceStateHandlers.delete(automation);
    this.deviceJoinedHandlers.delete(automation);
    this.deviceLeftHandlers.delete(automation);

    try {
      await automation.onStop();
    } catch (err) {
      this.logger.error({ err, automation: automation.name }, "Automation onStop failed");
    }
  }

  /**
   * Throws a descriptive error, before any wiring occurs, when `automation`
   * declares a webhook trigger whose path is already claimed by a different,
   * currently active automation — leaving the existing route intact
   * (design.md D5; task 3.7).
   */
  private assertNoWebhookConflict(automation: Automation): void {
    const claimedBy = new Map<string, string>();
    for (const [other, paths] of this.webhookPaths) {
      for (const path of paths) claimedBy.set(path, other.name);
    }

    for (const trigger of automation.triggers) {
      if (trigger.type !== "webhook") continue;
      const owner = claimedBy.get(trigger.path);
      if (owner && owner !== automation.name) {
        throw new Error(
          `Cannot start automation "${automation.name}": webhook path "${trigger.path}" ` +
            `is already claimed by automation "${owner}"`,
        );
      }
    }
  }

  private validateRequiredServices(automation: Automation): void {
    if (!automation.requiredServices) return;
    for (const key of automation.requiredServices) {
      if (!this.services.has(key)) {
        throw new Error(
          `Automation "${automation.name}" requires service "${key}" but it is not registered. ` +
            `Pass it via the services map in createEngine().`,
        );
      }
    }
  }

  private buildContext(automation: Automation): AutomationContext {
    return {
      mqtt: this.mqtt,
      http: this.http,
      state: this.stateManager,
      logger: this.logger.child({ automation: automation.name }),
      config: this.config,
      deviceRegistry: this.deviceRegistry,
      services: this.services,
    };
  }

  /**
   * Gracefully stop all automations.
   * Unsubscribes MQTT handlers, state handlers, webhook routes, stops cron jobs, and calls onStop.
   */
  async stopAll(): Promise<void> {
    this.logger.info("Stopping all automations");

    for (const record of this.records) {
      if (record.instance) {
        await this.unwireAndStop(record.instance);
        record.instance = null;
      }
    }

    this.records = [];
    this.logger.info("All automations stopped");
  }

  // -------------------------------------------------------------------------
  // Query methods (used by debug API)
  // -------------------------------------------------------------------------

  /**
   * List all registered automations with their trigger summaries.
   */
  listAutomations(): {
    name: string;
    enabled: boolean;
    triggers: { type: string; [key: string]: unknown }[];
  }[] {
    return this.records.map((record) => this.serializeAutomation(record));
  }

  /**
   * Get details for a single automation by name.
   * Returns null if not found.
   */
  getAutomation(name: string): {
    name: string;
    enabled: boolean;
    triggers: { type: string; [key: string]: unknown }[];
  } | null {
    const record = this.records.find((r) => r.name === name);
    if (!record) return null;
    return this.serializeAutomation(record);
  }

  /**
   * Return `name`'s retained execution history, most recent first, or
   * `null` for an unknown automation — distinct from an automation that is
   * known but has never run, which returns an empty array (design.md D11;
   * task 8.3).
   */
  getHistory(name: string): ExecutionRecord[] | null {
    const record = this.records.find((r) => r.name === name);
    if (!record) return null;
    return this.executionRecorder.getHistory(name);
  }

  /**
   * Return `name`'s declared and observed relationships, or `null` for an
   * unknown automation (design.md D11; task 8.5).
   *
   * Declared relationships — required services (with current registration
   * status), devices referenced by device and MQTT triggers, and state keys
   * watched by state triggers — are derived from the automation's
   * declarations, so they are reported in full even if it has never run.
   * Observed writes are runtime attribution and therefore partial, growing
   * only with use (design.md R12).
   */
  getRelationships(name: string): AutomationRelationships | null {
    const record = this.records.find((r) => r.name === name);
    if (!record) return null;

    const requiredServices: RequiredServiceStatus[] = record.requiredServices.map((key) => ({
      name: key,
      registered: this.services.has(key),
    }));

    const relatedDevices = new Set<string>();
    const watchedStateKeys = new Set<string>();
    for (const trigger of record.triggers) {
      if (trigger.type === "mqtt") {
        relatedDevices.add(stripZigbeeMqttPrefix(trigger.topic));
      } else if (trigger.type === "device_state") {
        relatedDevices.add(trigger.friendlyName);
      } else if (trigger.type === "device_joined" || trigger.type === "device_left") {
        if (trigger.friendlyName) relatedDevices.add(trigger.friendlyName);
      } else if (trigger.type === "state") {
        watchedStateKeys.add(trigger.key);
      }
    }

    const observedWrites = this.executionRecorder.getObservedWrites(name);

    return {
      declared: {
        requiredServices,
        relatedDevices: [...relatedDevices],
        watchedStateKeys: [...watchedStateKeys],
      },
      observed: {
        writtenStateKeys: observedWrites.keys,
        truncated: observedWrites.truncated,
      },
    };
  }

  /**
   * Return the current contents of the file `name` was loaded from,
   * addressed strictly by automation name — a caller-supplied path is never
   * accepted (design.md D5; task 3.10).
   */
  async getSource(name: string): Promise<AutomationSourceResult> {
    const record = this.records.find((r) => r.name === name);
    if (!record) return { status: "not_found" };
    if (!record.filePath) {
      return { status: "error", message: `Automation "${name}" has no associated source file` };
    }

    try {
      const source = await readFile(record.filePath, "utf-8");
      return { status: "found", source };
    } catch (err) {
      return {
        status: "error",
        message: `Failed to read source for automation "${name}": ${(err as Error).message}`,
      };
    }
  }

  /**
   * Serialize an automation's triggers for the debug API.
   */
  private serializeAutomation(record: AutomationRecord): {
    name: string;
    enabled: boolean;
    triggers: { type: string; [key: string]: unknown }[];
  } {
    return {
      name: record.name,
      enabled: record.instance !== null,
      triggers: record.triggers.map((t) => {
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
   * A disabled automation is refused with `"disabled"` rather than executed
   * — disabling deregisters every trigger and discards the instance, so
   * running it on demand would act on the house through an automation the
   * system reports as off (design.md D27; task 3.8c). This is distinct from
   * `"not_found"`, so an operator can tell "switched off" from "gone".
   *
   * @param name Automation name
   * @param context The trigger context to pass to execute()
   */
  async triggerAutomation(name: string, context: TriggerContext): Promise<AutomationTriggerResult> {
    const record = this.records.find((r) => r.name === name);
    if (!record) return "not_found";
    if (!record.instance) return "disabled";

    this.logger.info({ automation: name, type: context.type }, "Manual trigger via debug API");
    try {
      await this.runExecution(record.instance, context);
    } catch (err) {
      this.logger.error({ err, automation: name, type: context.type }, "Manual trigger failed");
      throw err;
    }
    return "executed";
  }
}
