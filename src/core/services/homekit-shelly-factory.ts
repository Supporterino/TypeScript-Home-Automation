import { Accessory, Characteristic, Service, uuid } from "hap-nodejs";
import type { ShellyCoverStatus, ShellySwitchStatus } from "../../types/shelly.js";
import type { CreatedAccessory } from "./homekit-accessory-factory.js";
import { HAP_CATEGORY_SWITCH } from "./homekit-accessory-factory.js";
import type { ShellyDevice } from "./shelly-service.js";

/** @see https://github.com/homebridge/HAP-NodeJS/blob/master/src/lib/Accessory.ts */
export const HAP_CATEGORY_WINDOW_COVERING = 14;

/**
 * A write-back command emitted by a Shelly HomeKit accessory.
 *
 * - Switch/outlet accessories emit `{ on: boolean }`.
 * - Cover accessories emit `{ position: number }` (0–100 target) or
 *   `{ stop: true }`.
 */
export type ShellyAccessoryCommand = { on: boolean } | { position: number } | { stop: true };

/** A normalized status payload pushed into a Shelly accessory. */
export type ShellyAccessoryState = ShellySwitchStatus | ShellyCoverStatus;

/**
 * HAP `PositionState` values (const enum in hap-nodejs, inlined for
 * isolatedModules compatibility).
 */
const POSITION_STATE_DECREASING = 0;
const POSITION_STATE_INCREASING = 1;
const POSITION_STATE_STOPPED = 2;

/**
 * Builds a HomeKit accessory for a registered Shelly device based on its
 * `type`. Returns `null` for unrecognized types (the caller skips + logs).
 *
 * @param device The registered Shelly device (name, host, type).
 * @param onSet  Callback invoked with a write-back command when HomeKit changes
 *               a writable characteristic. Wire this to `ShellyService` methods.
 * @param onWarn Optional callback for non-fatal warnings (e.g. an uncalibrated
 *               cover). Lets the caller log with its own logger.
 */
export function buildShellyAccessory(
  device: ShellyDevice,
  onSet: (command: ShellyAccessoryCommand) => void,
  onWarn?: (message: string, context: Record<string, unknown>) => void,
): CreatedAccessory | null {
  switch (device.type) {
    case "switch":
      return createShellySwitch(device, onSet, false);
    case "outlet":
      return createShellySwitch(device, onSet, true);
    case "cover":
      return createShellyCover(device, onSet, onWarn);
    default:
      return null;
  }
}

/** Generate a stable accessory UUID per Shelly device. */
function shellyUuid(device: ShellyDevice): string {
  return uuid.generate(`shelly:${device.name}`);
}

/** Populate the AccessoryInformation service for a Shelly device. */
function applyAccessoryInfo(accessory: Accessory, device: ShellyDevice): void {
  const info = accessory.getService(Service.AccessoryInformation);
  if (info) {
    info.getCharacteristic(Characteristic.Manufacturer).updateValue("Shelly");
    info.getCharacteristic(Characteristic.Model).updateValue(device.type);
    info.getCharacteristic(Characteristic.SerialNumber).updateValue(device.name);
  }
}

/**
 * Creates a Switch (or Outlet) accessory that maps `Switch.GetStatus.output`
 * → `On` and routes `On` write-back to `onSet`.
 */
function createShellySwitch(
  device: ShellyDevice,
  onSet: (command: ShellyAccessoryCommand) => void,
  isOutlet: boolean,
): CreatedAccessory {
  const accessory = new Accessory(device.name, shellyUuid(device));
  accessory.category = HAP_CATEGORY_SWITCH;

  const service = accessory.addService(isOutlet ? Service.Outlet : Service.Switch);

  service.getCharacteristic(Characteristic.On).onSet((value) => {
    onSet({ on: Boolean(value) });
  });

  applyAccessoryInfo(accessory, device);

  const updateState = (raw: Record<string, unknown>) => {
    const state = raw as unknown as ShellySwitchStatus;
    if (typeof state.output === "boolean") {
      service.getCharacteristic(Characteristic.On).updateValue(state.output);
    }
  };

  return { accessory, updateState };
}

/**
 * Creates a WindowCovering accessory that maps `Cover.GetStatus`
 * (`current_pos` → CurrentPosition, `state` → PositionState) and routes
 * TargetPosition write-back to `onSet`.
 */
function createShellyCover(
  device: ShellyDevice,
  onSet: (command: ShellyAccessoryCommand) => void,
  onWarn?: (message: string, context: Record<string, unknown>) => void,
): CreatedAccessory {
  const accessory = new Accessory(device.name, shellyUuid(device));
  accessory.category = HAP_CATEGORY_WINDOW_COVERING;

  const service = accessory.addService(Service.WindowCovering);

  service.getCharacteristic(Characteristic.TargetPosition).onSet((value) => {
    onSet({ position: Number(value) });
  });

  applyAccessoryInfo(accessory, device);

  const updateState = (raw: Record<string, unknown>) => {
    const cover = raw as unknown as ShellyCoverStatus;

    let position: number;
    if (typeof cover.current_pos === "number") {
      position = Math.min(100, Math.max(0, Math.round(cover.current_pos)));
    } else {
      // Uncalibrated cover: HAP requires a number. Report 0 and warn.
      position = 0;
      onWarn?.("Shelly cover is uncalibrated (current_pos is null); reporting position 0", {
        device: device.name,
      });
    }

    service.getCharacteristic(Characteristic.CurrentPosition).updateValue(position);

    let positionState: number;
    switch (cover.state) {
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
    service.getCharacteristic(Characteristic.PositionState).updateValue(positionState);
  };

  return { accessory, updateState };
}
