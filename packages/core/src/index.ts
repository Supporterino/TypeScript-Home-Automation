/**
 * `@ts-ha/core` — package entry point.
 *
 * Re-exports the engine API and the domain/wire contracts owned by
 * `@ts-ha/shared`, so the public surface is stable:
 *
 * ```ts
 * import { Automation, createEngine, type Trigger } from "@ts-ha/core";
 * ```
 */

// Source-neutral device capability vocabulary
export type {
  Capability,
  CapabilityAccess,
  CapabilityRange,
  CapabilityValueType,
} from "@ts-ha/shared";
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
} from "@ts-ha/shared/types";
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
} from "@ts-ha/shared/types/nanoleaf";
// Notification service interface + types
export type {
  NotificationOptions,
  NotificationPriority,
  NotificationService,
} from "@ts-ha/shared/types/notification";
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
} from "@ts-ha/shared/types/shelly";
// Weather types and services
export type {
  CurrentWeather,
  DailyForecast,
  WeatherCondition,
  WeatherLocation,
  WeatherService,
  WindData,
} from "@ts-ha/shared/types/weather";
export {
  Automation,
  type AutomationContext,
  type Trigger,
  type TriggerContext,
} from "./automation.js";
export {
  AutomationManager,
  type AutomationRelationships,
  type RequiredServiceStatus,
} from "./automation-manager.js";
// Configuration
export { type Config, loadConfig } from "./config.js";
// Unified device sources (design.md D2; task 6.13d) — DeviceSource is
// exported for inspection and testing; the source set itself is fixed at
// four and is not a ServiceRegistry registration point.
export { AggregateDeviceSource, type DeviceSourceStatus } from "./device-sources/aggregate.js";
export {
  type CommandValidationResult,
  validateCommand,
} from "./device-sources/command-validation.js";
export { wireDeviceEvents } from "./device-sources/device-event-bridge.js";
export type {
  DeviceChangeListener,
  DeviceCommandOutcome,
  DeviceDescriptor,
  DeviceObservation,
  DeviceSource,
  ObservationMode,
} from "./device-sources/device-source.js";
export { NanoleafDeviceSource } from "./device-sources/nanoleaf-source.js";
export {
  formatQualifiedId,
  type ParsedQualifiedId,
  parseQualifiedId,
  QUALIFIED_ID_DELIMITER,
} from "./device-sources/qualified-id.js";
export { ShellyDeviceSource } from "./device-sources/shelly-source.js";
export { StateDeviceSource, type StateToggleConfig } from "./device-sources/state-source.js";
export { ZigbeeDeviceSource } from "./device-sources/zigbee-source.js";
// Automation base classes and trigger types
export { AqaraH1Automation } from "./devices/aqara-h1-automation.js";
export { IkeaRodretAutomation } from "./devices/ikea-rodret-automation.js";
export { IkeaStyrbarAutomation } from "./devices/ikea-styrbar-automation.js";
// Engine factory
export {
  createEngine,
  createStreamOnlyLogger,
  type Engine,
  type EngineOptions,
  type HomekitServiceContext,
  type HomekitServiceFactory,
  type ServiceFactory,
} from "./engine.js";
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
} from "./events/event-bus.js";
export {
  DEFAULT_CONNECTION_BUFFER_CAPACITY,
  DEFAULT_KEEPALIVE_MS,
  EventStreamHub,
} from "./http/event-stream.js";
export {
  HttpClient,
  type HttpRequestOptions,
  type HttpResponse,
} from "./http/http-client.js";
// Health server
export { HttpServer, type WebhookHandler } from "./http/http-server.js";
export { LogBuffer, type LogEntry, type LogQuery } from "./logging/log-buffer.js";
// Core services (exposed for advanced usage)
export { type MqttMessageHandler, MqttService } from "./mqtt/mqtt-service.js";
// Automation execution observability (design.md D11; task 8.x)
export { currentAutomationName } from "./observability/execution-context.js";
export {
  type ExecutionCompletionEvent,
  type ExecutionCompletionListener,
  type ExecutionOutcome,
  type ExecutionRecord,
  ExecutionRecorder,
  type ObservedWrites,
} from "./observability/execution-recorder.js";
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
} from "./room-manager.js";
export { CronScheduler } from "./scheduling/cron-scheduler.js";
// HomeKit bridge service
export {
  HOMEKIT_SERVICE_KEY,
  HomekitService,
  type HomekitServiceOptions,
  type HomekitStatus,
} from "./services/homekit-service.js";
export { type NanoleafDeviceConfig, NanoleafService } from "./services/nanoleaf-service.js";
// Notification implementations
export {
  type NtfyConfig,
  NtfyNotificationService,
} from "./services/ntfy-notification-service.js";
export { type OpenMeteoConfig, OpenMeteoService } from "./services/open-meteo-service.js";
export {
  type OpenWeatherMapConfig,
  OpenWeatherMapService,
} from "./services/openweathermap-service.js";
export { PrometheusMetricsService } from "./services/prometheus-metrics-service.js";
// Service plugin infrastructure
export type {
  CoreContext,
  ServicePlugin,
} from "./services/service-plugin.js";
export { ServiceRegistry } from "./services/service-registry.js";
export {
  type ShellyDevice,
  type ShellyMqttRegisterOptions,
  ShellyService,
  type ShellyServiceContext,
  type ShellyServiceFactory,
} from "./services/shelly-service.js";
// State management
export {
  type StateChangeHandler,
  StateManager,
  type StateManagerOptions,
} from "./state/state-manager.js";
// Zigbee2MQTT device registry
export {
  type DeviceAddedHandler,
  type DeviceNiceNames,
  DeviceRegistry,
  type DeviceRegistryPersistenceOptions,
  type DeviceRemovedHandler,
  type DeviceStateChangeHandler,
} from "./zigbee/device-registry.js";
// Zigbee2MQTT `exposes` mapper — source-specific, stays in core (design.md D5)
export { mapZ2MExpose, mapZ2MExposes } from "./zigbee/z2m-mapper.js";
