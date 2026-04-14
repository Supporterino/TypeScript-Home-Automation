/**
 * Zigbee2MQTT device payload types — re-exported from per-brand files.
 *
 * Organized in three layers:
 *
 * 1. **Common primitives** — shared enums, color types, state types (`common.ts`)
 * 2. **Generic payloads** — category-level types (any dimmable light, any motion
 *    sensor, any remote, etc.) that work across brands (`common.ts`)
 * 3. **Brand-specific payloads** — narrowed types for specific manufacturers/models
 *    (`philips.ts`, `ikea.ts`, `aqara.ts`)
 *
 * Use the generic types when writing automations that should work with any device
 * in a category. Use the brand-specific types when you need exact typing for a
 * particular model.
 */

// Aqara
export type {
  AqaraClickMode,
  AqaraOperationMode,
  AqaraRemoteSwitchH1Action,
  AqaraRemoteSwitchH1Payload,
  AqaraRemoteSwitchH1SetCommand,
  AqaraTemperatureHumidityPayload,
  AqaraWaterLeakPayload,
} from "./aqara.js";
// Common primitives and generic payloads
export type {
  AirPurifierPayload,
  AirQualitySensorPayload,
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
  LightPayload,
  LightSetCommand,
  OccupancyPayload,
  PlugPayload,
  PowerOnBehavior,
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
