/**
 * The wall's Hearth distance type ramp (wall-zones-and-fit D6, D10;
 * mushroom-wall-widgets W2; specs/wall-display "Wall Glanceability"). Hearth is
 * the wall's own visual language, so the ramp is wall-owned: its numeric bounds
 * mirror the `--hearth-text-*` tokens declared in `wall/hearth.css` (the CSS
 * declaration site) and are re-derived for distance legibility.
 *
 * The component scale is reduced (wall-zones-and-fit D10): the hero, metric,
 * title, and `vmin` coefficients are lowered so a card renders ~25–30 % smaller
 * on the panel. On the wall's 1920 × 1080 panel the readouts resolve at their
 * `vmin` term, and the hero (~54 px) and metric (~39 px) still render above the
 * dashboard's 34 px ceiling.
 *
 * A **band-readout** tier sits between the label and metric tiers
 * (`bandMin`/`bandMax`, `--hearth-text-band`), so grouped readouts — the climate
 * band — do not compete with the hero or repeat the metric tier.
 *
 * The two smallest tiers are the ported card system's own sizes
 * (mushroom-wall-widgets W2): `label` is the ported primary size and `bodyMin`
 * is the ported secondary size, so a widget's supporting text and a device
 * card's are the same type. The floor is the ported secondary size and no tier
 * sits below it — the former compact status-chip exception is retired with the
 * token that declared it, because nothing is left below the floor to except.
 * The readout tiers above them are untouched, so a readout's value keeps the
 * wall's own distance scale.
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
  /**
   * The label tier — a widget's label and every caption — the ported card
   * system's primary size.
   */
  readonly label: number;
  /**
   * The smallest body text the wall may use — the ported card system's secondary
   * size. The ramp declares no tier below it.
   */
  readonly bodyMin: number;
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
  label: 14,
  bodyMin: 12,
});

/** A hero readout (the clock time): the top of the ramp, scaled by viewport. */
export const WALL_HERO_FONT_SIZE = `clamp(${WALL_TYPE_RAMP.heroMin}px, 5vmin, ${WALL_TYPE_RAMP.heroMax}px)`;

/** A metric readout (weather temperature, energy/status values). */
export const WALL_METRIC_FONT_SIZE = `clamp(${WALL_TYPE_RAMP.metricMin}px, 3.6vmin, ${WALL_TYPE_RAMP.metricMax}px)`;

/** A band readout (a grouped readout inside a zone band). */
export const WALL_BAND_FONT_SIZE = `clamp(${WALL_TYPE_RAMP.bandMin}px, 2.4vmin, ${WALL_TYPE_RAMP.bandMax}px)`;

/** A widget title, above the label tier. */
export const WALL_TITLE_FONT_SIZE = `clamp(${WALL_TYPE_RAMP.titleMin}px, 1.8vmin, ${WALL_TYPE_RAMP.titleMax}px)`;

/** A label (metric labels, descriptions, forecast captions, band captions) — the ported primary size. */
export const WALL_LABEL_FONT_SIZE = `${WALL_TYPE_RAMP.label}px`;

/** The wall's minimum body text size — the ported secondary size; no wall body text renders below it. */
export const WALL_BODY_FONT_SIZE = `${WALL_TYPE_RAMP.bodyMin}px`;
