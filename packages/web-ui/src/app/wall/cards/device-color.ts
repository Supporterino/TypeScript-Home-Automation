/**
 * The wall light card's device colour, derived from the device's own state
 * (design.md D7; specs/wall-display "Wall Visual Language" — "A device colour is
 * an accent, not a surface", "A device without a colour falls back to the wall's
 * accent").
 *
 * Mushroom draws a light's colour from Home Assistant's `rgb_color` attribute;
 * this codebase's device model has no such attribute. What a colour light
 * reports is a numeric `hue` (and `saturation`) — top-level, or beneath its
 * `color` composite — and what a white-spectrum light reports is `color_temp`
 * in mireds. This module is the one place that reads those shapes: hue and
 * saturation are converted to RGB through Home Assistant's own HSV converter
 * ({@link hsvToRgb}), a colour temperature through the standard black-body
 * approximation ({@link colorTemperatureToRgb}), and the result is contrast-
 * improved with {@link improveColorContrast} before it becomes the icon glyph's
 * fill or the slider's field. Mushroom treats a light that reports neither as
 * having no colour, and so does this: `undefined` is returned and the card falls
 * back to the wall's own accent.
 *
 * Deliberately dependency-free — no React, no DOM — so the derivation is
 * reachable by `bun test`.
 */
import { hsvToRgb, improveColorContrast, type Rgb } from "./color.js";

/** The saturation a colour channel is assumed to carry when the device declares none — fully saturated. */
const DEFAULT_SATURATION_PERCENT = 100;

/** The HSV value a bare hue/saturation pair is lit at — full brightness (Mushroom's own `hsv` reads colour at value 255). */
const FULL_VALUE = 255;

/** The white balance of a fully colour-temperature-driven colour, in mireds at either end of the reported range. */
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
 * The `{hue, saturation}` pair a colour light reports, whether it carries them
 * top-level or beneath its `color` composite. Saturation is optional — a source
 * may report a bare hue — and is read in Home Assistant's 0–100 range.
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
 * Approximates the RGB of a black-body radiator at `mired` — Home Assistant's
 * own colour-temperature treatment, Tanner Helland's algorithm, so a
 * white-spectrum light reads warm or cool rather than falling back to the wall's
 * accent. A mired outside the physically meaningful range is clamped to it, and
 * the result is left unrounded for {@link toCssColor} to round.
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
 * when it reports none. A reported hue is converted through Home Assistant's HSV
 * (saturation defaults to fully saturated when the source names only a hue), and
 * a reported colour temperature through the black-body approximation; either way
 * the result passes through {@link improveColorContrast}, so the caller draws it
 * as a glyph fill or a slider field exactly as Mushroom does.
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
