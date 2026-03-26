/**
 * Common Zigbee2MQTT device payload types.
 *
 * These represent the most common device state payloads sent by Zigbee2MQTT.
 * Extend these as needed for your specific devices. The friendly name of
 * each device is configured in Zigbee2MQTT and used as the MQTT topic suffix
 * (e.g. `zigbee2mqtt/<friendly_name>`).
 */

/** Binary on/off state used by lights, switches, plugs, etc. */
export type DeviceState = "ON" | "OFF";

/** Payload for occupancy / motion sensors (e.g. Aqara RTCGQ11LM) */
export interface OccupancyPayload {
  occupancy: boolean;
  /** Illuminance in lux (some sensors include this) */
  illuminance?: number;
  illuminance_lux?: number;
  battery?: number;
  linkquality?: number;
}

/** Payload for contact / door-window sensors */
export interface ContactPayload {
  contact: boolean;
  battery?: number;
  linkquality?: number;
}

/** Payload for temperature / humidity sensors (e.g. Aqara WSDCGQ11LM) */
export interface TemperatureHumidityPayload {
  temperature: number;
  humidity: number;
  pressure?: number;
  battery?: number;
  linkquality?: number;
}

/** Payload for light devices (bulbs, LED strips, etc.) */
export interface LightPayload {
  state: DeviceState;
  brightness?: number;
  color_temp?: number;
  color?: {
    x: number;
    y: number;
  };
  linkquality?: number;
}

/** Payload for smart plugs with power monitoring */
export interface PlugPayload {
  state: DeviceState;
  power?: number;
  voltage?: number;
  current?: number;
  energy?: number;
  linkquality?: number;
}

/** Command payload to set a light state via zigbee2mqtt/<name>/set */
export interface LightSetCommand {
  state?: DeviceState;
  brightness?: number;
  color_temp?: number;
  color?: {
    x: number;
    y: number;
  };
  transition?: number;
}

/** Command payload to set a switch/plug state via zigbee2mqtt/<name>/set */
export interface SwitchSetCommand {
  state: DeviceState;
}

/** Payload for button/remote devices (e.g. IKEA E1743) */
export interface ButtonPayload {
  action: string;
  battery?: number;
  linkquality?: number;
}

/** Zigbee2MQTT bridge state */
export interface BridgeState {
  state: "online" | "offline";
}

/** Generic device payload - use when you don't know the exact type */
export type GenericPayload = Record<string, unknown>;
