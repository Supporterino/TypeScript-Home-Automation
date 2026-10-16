import type { TriggerContext } from "@ts-ha/shared";
import type { ZigbeeDevice } from "@ts-ha/shared/types";
import type { NotificationOptions, NotificationService } from "@ts-ha/shared/types/notification";
import type { Logger } from "pino";
import type { Config } from "./config.js";
import type { HttpClient } from "./http/http-client.js";

export type { TriggerContext } from "@ts-ha/shared";

import type { MqttService } from "./mqtt/mqtt-service.js";
import type { ServiceRegistry } from "./services/service-registry.js";
import type { StateManager } from "./state/state-manager.js";
import type { DeviceRegistry } from "./zigbee/device-registry.js";

/**
 * Trigger types for automations: `mqtt`, `cron`, `state`, `webhook`, `device_state`,
 * `device_joined`, and `device_left` (the device_* types require `DEVICE_REGISTRY_ENABLED`).
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
      /** Webhook URL path (without leading slash); the endpoint is `POST /webhook/<path>`. */
      path: string;
      /** HTTP methods to accept (default: ["POST"]). */
      methods?: ("GET" | "POST" | "PUT" | "DELETE")[];
    }
  | {
      type: "device_state";
      /** Zigbee2MQTT friendly name of the device to watch. */
      friendlyName: string;
      /** Optional filter — return true to trigger, false to ignore. */
      filter?: (state: Record<string, unknown>, device: ZigbeeDevice) => boolean;
    }
  | {
      type: "device_joined";
      /** If provided, only fires when this specific device joins; omit to fire for any join. */
      friendlyName?: string;
    }
  | {
      type: "device_left";
      /** If provided, only fires when this specific device leaves; omit to fire for any leave. */
      friendlyName?: string;
    };

/**
 * Dependencies injected into every automation by the `AutomationManager`, passed as a
 * single context object to `_inject()`.
 */
export interface AutomationContext {
  mqtt: MqttService;
  http: HttpClient;
  state: StateManager;
  logger: Logger;
  config: Config;
  /** `null` when `DEVICE_REGISTRY_ENABLED` is `false` (the default). */
  deviceRegistry: DeviceRegistry | null;
  /** The shared service registry; use it to access any optional service. */
  services: ServiceRegistry;
}

/**
 * Abstract base class for all automations. Subclasses implement `name`, `triggers`, and
 * `execute`, and may override `onStart`/`onStop`.
 */
export abstract class Automation {
  /** Unique name identifying this automation. Used in logs and job IDs. */
  abstract readonly name: string;

  /** The trigger(s) that cause this automation to execute. */
  abstract readonly triggers: Trigger[];

  /**
   * Declare services that must be registered when this automation starts; the
   * `AutomationManager` validates them and throws if any is missing. Use `as const`.
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
   * Called by the `AutomationManager` to inject dependencies; do not call this yourself.
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

  /** The shared service registry, for access to any optional service. */
  protected get services(): ServiceRegistry {
    return this.servicesRegistry;
  }

  /**
   * Retrieve a service declared in `requiredServices`; the `AutomationManager` already
   * validated it, so it never returns `null`.
   */
  protected require<T>(key: string): T {
    return this.servicesRegistry.getOrThrow<T>(key);
  }

  /**
   * Send a push notification; logs a warning and no-ops when no notification service is
   * configured.
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
   * The Zigbee2MQTT device registry, or `null` if disabled
   * (`DEVICE_REGISTRY_ENABLED=false`); always null-check before use.
   */
  protected get deviceRegistry(): DeviceRegistry | null {
    return this.deviceRegistryService;
  }

  /** The automation logic. Called whenever one of the defined triggers fires. */
  abstract execute(context: TriggerContext): Promise<void>;

  /** Optional lifecycle hook called when the automation is registered. */
  async onStart(): Promise<void> {}

  /** Optional lifecycle hook called when the automation is stopped. */
  async onStop(): Promise<void> {}
}
