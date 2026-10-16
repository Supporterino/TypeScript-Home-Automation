/**
 * Pure configuration for the wall link widget: the profile it opens, the label it
 * carries, and the composition its placement resolves.
 */

import { WALL_CARD_PRIMARY_FONT_SIZE } from "../cards/metrics.js";
import type { WallWidgetSpan } from "../registry.js";
import type { WallWidgetTier } from "../span.js";
import { WALL_TITLE_FONT_SIZE } from "../type-ramp.js";

/**
 * The profile a link opens — the config's `target`, trimmed — or `null` when none
 * is configured.
 */
export function linkTarget(config: Record<string, unknown>): string | null {
  const value = config.target;
  if (typeof value !== "string") return null;
  const target = value.trim();
  return target.length > 0 ? target : null;
}

/**
 * The label a link presents: the configured `label`, else the target profile's own
 * name. `null` when neither is available.
 */
export function linkLabel(config: Record<string, unknown>, target: string | null): string | null {
  const value = config.label;
  if (typeof value === "string") {
    const label = value.trim();
    if (label.length > 0) return label;
  }
  return target;
}

/**
 * The size a link presents its label on: the ported primary size at its minimum
 * span, the wall's title tier with room.
 */
export function linkLabelFontSize(tier: WallWidgetTier): string {
  return tier === "compact" ? WALL_CARD_PRIMARY_FONT_SIZE : WALL_TITLE_FONT_SIZE;
}

/**
 * The composition a link tile draws at its placement: the chrome-less `flush` one-row
 * form, the framed `pill` above it.
 */
export type LinkTileLayout = "flush" | "pill";

/**
 * The link's own minimum span — the registry's `link.min`, declared here to keep this
 * module free of the widget registry.
 */
export const LINK_MIN_SPAN: WallWidgetSpan = { w: 2, h: 1 };

/**
 * The link's composition for `placement`: a placement at the type's one-row minimum draws
 * the chrome-less flush form, so the whole cell is the anchor; above it the framed pill
 * returns.
 */
export function linkTileLayout(placement: WallWidgetSpan): LinkTileLayout {
  return placement.h <= LINK_MIN_SPAN.h ? "flush" : "pill";
}
