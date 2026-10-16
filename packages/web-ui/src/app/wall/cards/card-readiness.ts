/**
 * The per-card "presents controls" readiness, keyed by device class: each typed card's
 * own predicate, so the device-aware one-row rule reads a card's real controls and can
 * never admit a one-row cell for a card that would still draw a control.
 */
import type { Capability } from "@ts-ha/shared";
import { climateCardPresentsControls } from "./ClimateCard.js";
import { coverCardPresentsControls } from "./CoverCard.js";
import type { WallDeviceClass } from "./device-class.js";
import { fanCardPresentsControls } from "./FanCard.js";
import { lightCardPresentsControls } from "./LightCard.js";
import { lockCardPresentsControls } from "./LockCard.js";
import { numberCardPresentsControls } from "./NumberCard.js";
import { selectCardPresentsControls } from "./SelectCard.js";

/**
 * One predicate per device class: whether its card presents a control for a device's
 * capabilities. Typed as a total record, so a new class is a compile error.
 */
const CARD_PRESENTS_CONTROLS: Readonly<
  Record<WallDeviceClass, (capabilities: Capability[]) => boolean>
> = Object.freeze({
  light: lightCardPresentsControls,
  cover: coverCardPresentsControls,
  fan: fanCardPresentsControls,
  climate: climateCardPresentsControls,
  lock: lockCardPresentsControls,
  number: numberCardPresentsControls,
  select: selectCardPresentsControls,
  // The entity card's control *is* the card itself, so it never draws an actions row.
  entity: () => false,
});

/** Whether the card of `deviceClass` presents a control for a device's capabilities. */
export function devicePresentsControls(
  deviceClass: WallDeviceClass,
  capabilities: Capability[],
): boolean {
  return CARD_PRESENTS_CONTROLS[deviceClass](capabilities);
}
