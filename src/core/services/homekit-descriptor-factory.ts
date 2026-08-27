/**
 * Builds HAP accessories directly from the source-neutral `DeviceDescriptor`
 * model (design.md D22; task 6.16).
 *
 * This is the "HAP projection" side of D22's diagram — the single place that
 * turns the shared capability vocabulary into `hap-nodejs` services and
 * characteristics, for every device family at once, with no reference to
 * `ZigbeeDevice`, `ShellyDevice`, MQTT, or Shelly RPC. It reuses the
 * value-application helpers already exported by `homekit-accessory-factory.ts`
 * (`applyLightState`, `applyMotionState`, …) — those functions already take a
 * plain `Service` and `Record<string, unknown>` state, so nothing about them
 * was ever Zigbee-specific; only the old `createAccessory(device: ZigbeeDevice, …)`
 * entry point was, and that entry point is not used by this factory.
 *
 * Two conventions are unavoidably source-specific and are resolved once,
 * here, rather than left implicit:
 *
 * - **On/off encoding.** Zigbee2MQTT's on/off property is conventionally
 *   named `"state"` and takes the strings `"ON"`/`"OFF"`, not a JSON boolean
 *   — a Zigbee2MQTT wire-protocol fact, not a vocabulary one. Every other
 *   source authors its own on/off capability with `property: "on"` and a
 *   real boolean (design.md D22: Shelly and the state-toggle source both
 *   author their own schema). `onOffProperty()`/`readOnOff()`/`writeOnOff()`
 *   below hold this as the one deliberately-named special case.
 * - **UUID seeds.** Frozen per source by the task 6.15 characterisation
 *   test; this factory reuses the exact seed functions each old factory
 *   exported rather than deriving a new seed from `qualifiedId`, so this
 *   refactor changes no existing accessory's UUID and requires no re-pairing.
 */
import { Accessory, Characteristic, Service, uuid } from "hap-nodejs";
import type { Capability } from "../../types/capabilities.js";
import type { DeviceDescriptor } from "../device-sources/device-source.js";
import { detectCapabilities } from "./capability-detection.js";
import {
  applyBatteryState,
  applyContactState,
  applyLeakState,
  applyLightState,
  applyMotionState,
  applyThermoState,
  HAP_CATEGORY_LIGHTBULB,
  HAP_CATEGORY_OTHER,
  HAP_CATEGORY_SENSOR,
  HAP_CATEGORY_SWITCH,
  hapBrightnessToZ2m,
} from "./homekit-accessory-factory.js";

/** @see https://github.com/homebridge/HAP-NodeJS/blob/master/src/lib/Accessory.ts */
const HAP_CATEGORY_WINDOW_COVERING = 14;

/**
 * HAP `PositionState` values (const enum in hap-nodejs, inlined for
 * isolatedModules compatibility).
 */
const POSITION_STATE_DECREASING = 0;
const POSITION_STATE_INCREASING = 1;
const POSITION_STATE_STOPPED = 2;

/** Result of {@link createAccessoryFromDescriptor}. */
export interface CreatedAccessory {
  accessory: Accessory;
  /** Call whenever the descriptor's `state` changes. */
  updateState: (state: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// UUID seeding — frozen per source (task 6.15)
// ---------------------------------------------------------------------------

function uuidSeedFor(descriptor: DeviceDescriptor): string {
  switch (descriptor.source) {
    // Matches the frozen `zigbeeAccessoryUuidSeed(device)`, which is exactly
    // `device.ieee_address` — the Zigbee device source's stable identity,
    // carried unchanged as `descriptor.id` (see zigbee-source.ts).
    case "zigbee":
      return descriptor.id;
    // Matches the frozen `shellyAccessoryUuidSeed(device)`.
    case "shelly":
      return `shelly:${descriptor.id}`;
    // Matches the frozen `stateToggleUuidSeed(stateKey)`.
    case "state":
      return `state:${descriptor.id}`;
    default:
      // A source with no prior HomeKit pairing to preserve (e.g. Nanoleaf) —
      // the qualified id is a perfectly stable, unique seed on its own.
      return descriptor.qualifiedId;
  }
}

// ---------------------------------------------------------------------------
// On/off — the one deliberately-named source-specific convention
// ---------------------------------------------------------------------------

/** Finds the first capability (top-level or nested) whose `kind` is one of `kinds`. */
function findByKind(capabilities: Capability[], kinds: string[]): Capability | undefined {
  for (const cap of capabilities) {
    if (kinds.includes(cap.kind)) return cap;
    if (cap.features) {
      const nested = findByKind(cap.features, kinds);
      if (nested) return nested;
    }
  }
  return undefined;
}

/**
 * The property name a device's on/off capability is read and written
 * through. Defaults to Zigbee2MQTT's `"state"` convention when the matching
 * capability (light/switch/outlet) declares no `property` of its own — real
 * Zigbee2MQTT `exposes` never do, since `state` is implicit — and otherwise
 * uses whatever the source itself declared (`"on"` for Shelly and the
 * state-toggle source).
 */
function onOffProperty(capabilities: Capability[]): string {
  const cap = findByKind(capabilities, ["light", "switch", "outlet"]);
  return cap?.property ?? "state";
}

function readOnOff(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "ON") return true;
  if (value === "OFF") return false;
  return undefined;
}

/** Encodes a boolean for the wire, honouring Zigbee2MQTT's `"ON"`/`"OFF"` string convention for `"state"`. */
function writeOnOff(property: string, value: boolean): Record<string, unknown> {
  return { [property]: property === "state" ? (value ? "ON" : "OFF") : value };
}

function applyOnOffState(service: Service, property: string, state: Record<string, unknown>): void {
  const value = readOnOff(state[property]);
  if (value !== undefined) {
    service.getCharacteristic(Characteristic.On).updateValue(value);
  }
}

// ---------------------------------------------------------------------------
// Accessory factory
// ---------------------------------------------------------------------------

/**
 * Creates a HAP Accessory for the given device descriptor.
 *
 * Returns `null` when no supported capability is detected — the same
 * behaviour as the old per-family factories, just decided from the shared
 * vocabulary instead of a source-specific schema.
 *
 * @param descriptor The device's source-neutral descriptor.
 * @param onSet      Callback invoked with a property write when HomeKit
 *                    changes a writable characteristic. Wire this to
 *                    `AggregateDeviceSource.command(descriptor.qualifiedId, properties)`.
 * @param onWarn     Optional callback for non-fatal warnings (e.g. an
 *                    uncalibrated cover).
 */
export function createAccessoryFromDescriptor(
  descriptor: DeviceDescriptor,
  onSet: (properties: Record<string, unknown>) => void,
  onWarn?: (message: string, context: Record<string, unknown>) => void,
): CreatedAccessory | null {
  const caps = detectCapabilities(descriptor.capabilities);
  const accessoryUuid = uuid.generate(uuidSeedFor(descriptor));
  const { displayName } = descriptor;

  let category: number = HAP_CATEGORY_OTHER;
  let accessory: Accessory;
  let updateState: (state: Record<string, unknown>) => void;

  if (caps.isLight) {
    category = HAP_CATEGORY_LIGHTBULB;
    accessory = new Accessory(displayName, accessoryUuid);
    accessory.category = category;

    const lightService = accessory.addService(Service.Lightbulb);
    const onOff = onOffProperty(descriptor.capabilities);

    if (caps.hasColorTemp) lightService.addOptionalCharacteristic(Characteristic.ColorTemperature);
    if (caps.hasColorXY || caps.hasColorHS) {
      lightService.addOptionalCharacteristic(Characteristic.Hue);
      lightService.addOptionalCharacteristic(Characteristic.Saturation);
    }

    lightService.getCharacteristic(Characteristic.On).onSet((value) => {
      onSet(writeOnOff(onOff, Boolean(value)));
    });

    if (caps.hasBrightness) {
      lightService.getCharacteristic(Characteristic.Brightness).onSet((value) => {
        onSet({ brightness: hapBrightnessToZ2m(value as number) });
      });
    }

    if (caps.hasColorTemp) {
      lightService.getCharacteristic(Characteristic.ColorTemperature).onSet((value) => {
        onSet({ color_temp: value as number });
      });
    }

    if (caps.hasColorXY || caps.hasColorHS) {
      let pendingHue: number | null = null;
      let pendingTimer: ReturnType<typeof setTimeout> | null = null;

      const flushColor = (hue: number, saturation: number) => {
        onSet({ color: { hue, saturation } });
        pendingHue = null;
        pendingTimer = null;
      };

      lightService.getCharacteristic(Characteristic.Hue).onSet((value) => {
        pendingHue = value as number;
        if (pendingTimer) clearTimeout(pendingTimer);
        pendingTimer = setTimeout(() => {
          const hue = pendingHue;
          if (hue === null) return;
          const sat =
            (lightService.getCharacteristic(Characteristic.Saturation).value as number) ?? 100;
          flushColor(hue, sat);
        }, 50);
      });

      lightService.getCharacteristic(Characteristic.Saturation).onSet((value) => {
        if (pendingTimer) clearTimeout(pendingTimer);
        const hue =
          pendingHue ?? (lightService.getCharacteristic(Characteristic.Hue).value as number) ?? 0;
        flushColor(hue, value as number);
      });
    }

    const hasColor = caps.hasColorXY || caps.hasColorHS;
    updateState = (state) => {
      applyLightState(lightService, state, caps.hasColorTemp, hasColor);
      if (caps.hasBattery) {
        const bat = accessory.getService(Service.Battery);
        if (bat) applyBatteryState(bat, state);
      }
    };
  } else if (caps.hasOccupancy) {
    category = HAP_CATEGORY_SENSOR;
    accessory = new Accessory(displayName, accessoryUuid);
    accessory.category = category;
    const motionService = accessory.addService(Service.MotionSensor);
    updateState = (state) => {
      applyMotionState(motionService, state);
      if (caps.hasBattery) {
        const bat = accessory.getService(Service.Battery);
        if (bat) applyBatteryState(bat, state);
      }
    };
  } else if (caps.hasContact) {
    category = HAP_CATEGORY_SENSOR;
    accessory = new Accessory(displayName, accessoryUuid);
    accessory.category = category;
    const contactService = accessory.addService(Service.ContactSensor);
    updateState = (state) => {
      applyContactState(contactService, state);
      if (caps.hasBattery) {
        const bat = accessory.getService(Service.Battery);
        if (bat) applyBatteryState(bat, state);
      }
    };
  } else if (caps.hasWaterLeak) {
    category = HAP_CATEGORY_SENSOR;
    accessory = new Accessory(displayName, accessoryUuid);
    accessory.category = category;
    const leakService = accessory.addService(Service.LeakSensor);
    updateState = (state) => {
      applyLeakState(leakService, state);
      if (caps.hasBattery) {
        const bat = accessory.getService(Service.Battery);
        if (bat) applyBatteryState(bat, state);
      }
    };
  } else if (caps.hasTemperature || caps.hasHumidity) {
    category = HAP_CATEGORY_SENSOR;
    accessory = new Accessory(displayName, accessoryUuid);
    accessory.category = category;
    const tempService = caps.hasTemperature
      ? accessory.addService(Service.TemperatureSensor)
      : null;
    const humidService = caps.hasHumidity ? accessory.addService(Service.HumiditySensor) : null;
    updateState = (state) => {
      applyThermoState(tempService, humidService, state);
      if (caps.hasBattery) {
        const bat = accessory.getService(Service.Battery);
        if (bat) applyBatteryState(bat, state);
      }
    };
  } else if (caps.hasPosition) {
    category = HAP_CATEGORY_WINDOW_COVERING;
    accessory = new Accessory(displayName, accessoryUuid);
    accessory.category = category;
    const coverService = accessory.addService(Service.WindowCovering);

    // Seed initial values so the first controller read is never undefined
    // (iOS would otherwise coerce the target to 0 and wedge the tile).
    coverService.getCharacteristic(Characteristic.CurrentPosition).updateValue(0);
    coverService.getCharacteristic(Characteristic.TargetPosition).updateValue(0);
    coverService
      .getCharacteristic(Characteristic.PositionState)
      .updateValue(POSITION_STATE_STOPPED);

    coverService.getCharacteristic(Characteristic.TargetPosition).onSet((value) => {
      onSet({ position: Number(value) });
    });

    updateState = (state) => {
      let position: number;
      if (typeof state.position === "number") {
        position = Math.min(100, Math.max(0, Math.round(state.position)));
      } else {
        position = 0;
        onWarn?.("Cover is uncalibrated (position is null); reporting position 0", {
          device: displayName,
        });
      }
      coverService.getCharacteristic(Characteristic.CurrentPosition).updateValue(position);

      let positionState: number;
      switch (state.state) {
        case "opening":
          positionState = POSITION_STATE_INCREASING;
          break;
        case "closing":
          positionState = POSITION_STATE_DECREASING;
          break;
        default:
          positionState = POSITION_STATE_STOPPED;
          break;
      }
      coverService.getCharacteristic(Characteristic.PositionState).updateValue(positionState);

      // Without a device-reported target position, settle the target to
      // current whenever idle; while moving, leave the last commanded target
      // in place rather than snapping it back to current.
      if (positionState === POSITION_STATE_STOPPED) {
        coverService.getCharacteristic(Characteristic.TargetPosition).updateValue(position);
      }
    };
  } else if (caps.isSwitch) {
    category = HAP_CATEGORY_SWITCH;
    accessory = new Accessory(displayName, accessoryUuid);
    accessory.category = category;
    const isOutlet = findByKind(descriptor.capabilities, ["outlet"]) !== undefined;
    const switchService = accessory.addService(isOutlet ? Service.Outlet : Service.Switch);
    const onOff = onOffProperty(descriptor.capabilities);
    switchService.getCharacteristic(Characteristic.On).onSet((value) => {
      onSet(writeOnOff(onOff, Boolean(value)));
    });
    updateState = (state) => {
      applyOnOffState(switchService, onOff, state);
      if (caps.hasBattery) {
        const bat = accessory.getService(Service.Battery);
        if (bat) applyBatteryState(bat, state);
      }
    };
  } else {
    return null;
  }

  if (caps.hasBattery) {
    accessory.addService(Service.Battery);
  }

  const info = accessory.getService(Service.AccessoryInformation);
  if (info) {
    info.getCharacteristic(Characteristic.Manufacturer).updateValue(descriptor.source);
    info.getCharacteristic(Characteristic.SerialNumber).updateValue(descriptor.id);
  }

  return { accessory, updateState };
}
