/**
 * ts-home-automation — package entry point.
 *
 * Re-exports the public API for consumers who install this as a package:
 *
 * ```ts
 * import { Automation, createEngine, type Trigger } from "ts-home-automation";
 * ```
 */

// Engine factory
export { createEngine, type Engine, type EngineOptions } from "./core/engine.js";

// Automation base class and trigger types
export {
  Automation,
  type Trigger,
  type TriggerContext,
} from "./core/automation.js";

// Core services (exposed for advanced usage)
export { MqttService, type MqttMessageHandler } from "./core/mqtt-service.js";
export {
  HttpClient,
  type HttpRequestOptions,
  type HttpResponse,
} from "./core/http-client.js";
export { CronScheduler } from "./core/cron-scheduler.js";
export { AutomationManager } from "./core/automation-manager.js";

// Configuration
export { loadConfig, type Config } from "./config.js";

// Zigbee2MQTT types
export type {
  DeviceState,
  OccupancyPayload,
  ContactPayload,
  TemperatureHumidityPayload,
  LightPayload,
  PlugPayload,
  LightSetCommand,
  SwitchSetCommand,
  ButtonPayload,
  BridgeState,
  GenericPayload,
} from "./types/zigbee.js";
