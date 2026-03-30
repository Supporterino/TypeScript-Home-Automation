/**
 * ts-home-automation — package entry point.
 *
 * Re-exports the public API for consumers who install this as a package:
 *
 * ```ts
 * import { Automation, createEngine, type Trigger } from "ts-home-automation";
 * ```
 */

// Configuration
export { type Config, loadConfig } from "./config.js";

// Automation base classes and trigger types
export { AqaraH1Automation } from "./core/aqara-h1-automation.js";
export {
  Automation,
  type Trigger,
  type TriggerContext,
} from "./core/automation.js";
export { AutomationManager } from "./core/automation-manager.js";
export { CronScheduler } from "./core/cron-scheduler.js";
// Engine factory
export { createEngine, type Engine, type EngineOptions } from "./core/engine.js";
export {
  HttpClient,
  type HttpRequestOptions,
  type HttpResponse,
} from "./core/http-client.js";
// Health server
export { HttpServer, type WebhookHandler } from "./core/http-server.js";
export { IkeaRodretAutomation } from "./core/ikea-rodret-automation.js";
export { IkeaStyrbarAutomation } from "./core/ikea-styrbar-automation.js";
export { LogBuffer, type LogEntry, type LogQuery } from "./core/log-buffer.js";
// Core services (exposed for advanced usage)
export { type MqttMessageHandler, MqttService } from "./core/mqtt-service.js";
// Notification services
export type {
  NotificationOptions,
  NotificationPriority,
  NotificationService,
} from "./core/notification-service.js";
export {
  type NtfyConfig,
  NtfyNotificationService,
} from "./core/ntfy-notification-service.js";
export { type ShellyDevice, ShellyService } from "./core/shelly-service.js";
// State management
export {
  type StateChangeHandler,
  StateManager,
  type StateManagerOptions,
} from "./core/state-manager.js";
// Shelly Gen 2 types
export type {
  ShellyCoverConfig,
  ShellyCoverError,
  ShellyCoverState,
  ShellyCoverStatus,
  ShellyDeviceInfo,
  ShellyEnergyCounters,
  ShellySwitchConfig,
  ShellySwitchError,
  ShellySwitchSetResult,
  ShellySwitchStatus,
  ShellySysStatus,
  ShellyTemperature,
} from "./types/shelly.js";
// Zigbee2MQTT types — common primitives
// Zigbee2MQTT types — generic payloads (work across brands)
// Zigbee2MQTT types — Philips Hue specific
// Zigbee2MQTT types — IKEA specific
// Zigbee2MQTT types — Aqara specific
export type {
  AirPurifierPayload,
  AirQualitySensorPayload,
  AqaraClickMode,
  AqaraOperationMode,
  AqaraRemoteSwitchH1Action,
  AqaraRemoteSwitchH1Payload,
  AqaraRemoteSwitchH1SetCommand,
  AqaraTemperatureHumidityPayload,
  AqaraWaterLeakPayload,
  BridgeState,
  ButtonPayload,
  Color,
  ColorHex,
  ColorHS,
  ColorLightPayload,
  ColorLightSetCommand,
  ColorRGB,
  ColorXY,
  ContactPayload,
  DeviceState,
  DeviceStateSet,
  DimmableLightPayload,
  DimmableLightSetCommand,
  GenericPayload,
  IkeaAirQuality,
  IkeaDimmableLightSetCommand,
  IkeaFanMode,
  IkeaLightEffect,
  IkeaRodretAction,
  IkeaRodretPayload,
  IkeaShortcutButtonAction,
  IkeaShortcutButtonPayload,
  IkeaStarkvindPayload,
  IkeaStarkvindSetCommand,
  IkeaStyrbarAction,
  IkeaStyrbarPayload,
  IkeaVindstyrkaPayload,
  IkeaWhiteSpectrumLightSetCommand,
  LightPayload,
  LightSetCommand,
  OccupancyPayload,
  PhilipsColorLightEffect,
  PhilipsColorLightSetCommand,
  PhilipsDimmableLightSetCommand,
  PhilipsHueMotionSensorPayload,
  PhilipsHueMotionSensorSetCommand,
  PhilipsLightEffect,
  PhilipsMotionSensitivity,
  PhilipsWhiteSpectrumLightSetCommand,
  PlugPayload,
  PowerOnBehavior,
  SwitchSetCommand,
  TemperatureHumidityPayload,
  WaterLeakPayload,
  WhiteSpectrumLightPayload,
  WhiteSpectrumLightSetCommand,
} from "./types/zigbee.js";
