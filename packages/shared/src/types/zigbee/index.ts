/** Zigbee2MQTT device payload types, re-exported from per-brand files. */

// Aqara
export type {
  AqaraClickMode,
  AqaraOperationMode,
  AqaraPresencePayload,
  AqaraPresenceSetCommand,
  AqaraRemoteSwitchH1Action,
  AqaraRemoteSwitchH1Payload,
  AqaraRemoteSwitchH1SetCommand,
  AqaraTemperatureHumidityPayload,
  AqaraWaterLeakPayload,
} from "./aqara.js";
// Bridge topics
export type {
  BridgeEventPayload,
  BridgeEventType,
  BridgeState,
  ZigbeeDevice,
  ZigbeeDeviceDefinition,
  ZigbeeDeviceType,
  ZigbeeGroup,
  ZigbeeGroupMember,
  ZigbeeInterviewState,
} from "./bridge.js";
// Common primitives and generic payloads
export type {
  AirPurifierPayload,
  AirQualitySensorPayload,
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
  LightPayload,
  LightSetCommand,
  OccupancyPayload,
  PlugPayload,
  PowerOnBehavior,
  PresencePayload,
  PresenceSetCommand,
  SwitchSetCommand,
  TemperatureHumidityPayload,
  WaterLeakPayload,
  WhiteSpectrumLightPayload,
  WhiteSpectrumLightSetCommand,
} from "./common.js";

// IKEA
export type {
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
} from "./ikea.js";
// Philips Hue
export type {
  PhilipsColorLightEffect,
  PhilipsColorLightSetCommand,
  PhilipsDimmableLightSetCommand,
  PhilipsHueMotionSensorPayload,
  PhilipsHueMotionSensorSetCommand,
  PhilipsLightEffect,
  PhilipsMotionSensitivity,
  PhilipsWhiteSpectrumLightSetCommand,
} from "./philips.js";
