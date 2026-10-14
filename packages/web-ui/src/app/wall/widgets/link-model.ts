/**
 * Pure configuration for the wall link widget (wall-zones-and-fit D11;
 * specs/wall-display "Wall Navigation", "Widget Catalog"). A link's only
 * settings are the profile it opens and the label it carries, so this module
 * resolves both — kept dependency-free (no React, no DOM) so the rules are
 * reachable by `bun test`. The address itself is the router's own
 * (`wallPath`), never a second form built here.
 */

import type { WallWidgetTier } from "../span.js";
import { WALL_LABEL_FONT_SIZE, WALL_TITLE_FONT_SIZE } from "../type-ramp.js";

/**
 * The profile a link opens — the config's `target`, trimmed — or `null` when
 * none is configured. A link without a target has nothing to open, so the
 * renderer explains it inside its own area rather than rendering a dead
 * affordance.
 */
export function linkTarget(config: Record<string, unknown>): string | null {
  const value = config.target;
  if (typeof value !== "string") return null;
  const target = value.trim();
  return target.length > 0 ? target : null;
}

/**
 * The label a link presents: the configured `label`, else the target profile's
 * own name, so a link is never labelled with an empty string. `null` when
 * neither is available.
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
 * The tier a link presents its label on (wall-zones-and-fit D3; specs/wall-display
 * "Span-Aware Card Presentation"): a link placed at its minimum span sets its
 * label on the label tier, and one with room uses the title tier — so a large
 * link does not repeat the composition its smallest span draws.
 */
export function linkLabelFontSize(tier: WallWidgetTier): string {
  return tier === "compact" ? WALL_LABEL_FONT_SIZE : WALL_TITLE_FONT_SIZE;
}
