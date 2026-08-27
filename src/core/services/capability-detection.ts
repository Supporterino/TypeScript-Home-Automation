/**
 * HomeKit capability detection, expressed purely in terms of the
 * source-neutral capability vocabulary (`src/types/capabilities.ts`).
 *
 * This module has no dependency on Zigbee2MQTT's `exposes` shape or on
 * `ZigbeeDevice` — it is severed from any specific device source two phases
 * before the group 6 device-source refactor needs that same decoupling for
 * paired hardware (design.md D22, R1).
 */
import type { Capability } from "../../types/capabilities.js";

export interface DeviceCapabilities {
  /** Device has a controllable on/off state and brightness → Lightbulb */
  isLight: boolean;
  hasBrightness: boolean;
  hasColorTemp: boolean;
  /** Device exposes CIE xy color (reported as color.x / color.y) */
  hasColorXY: boolean;
  /** Device exposes hue/saturation color (reported as color.hue / color.saturation) */
  hasColorHS: boolean;
  /** Device is a switch or outlet (on/off only, no brightness) */
  isSwitch: boolean;
  hasOccupancy: boolean;
  hasContact: boolean;
  hasWaterLeak: boolean;
  hasTemperature: boolean;
  hasHumidity: boolean;
  hasBattery: boolean;
  /** Device exposes a writable numeric position (0-100), e.g. a cover/blind. */
  hasPosition: boolean;
}

/**
 * Detects HomeKit-relevant capabilities from a device's capability schema,
 * expressed in the source-neutral vocabulary.
 */
export function detectCapabilities(capabilities: Capability[]): DeviceCapabilities {
  const caps: DeviceCapabilities = {
    isLight: false,
    hasBrightness: false,
    hasColorTemp: false,
    hasColorXY: false,
    hasColorHS: false,
    isSwitch: false,
    hasOccupancy: false,
    hasContact: false,
    hasWaterLeak: false,
    hasTemperature: false,
    hasHumidity: false,
    hasBattery: false,
    hasPosition: false,
  };

  for (const capability of capabilities) {
    switch (capability.kind) {
      case "light": {
        caps.isLight = true;
        for (const feature of capability.features ?? []) {
          const key = feature.property ?? feature.name;
          if (key === "brightness") caps.hasBrightness = true;
          if (key === "color_temp") caps.hasColorTemp = true;
          if (key === "color_xy") caps.hasColorXY = true;
          if (key === "color_hs") caps.hasColorHS = true;
        }
        break;
      }
      case "switch":
      case "outlet": {
        caps.isSwitch = true;
        break;
      }
      default: {
        // Scalar/binary capabilities at the top level
        const key = capability.property ?? capability.name;
        switch (key) {
          case "occupancy":
            caps.hasOccupancy = true;
            break;
          case "contact":
            caps.hasContact = true;
            break;
          case "water_leak":
            caps.hasWaterLeak = true;
            break;
          case "temperature":
            caps.hasTemperature = true;
            break;
          case "humidity":
            caps.hasHumidity = true;
            break;
          case "battery":
            caps.hasBattery = true;
            break;
          case "position":
            caps.hasPosition = true;
            break;
        }
      }
    }
  }

  return caps;
}
