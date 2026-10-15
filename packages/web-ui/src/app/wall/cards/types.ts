/**
 * The props every typed wall device card receives (design.md D1, D3;
 * specs/wall-display "Widget Catalog" — "A device class has its own widget
 * type", "Wall Device Presentation"). One card module per device class composes
 * the shared anatomy for the device it is handed; the card never resolves its
 * own device from the store, so the same card renders identically wherever a
 * widget places it (specs/wall-display "The composition follows the box").
 *
 * Wall-chunk only: imported by the card renderers under `wall/cards/`, so it
 * lands in the lazy wall chunk and never in first paint (design.md D10).
 */
import type { WallTypedDeviceWidgetConfig } from "@ts-ha/shared";
import type { DeviceDescriptor } from "../../types.js";
import type { WallCardBox } from "./card-composition.js";

/** The props a typed wall device card receives. */
export interface WallDeviceCardProps {
  /** The device the card presents, already resolved by the widget that placed it. */
  device: DeviceDescriptor;
  /**
   * The typed device widget's own config (design.md D6; specs/wall-display "Wall
   * Device Presentation"): the card's `layout` and its `collapsible_controls`
   * setting. The card reads only those two — the bound device is passed
   * separately — so it composes its own options without reaching into the store
   * (specs/wall-display "The composition follows the box").
   */
  config?: WallTypedDeviceWidgetConfig;
  /**
   * The box the card is given, in CSS pixels — both dimensions (specs/wall-display
   * "Span-Aware Card Presentation"). The card resolves its composition from it
   * alone, so the same box composes identically wherever the card is drawn. When
   * absent, the card composes its fullest content ({@link DEFAULT_WALL_CARD_BOX}).
   */
  box?: WallCardBox;
  /**
   * Whether the frame around the card draws the surface, so the card draws none
   * of its own and stays a single surface (design.md D2, D9; specs/wall-display
   * "A card is a single surface"). A placed device widget's frame is
   * chrome-less, so it passes `false` and the card owns the surface.
   */
  contained?: boolean;
}
