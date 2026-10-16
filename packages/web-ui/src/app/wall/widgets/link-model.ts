/**
 * Pure configuration for the wall link widget: the profile it opens and the label
 * it carries.
 */

import { WALL_CARD_PRIMARY_FONT_SIZE } from "../cards/metrics.js";
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
