/**
 * The ported device-card metrics, numbers ported verbatim from
 * `piitaya/lovelace-mushroom` (Apache-2.0).
 */

/** The wall device card's ported metrics, in CSS pixels (or a ratio where noted). */
export interface WallCardMetrics {
  /** The circular icon affordance's shape side (Mushroom `--icon-size`). */
  readonly iconSize: number;
  /** The glyph's size as a fraction of the shape's own em (Mushroom `--icon-symbol-size`). */
  readonly iconSymbol: number;
  /** The shape's corner radius — a circle (Mushroom `--icon-border-radius`). */
  readonly iconShapeRadius: string;
  /** The device name's size (Mushroom `--card-primary-font-size`). */
  readonly primarySize: number;
  /** The device name's weight (Mushroom `--card-primary-font-weight`). */
  readonly primaryWeight: number;
  /** The device name's line height (Mushroom `--card-primary-line-height`). */
  readonly primaryLeading: number;
  /** The device name's letter spacing (Mushroom `--card-primary-letter-spacing`). */
  readonly primaryTracking: number;
  /** The state/reading line's size (Mushroom `--card-secondary-font-size`). */
  readonly secondarySize: number;
  /** The state/reading line's weight (Mushroom `--card-secondary-font-weight`). */
  readonly secondaryWeight: number;
  /** The state/reading line's line height (Mushroom `--card-secondary-line-height`). */
  readonly secondaryLeading: number;
  /** The state/reading line's letter spacing (Mushroom `--card-secondary-letter-spacing`). */
  readonly secondaryTracking: number;
  /** The control's height — the wall's touch target (Mushroom `--control-height`). */
  readonly controlHeight: number;
  /** The control's corner radius (Mushroom `--control-border-radius`). */
  readonly controlRadius: number;
  /** The space between adjacent controls (Mushroom `--control-spacing`). */
  readonly controlSpacing: number;
  /** The card surface's padding (Mushroom `--spacing`). */
  readonly padding: number;
  /** The card surface's corner radius (Mushroom card radius, HA 12px). */
  readonly radius: number;
  /** The slider's height — the same touch target as a control. */
  readonly sliderHeight: number;
  /** The slider track's corner radius. */
  readonly sliderRadius: number;
  /** The slider thumb's width — Mushroom's bar thumb. */
  readonly sliderThumb: number;
  /** The slider thumb's corner radius. */
  readonly sliderThumbRadius: number;
}

export const WALL_CARD_METRICS: WallCardMetrics = Object.freeze({
  iconSize: 36,
  iconSymbol: 0.667,
  iconShapeRadius: "50%",
  primarySize: 14,
  primaryWeight: 500,
  primaryLeading: 20,
  primaryTracking: 0.1,
  secondarySize: 12,
  secondaryWeight: 400,
  secondaryLeading: 16,
  secondaryTracking: 0.4,
  controlHeight: 42,
  controlRadius: 12,
  controlSpacing: 12,
  padding: 10,
  radius: 12,
  sliderHeight: 42,
  sliderRadius: 12,
  sliderThumb: 10,
  sliderThumbRadius: 3,
});

/**
 * The glyph side, in CSS pixels: {@link WALL_CARD_METRICS.iconSize} at the ported
 * `0.667em` symbol ratio.
 */
export const WALL_CARD_GLYPH_SIZE = Math.round(
  WALL_CARD_METRICS.iconSize * WALL_CARD_METRICS.iconSymbol,
);

/** The device name's font size, as a CSS length. */
export const WALL_CARD_PRIMARY_FONT_SIZE = `${WALL_CARD_METRICS.primarySize}px`;

/** The state/reading line's font size, as a CSS length. */
export const WALL_CARD_SECONDARY_FONT_SIZE = `${WALL_CARD_METRICS.secondarySize}px`;

/** The icon shape's side, as a CSS length. */
export const WALL_CARD_ICON_SIZE = `${WALL_CARD_METRICS.iconSize}px`;
