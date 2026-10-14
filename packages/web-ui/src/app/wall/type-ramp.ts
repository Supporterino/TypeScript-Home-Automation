/**
 * The wall's Hearth distance type ramp (design.md D3; specs/wall-display "Wall
 * Glanceability"). Hearth is the wall's own visual language, so the ramp is
 * wall-owned: its numeric bounds mirror the `--hearth-text-*` tokens declared in
 * `wall/hearth.css` (the CSS declaration site) and are re-derived for distance
 * legibility. The dashboard's scale tops out at 34px, so the wall's readouts sit
 * above it.
 *
 * The ramp declares its own body floor (`bodyMin`, 18px, up from the old hard
 * 16px): no wall body text may render below it. Compact status chips are the one
 * deliberate exception and sit under the floor. Kept dependency-free so the
 * bounds are reachable by `bun test` and no ambient renderer can drift below
 * them.
 */

/** The ramp's numeric bounds, in CSS pixels. */
export interface WallTypeRamp {
  /** Hero readout (the clock time) bounds. */
  readonly heroMin: number;
  readonly heroMax: number;
  /** Metric readout (weather, energy, status values) bounds. */
  readonly metricMin: number;
  readonly metricMax: number;
  /** Widget title bounds. */
  readonly titleMin: number;
  readonly titleMax: number;
  /** The label tier (metric labels, descriptions, forecast captions). */
  readonly label: number;
  /** The smallest body text the wall may use — the wall's own floor. */
  readonly bodyMin: number;
  /** The compact status-chip exception, deliberately below the body floor. */
  readonly chip: number;
}

export const WALL_TYPE_RAMP: WallTypeRamp = Object.freeze({
  heroMin: 48,
  heroMax: 104,
  metricMin: 36,
  metricMax: 76,
  titleMin: 20,
  titleMax: 28,
  label: 20,
  bodyMin: 18,
  chip: 16,
});

/** A hero readout (the clock time): the top of the ramp, scaled by viewport. */
export const WALL_HERO_FONT_SIZE = `clamp(${WALL_TYPE_RAMP.heroMin}px, 7vmin, ${WALL_TYPE_RAMP.heroMax}px)`;

/** A metric readout (weather temperature, energy/status values). */
export const WALL_METRIC_FONT_SIZE = `clamp(${WALL_TYPE_RAMP.metricMin}px, 5vmin, ${WALL_TYPE_RAMP.metricMax}px)`;

/** A widget title, above the label tier. */
export const WALL_TITLE_FONT_SIZE = `clamp(${WALL_TYPE_RAMP.titleMin}px, 2.5vmin, ${WALL_TYPE_RAMP.titleMax}px)`;

/** A label (metric labels, descriptions, forecast captions). */
export const WALL_LABEL_FONT_SIZE = `${WALL_TYPE_RAMP.label}px`;

/** The wall's minimum body text size — the ramp's own floor. */
export const WALL_BODY_FONT_SIZE = `${WALL_TYPE_RAMP.bodyMin}px`;
