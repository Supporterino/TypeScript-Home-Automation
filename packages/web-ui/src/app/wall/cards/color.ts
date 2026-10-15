/**
 * The ported device-colour handling (design.md D7; specs/wall-display "Wall
 * Visual Language" — "A device's colour MUST NOT be the sole channel conveying
 * any state", "A device colour is an accent, not a surface").
 *
 * `improveColorContrast` is ported from `piitaya/lovelace-mushroom`
 * (Apache-2.0, `src/cards/light-card/utils.ts`): a washed-out colour has its
 * saturation raised to a floor so it stays legible, and a near-grey has its
 * value lifted instead — Mushroom's own intent is to keep a light's colour vivid
 * and readable rather than to mute it. The port reproduces Home Assistant's
 * `rgb2hsv`/`hsv2rgb` (`src/common/color/convert-color.ts`), whose HSV carries
 * value in the 0–255 range, so the ported thresholds match exactly.
 *
 * The wall's own bounded-band helper (a saturation ceiling and a lightness
 * window), written during the superseded change, is deliberately gone: it did
 * the opposite.
 *
 * Deliberately dependency-free — no React, no DOM — so the improvement is
 * reachable by `bun test`.
 */

/** An RGB colour: one channel per entry, each in the 0–255 range. */
export type Rgb = readonly [number, number, number];

/**
 * An HSV colour as Home Assistant's converter produces it: hue in degrees,
 * saturation in 0–1, value in 0–255. Exported so the wall light card's own
 * device-state derivation (`device-color.ts`) converts a reported hue through
 * this one converter rather than a second copy of the maths.
 */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

/**
 * The saturation below which a colour is raised to {@link WALL_CARD_SATURATION_FLOOR}
 * — Mushroom's `0.4` threshold.
 */
export const WALL_CARD_SATURATION_FLOOR = 0.4;

/**
 * The saturation below which a colour is treated as a near-grey and has its
 * value lifted to {@link WALL_CARD_NEAR_GREY_VALUE} instead — Mushroom's `0.1`
 * threshold.
 */
export const WALL_CARD_NEAR_GREY_SATURATION = 0.1;

/**
 * The value a near-grey colour is lifted to — Mushroom's own `225` (of 255), so
 * an almost-grey light reads as a light grey rather than a black surface.
 */
export const WALL_CARD_NEAR_GREY_VALUE = 225;

/** The alpha a device's colour is drawn at behind its glyph (Mushroom's `0.25` shape fill). */
export const WALL_CARD_SHAPE_ALPHA = 0.25;

/** The alpha a device's colour is drawn at behind its slider (Mushroom's `0.2` slider field). */
export const WALL_CARD_SLIDER_ALPHA = 0.2;

/**
 * Converts an RGB colour to Home Assistant's HSV (hue in degrees, saturation in
 * 0–1, value in 0–255). Ported to match `improveColorContrast`'s thresholds
 * exactly — including the `0` value the converters return for an achromatic
 * colour.
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

/** Converts Home Assistant's HSV back to RGB. Ported from `hsv2rgb`, so the two are exact inverses. */
export function hsvToRgb(hsv: Hsv): Rgb {
  const { h, s, v } = hsv;
  const channel = (n: number): number => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
  };
  return [channel(5), channel(3), channel(1)];
}

/**
 * Mushroom's contrast improvement: a colour whose saturation is below
 * {@link WALL_CARD_SATURATION_FLOOR} is raised to it, and one below
 * {@link WALL_CARD_NEAR_GREY_SATURATION} has its value pushed to
 * {@link WALL_CARD_NEAR_GREY_VALUE} instead. A colour at or above the floor is
 * returned unchanged. The result is unrounded, exactly as Home Assistant's
 * `hsv2rgb` produces it; {@link toCssColor} rounds for CSS.
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

/** An `rgba(r, g, b, alpha)` CSS colour, rounded to integer channels — the glyph fill or slider field of a device's colour. */
export function toCssColorWithAlpha(rgb: Rgb, alpha: number): string {
  const [r, g, b] = rgb;
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}
