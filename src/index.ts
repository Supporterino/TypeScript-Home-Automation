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
export {
  AutomationManager,
  type AutomationRelationships,
  type RequiredServiceStatus,
} from "./core/automation-manager.js";
// Unified device sources (design.md D2; task 6.13d) — DeviceSource is
// exported for inspection and testing; the source set itself is fixed at
// four and is not a ServiceRegistry registration point.
export { AggregateDeviceSource, type DeviceSourceStatus } from "./core/device-sources/aggregate.js";
export {
  type CommandValidationResult,
  validateCommand,
} from "./core/device-sources/command-validation.js";
export { wireDeviceEvents } from "./core/device-sources/device-event-bridge.js";
export type {
  DeviceChangeListener,
  DeviceCommandOutcome,
  DeviceDescriptor,
  DeviceObservation,
  DeviceSource,
  ObservationMode,
} from "./core/device-sources/device-source.js";
export { NanoleafDeviceSource } from "./core/device-sources/nanoleaf-source.js";
export {
  formatQualifiedId,
  type ParsedQualifiedId,
  parseQualifiedId,
  QUALIFIED_ID_DELIMITER,
} from "./core/device-sources/qualified-id.js";
export { ShellyDeviceSource } from "./core/device-sources/shelly-source.js";
export { StateDeviceSource, type StateToggleConfig } from "./core/device-sources/state-source.js";
export { ZigbeeDeviceSource } from "./core/device-sources/zigbee-source.js";
// Automation base classes and trigger types
export { AqaraH1Automation } from "./core/devices/aqara-h1-automation.js";
export { IkeaRodretAutomation } from "./core/devices/ikea-rodret-automation.js";
export { IkeaStyrbarAutomation } from "./core/devices/ikea-styrbar-automation.js";
// Engine factory
export {
  createEngine,
  createStreamOnlyLogger,
  type Engine,
  type EngineOptions,
  type HomekitServiceContext,
  type HomekitServiceFactory,
  type ServiceFactory,
} from "./core/engine.js";
// Realtime event stream
export {
  type AutomationEnabledEvent,
  type AutomationExecutionCompletedEvent,
  type DeviceAppearedEvent,
  type DeviceDisappearedEvent,
  type DeviceReachabilityChangedEvent,
  type DeviceStateChangedEvent,
  EventBus,
  type FellBehindEvent,
  type LogEntryEvent,
  type ReadinessChangedEvent,
  type RoomChangedEvent,
  type RoomMembershipChangedEvent,
  type StateChangedEvent,
  type StreamEvent,
  type StreamEventListener,
} from "./core/events/event-bus.js";
export {
  DEFAULT_CONNECTION_BUFFER_CAPACITY,
  DEFAULT_KEEPALIVE_MS,
  EventStreamHub,
} from "./core/http/event-stream.js";
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
// Automation execution observability (design.md D11; task 8.x)
export { currentAutomationName } from "./core/observability/execution-context.js";
export {
  type ExecutionCompletionEvent,
  type ExecutionCompletionListener,
  type ExecutionOutcome,
  type ExecutionRecord,
  ExecutionRecorder,
  type ObservedWrites,
} from "./core/observability/execution-recorder.js";
// User-defined rooms spanning every unified device source (design.md D14)
export {
  type AssignDeviceResult,
  type CreateRoomResult,
  type DeleteRoomResult,
  type RenameRoomResult,
  type Room,
  RoomManager,
  type RoomMember,
  type RoomWithMembers,
} from "./core/room-manager.js";
export { CronScheduler } from "./core/scheduling/cron-scheduler.js";
// HomeKit bridge service
export {
  HOMEKIT_SERVICE_KEY,
  HomekitService,
  type HomekitServiceOptions,
  type HomekitStatus,
} from "./core/services/homekit-service.js";
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
export { PrometheusMetricsService } from "./core/services/prometheus-metrics-service.js";
// Service plugin infrastructure
export type {
  CoreContext,
  ServicePlugin,
} from "./core/services/service-plugin.js";
export { ServiceRegistry } from "./core/services/service-registry.js";
export {
  type ShellyDevice,
  type ShellyMqttRegisterOptions,
  ShellyService,
  type ShellyServiceContext,
  type ShellyServiceFactory,
} from "./core/services/shelly-service.js";
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
// Source-neutral device capability vocabulary
export {
  type Capability,
  type CapabilityAccess,
  type CapabilityRange,
  type CapabilityValueType,
  mapZ2MExpose,
  mapZ2MExposes,
} from "./types/capabilities.js";
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
// Zigbee2MQTT types (common, Philips, IKEA, Aqara, bridge)
export type {
  AirPurifierPayload,
  AirQualitySensorPayload,
  AqaraClickMode,
  AqaraOperationMode,
  AqaraPresencePayload,
  AqaraPresenceSetCommand,
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
  PresencePayload,
  PresenceSetCommand,
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
