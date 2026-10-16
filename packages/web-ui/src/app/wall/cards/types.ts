/**
 * The props every typed wall device card receives: the device, the widget's config,
 * the box to compose into, and whether the frame draws the surface.
 */
import type { WallTypedDeviceWidgetConfig } from "@ts-ha/shared";
import type { DeviceDescriptor } from "../../types.js";
import type { WallCardBox } from "./card-composition.js";

/** The props a typed wall device card receives. */
export interface WallDeviceCardProps {
  /** The device the card presents, already resolved by the widget that placed it. */
  device: DeviceDescriptor;
  /**
   * The typed device widget's own config: the card's `layout` and its
   * `collapsible_controls` setting.
   */
  config?: WallTypedDeviceWidgetConfig;
  /**
   * The box the card is given, in CSS pixels. When absent, the card composes its
   * fullest content.
   */
  box?: WallCardBox;
  /**
   * Whether the frame around the card draws the surface, so the card draws none of
   * its own.
   */
  contained?: boolean;
}
