/**
 * The wall's Hearth distance type ramp (wall-zones-and-fit D6, D10;
 * specs/wall-display "Wall Glanceability"). Hearth is the wall's own visual
 * language, so the ramp is wall-owned: its numeric bounds mirror the
 * `--hearth-text-*` tokens declared in `wall/hearth.css` (the CSS declaration
 * site) and are re-derived for distance legibility.
 *
 * The change reduces the whole component scale (wall-zones-and-fit D10): the
 * hero, metric, title, and label bounds and their `vmin` coefficients are
 * lowered so a card renders ~25–30 % smaller on the panel. Two floors are held:
 * the body floor stays at 18 px — above the spec's 16 px minimum and above the
 * dashboard's 16 px body scale — and the compact status-chip exception stays at
 * 16 px. On the wall's 1920 × 1080 panel the readouts resolve at their `vmin`
 * term, and the hero (~54 px) and metric (~39 px) still render above the
 * dashboard's 34 px ceiling.
 *
 * A **band-readout** tier is added between the label and metric tiers
 * (`bandMin`/`bandMax`, `--hearth-text-band`), so grouped readouts — the climate
 * band — do not compete with the hero or repeat the metric tier.
 *
 * Kept dependency-free so the bounds are reachable by `bun test` and no ambient
 * renderer can drift below them.
 */

/** The ramp's numeric bounds, in CSS pixels. */
export interface WallTypeRamp {
  /** Hero readout (the clock time) bounds. */
  readonly heroMin: number;
  readonly heroMax: number;
  /** Metric readout (weather, energy, status values) bounds. */
  readonly metricMin: number;
  readonly metricMax: number;
  /**
   * Band readout (a grouped readout inside a zone band) bounds. Sits between the
   * label tier below it and the metric tier above it.
   */
  readonly bandMin: number;
  readonly bandMax: number;
  /** Widget title bounds. */
  readonly titleMin: number;
  readonly titleMax: number;
  /** The label tier (metric labels, descriptions, forecast captions, band captions). */
  readonly label: number;
  /** The smallest body text the wall may use — the wall's own floor. */
  readonly bodyMin: number;
  /** The compact status-chip exception, deliberately below the body floor. */
  readonly chip: number;
}

export const WALL_TYPE_RAMP: WallTypeRamp = Object.freeze({
  heroMin: 36,
  heroMax: 76,
  metricMin: 26,
  metricMax: 54,
  bandMin: 20,
  bandMax: 32,
  titleMin: 18,
  titleMax: 22,
  label: 18,
  bodyMin: 18,
  chip: 16,
});

/** A hero readout (the clock time): the top of the ramp, scaled by viewport. */
export const WALL_HERO_FONT_SIZE = `clamp(${WALL_TYPE_RAMP.heroMin}px, 5vmin, ${WALL_TYPE_RAMP.heroMax}px)`;

/** A metric readout (weather temperature, energy/status values). */
export const WALL_METRIC_FONT_SIZE = `clamp(${WALL_TYPE_RAMP.metricMin}px, 3.6vmin, ${WALL_TYPE_RAMP.metricMax}px)`;

/** A band readout (a grouped readout inside a zone band). */
export const WALL_BAND_FONT_SIZE = `clamp(${WALL_TYPE_RAMP.bandMin}px, 2.4vmin, ${WALL_TYPE_RAMP.bandMax}px)`;

/** A widget title, above the label tier. */
export const WALL_TITLE_FONT_SIZE = `clamp(${WALL_TYPE_RAMP.titleMin}px, 1.8vmin, ${WALL_TYPE_RAMP.titleMax}px)`;

/** A label (metric labels, descriptions, forecast captions, band captions). */
export const WALL_LABEL_FONT_SIZE = `${WALL_TYPE_RAMP.label}px`;

/** The wall's minimum body text size — the ramp's own floor. */
export const WALL_BODY_FONT_SIZE = `${WALL_TYPE_RAMP.bodyMin}px`;
