import { Accessory, Characteristic, Service, uuid } from "hap-nodejs";
import {
  applySwitchState,
  type CreatedAccessory,
  HAP_CATEGORY_SWITCH,
} from "./homekit-accessory-factory.js";

/**
 * Builds a HomeKit Switch accessory that mirrors a boolean `StateManager` key.
 *
 * The `On` characteristic is wired to `onSet` for write-back and its value is
 * refreshed through `updateState`, which reuses `applySwitchState` so the
 * caller passes `{ state: "ON" | "OFF" }`.
 *
 * The UUID is seeded from the state key, so renaming the display name in
 * configuration does not orphan the accessory in the Home app.
 *
 * @param name     Display name shown in the Home app.
 * @param stateKey `StateManager` key this toggle exposes.
 * @param onSet    Callback invoked with the raw HomeKit boolean when the
 *                 switch is flipped in the Home app. Wire this to
 *                 `StateManager.set(stateKey, Boolean(value))`.
 */
export function buildStateToggleAccessory(
  name: string,
  stateKey: string,
  onSet: (value: boolean) => void,
): CreatedAccessory {
  const accessory = new Accessory(name, uuid.generate(`state:${stateKey}`));
  accessory.category = HAP_CATEGORY_SWITCH;

  const service = accessory.addService(Service.Switch);

  service.getCharacteristic(Characteristic.On).onSet((value) => {
    onSet(Boolean(value));
  });

  const updateState = (state: Record<string, unknown>) => {
    applySwitchState(service, state);
  };

  return { accessory, updateState };
}
