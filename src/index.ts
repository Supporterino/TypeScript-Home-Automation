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

// Zigbee2MQTT types — common primitives
export type {
  DeviceState,
  DeviceStateSet,
  PowerOnBehavior,
  ColorXY,
  ColorHS,
  ColorRGB,
  ColorHex,
  Color,
} from "./types/zigbee.js";

// Zigbee2MQTT types — generic payloads (work across brands)
export type {
  DimmableLightPayload,
  WhiteSpectrumLightPayload,
  ColorLightPayload,
  LightPayload,
  DimmableLightSetCommand,
  WhiteSpectrumLightSetCommand,
  ColorLightSetCommand,
  LightSetCommand,
  OccupancyPayload,
  TemperatureHumidityPayload,
  ContactPayload,
  WaterLeakPayload,
  AirQualitySensorPayload,
  AirPurifierPayload,
  ButtonPayload,
  PlugPayload,
  SwitchSetCommand,
  BridgeState,
  GenericPayload,
} from "./types/zigbee.js";

// Zigbee2MQTT types — Philips Hue specific
export type {
  PhilipsLightEffect,
  PhilipsColorLightEffect,
  PhilipsDimmableLightSetCommand,
  PhilipsWhiteSpectrumLightSetCommand,
  PhilipsColorLightSetCommand,
  PhilipsMotionSensitivity,
  PhilipsHueMotionSensorPayload,
  PhilipsHueMotionSensorSetCommand,
} from "./types/zigbee.js";

// Zigbee2MQTT types — IKEA specific
export type {
  IkeaLightEffect,
  IkeaDimmableLightSetCommand,
  IkeaWhiteSpectrumLightSetCommand,
  IkeaAirQuality,
  IkeaFanMode,
  IkeaStarkvindPayload,
  IkeaStarkvindSetCommand,
  IkeaVindstyrkaPayload,
  IkeaStyrbarAction,
  IkeaStyrbarPayload,
  IkeaShortcutButtonAction,
  IkeaShortcutButtonPayload,
  IkeaRodretAction,
  IkeaRodretPayload,
} from "./types/zigbee.js";

// Zigbee2MQTT types — Aqara specific
export type {
  AqaraRemoteSwitchH1Action,
  AqaraClickMode,
  AqaraOperationMode,
  AqaraRemoteSwitchH1Payload,
  AqaraRemoteSwitchH1SetCommand,
  AqaraWaterLeakPayload,
  AqaraTemperatureHumidityPayload,
} from "./types/zigbee.js";


