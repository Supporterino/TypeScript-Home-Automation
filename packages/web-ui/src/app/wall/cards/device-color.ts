/**
 * The wall light card's device colour, derived from the device's own state: a
 * reported hue/saturation or colour temperature, contrast-improved.
 */
import { hsvToRgb, improveColorContrast, type Rgb } from "./color.js";

/** The saturation assumed when the device declares none — fully saturated. */
const DEFAULT_SATURATION_PERCENT = 100;

/** The HSV value a bare hue/saturation pair is lit at — full brightness (255). */
const FULL_VALUE = 255;

/** The white balance, in mireds, at either end of the reported range. */
const KELVIN_AT_MIN_MIRED = 1000;
const KELVIN_AT_MAX_MIRED = 40000;

/** Reads a finite numeric entry from a record, or `undefined` when it is absent or not a number. */
function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Reads a nested object entry from a record, or `undefined` when it is absent or not an object. */
function readRecord(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = record[key];
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Clamps a channel to the 0–255 range and rounds it for CSS. */
function clampChannel(channel: number): number {
  return Math.min(255, Math.max(0, channel));
}

/**
 * The `{hue, saturation}` pair a colour light reports, top-level or beneath its
 * `color` composite. Saturation is optional, in HA's 0–100 range.
 */
function readHueSaturation(
  state: Record<string, unknown>,
): { hue: number; saturation?: number } | undefined {
  const composite = readRecord(state, "color");
  const hue = readNumber(state, "hue") ?? (composite ? readNumber(composite, "hue") : undefined);
  if (hue === undefined) return undefined;
  const saturation =
    readNumber(state, "saturation") ??
    (composite ? readNumber(composite, "saturation") : undefined);
  return { hue, saturation };
}

/**
 * Approximates the RGB of a black-body radiator at `mired` (Tanner Helland's
 * algorithm), clamping a mired outside the meaningful range.
 */
export function colorTemperatureToRgb(mired: number): Rgb {
  const kelvin = Math.min(KELVIN_AT_MAX_MIRED, Math.max(KELVIN_AT_MIN_MIRED, 1_000_000 / mired));
  const temp = kelvin / 100;
  const red = temp <= 66 ? 255 : 329.698727446 * (temp - 60) ** -0.1332047592;
  const green =
    temp <= 66
      ? 99.4708025861 * Math.log(temp) - 161.1195681661
      : 288.1221695283 * (temp - 60) ** -0.0755148492;
  const blue =
    temp >= 66 ? 255 : temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  return [clampChannel(red), clampChannel(green), clampChannel(blue)];
}

/**
 * The contrast-improved colour a device reports in its own state, or `undefined`
 * when it reports none.
 */
export function deviceColorRgb(state: Record<string, unknown>): Rgb | undefined {
  const hueSaturation = readHueSaturation(state);
  if (hueSaturation) {
    const saturation = Math.min(
      1,
      Math.max(0, (hueSaturation.saturation ?? DEFAULT_SATURATION_PERCENT) / 100),
    );
    const hue = ((hueSaturation.hue % 360) + 360) % 360;
    return improveColorContrast(hsvToRgb({ h: hue, s: saturation, v: FULL_VALUE }));
  }

  const mired = readNumber(state, "color_temp");
  if (mired !== undefined) return improveColorContrast(colorTemperatureToRgb(mired));

  return undefined;
}
