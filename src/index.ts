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
export {
  Automation,
  type AutomationContext,
  type Trigger,
  type TriggerContext,
} from "./core/automation.js";
export { AutomationManager } from "./core/automation-manager.js";
// Automation base classes and trigger types
export { AqaraH1Automation } from "./core/devices/aqara-h1-automation.js";
export { IkeaRodretAutomation } from "./core/devices/ikea-rodret-automation.js";
export { IkeaStyrbarAutomation } from "./core/devices/ikea-styrbar-automation.js";
// Engine factory
export {
  createEngine,
  type Engine,
  type EngineOptions,
  type ServiceFactory,
} from "./core/engine.js";
export {
  HttpClient,
  type HttpRequestOptions,
  type HttpResponse,
} from "./core/http/http-client.js";
// Health server
export { HttpServer, type WebhookHandler } from "./core/http/http-server.js";
export { LogBuffer, type LogEntry, type LogQuery } from "./core/logging/log-buffer.js";
// Core services (exposed for advanced usage)
export { type MqttMessageHandler, MqttService } from "./core/mqtt/mqtt-service.js";
export { CronScheduler } from "./core/scheduling/cron-scheduler.js";
export { type NanoleafDeviceConfig, NanoleafService } from "./core/services/nanoleaf-service.js";
// Notification implementations
export {
  type NtfyConfig,
  NtfyNotificationService,
} from "./core/services/ntfy-notification-service.js";
export { type OpenMeteoConfig, OpenMeteoService } from "./core/services/open-meteo-service.js";
export {
  type OpenWeatherMapConfig,
  OpenWeatherMapService,
} from "./core/services/openweathermap-service.js";
// Service plugin infrastructure
export type {
  CoreContext,
  ServicePlugin,
} from "./core/services/service-plugin.js";
export { ServiceRegistry } from "./core/services/service-registry.js";
export { type ShellyDevice, ShellyService } from "./core/services/shelly-service.js";
// State management
export {
  type StateChangeHandler,
  StateManager,
  type StateManagerOptions,
} from "./core/state/state-manager.js";
// Zigbee2MQTT device registry
export {
  type DeviceAddedHandler,
  type DeviceNiceNames,
  DeviceRegistry,
  type DeviceRegistryPersistenceOptions,
  type DeviceRemovedHandler,
  type DeviceStateChangeHandler,
} from "./core/zigbee/device-registry.js";
// Nanoleaf types
export type {
  NanoleafAnimType,
  NanoleafAuthResponse,
  NanoleafBoolValue,
  NanoleafColorMode,
  NanoleafDeviceInfo,
  NanoleafEffect,
  NanoleafPaletteColor,
  NanoleafPanelLayout,
  NanoleafPanelPosition,
  NanoleafRange,
  NanoleafRangeValue,
  NanoleafShapeType,
  NanoleafState,
  NanoleafStateSet,
} from "./types/nanoleaf.js";
// Notification services
// Notification service interface + types
export type {
  NotificationOptions,
  NotificationPriority,
  NotificationService,
} from "./types/notification.js";
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
// Weather types and services
export type {
  CurrentWeather,
  DailyForecast,
  WeatherCondition,
  WeatherLocation,
  WeatherService,
  WindData,
} from "./types/weather.js";
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
  BridgeEventPayload,
  BridgeEventType,
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
  ZigbeeDevice,
  ZigbeeDeviceDefinition,
  ZigbeeDeviceType,
  ZigbeeInterviewState,
} from "./types/zigbee/index.js";
