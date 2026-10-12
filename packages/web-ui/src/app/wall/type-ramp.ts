/**
 * The wall's distance-readable type ramp (design.md D6; specs/wall-display
 * "Wall Glanceability"). The dashboard's body scale tops out at 16px; a wall is
 * read from across a room, so it needs a larger ramp. Kept dependency-free so
 * the bounds are reachable by `bun test` and no ambient renderer can drift
 * below them.
 */

/** The ramp's numeric bounds, in CSS pixels. */
export interface WallTypeRamp {
  /** Readout text (numerals, hero values) bounds. */
  readonly readoutMin: number;
  readonly readoutMax: number;
  /** Label text (metric labels, descriptions, captions) bounds. */
  readonly labelMin: number;
  readonly labelMax: number;
  /** The smallest body text the wall may use. */
  readonly bodyMin: number;
}

export const WALL_TYPE_RAMP: WallTypeRamp = Object.freeze({
  readoutMin: 32,
  readoutMax: 64,
  labelMin: 16,
  labelMax: 20,
  bodyMin: 16,
});

/** A hero readout (the clock time): the top of the ramp, scaled by viewport. */
export const WALL_HERO_FONT_SIZE = `clamp(${WALL_TYPE_RAMP.readoutMin}px, 6vmin, ${WALL_TYPE_RAMP.readoutMax}px)`;

/** A metric readout (weather temperature, energy/status values). */
export const WALL_METRIC_FONT_SIZE = `clamp(${WALL_TYPE_RAMP.readoutMin}px, 4.5vmin, ${WALL_TYPE_RAMP.readoutMax}px)`;

/** A label (metric labels, descriptions, forecast captions). */
export const WALL_LABEL_FONT_SIZE = `${WALL_TYPE_RAMP.labelMax}px`;

/** The wall's minimum body text size. */
export const WALL_BODY_FONT_SIZE = `${WALL_TYPE_RAMP.bodyMin}px`;
