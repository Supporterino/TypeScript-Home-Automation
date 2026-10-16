/**
 * The ported device-colour handling: `improveColorContrast` is ported from
 * `piitaya/lovelace-mushroom` (Apache-2.0, `src/cards/light-card/utils.ts`).
 */

/** An RGB colour: one channel per entry, each in the 0–255 range. */
export type Rgb = readonly [number, number, number];

/**
 * An HSV colour as Home Assistant's converter produces it: hue in degrees,
 * saturation in 0–1, value in 0–255.
 */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

/** The saturation a colour below is raised to — Mushroom's `0.4` threshold. */
export const WALL_CARD_SATURATION_FLOOR = 0.4;

/**
 * The saturation below which a colour is treated as a near-grey — Mushroom's `0.1`
 * threshold.
 */
export const WALL_CARD_NEAR_GREY_SATURATION = 0.1;

/**
 * The value a near-grey colour is lifted to — Mushroom's `225` of 255.
 */
export const WALL_CARD_NEAR_GREY_VALUE = 225;

/** The alpha a device's colour is drawn at behind its glyph (Mushroom's `0.25` shape fill). */
export const WALL_CARD_SHAPE_ALPHA = 0.25;

/** The alpha a device's colour is drawn at behind its slider (Mushroom's `0.2` slider field). */
export const WALL_CARD_SLIDER_ALPHA = 0.2;

/**
 * Converts an RGB colour to Home Assistant's HSV, matching `improveColorContrast`'s
 * thresholds exactly.
 */
function rgbToHsv(rgb: Rgb): Hsv {
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  const rawHue =
    chroma === 0
      ? 0
      : max === r
        ? (g - b) / chroma
        : max === g
          ? 2 + (b - r) / chroma
          : 4 + (r - g) / chroma;
  return {
    h: (rawHue < 0 ? rawHue + 6 : rawHue) * 60,
    s: max === 0 ? 0 : chroma / max,
    v: max,
  };
}

/** Converts Home Assistant's HSV back to RGB, the exact inverse of `rgbToHsv`. */
export function hsvToRgb(hsv: Hsv): Rgb {
  const { h, s, v } = hsv;
  const channel = (n: number): number => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
  };
  return [channel(5), channel(3), channel(1)];
}

/**
 * Mushroom's contrast improvement: a colour below the saturation floor is raised to
 * it, and a near-grey has its value pushed instead.
 */
export function improveColorContrast(rgb: Rgb): Rgb {
  const hsv = rgbToHsv(rgb);
  if (hsv.s < WALL_CARD_SATURATION_FLOOR) {
    if (hsv.s < WALL_CARD_NEAR_GREY_SATURATION) {
      hsv.v = WALL_CARD_NEAR_GREY_VALUE;
    } else {
      hsv.s = WALL_CARD_SATURATION_FLOOR;
    }
  }
  return hsvToRgb(hsv);
}

/** A `rgb(r, g, b)` CSS colour, rounded to integer channels. */
export function toCssColor(rgb: Rgb): string {
  const [r, g, b] = rgb;
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/** An `rgba(r, g, b, alpha)` CSS colour, rounded to integer channels. */
export function toCssColorWithAlpha(rgb: Rgb, alpha: number): string {
  const [r, g, b] = rgb;
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}
