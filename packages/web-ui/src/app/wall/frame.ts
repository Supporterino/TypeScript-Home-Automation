/**
 * Pure decisions for the widget frame (design.md D2, D6; specs/wall-display
 * "Wall Glanceability", "Wall Visual Language"). Dependency-free so the
 * ambient-vs-control presentation and the opt-in title rule are reachable by
 * `bun test` without a DOM, while {@link WidgetFrame} stays a thin wrapper. The
 * composition model is unchanged: only the tokens the frame draws with move from
 * Lumen to Hearth.
 */
import type { WallWidget, WallWidgetType } from "@ts-ha/shared";
import type { WallWidgetGrammar } from "./registry.js";

/**
 * The surface a frame draws for a widget's grammar. `ambient` readouts are
 * chrome-less — no surface, no border, no background — so large type sits
 * directly on the panel; `control` widgets draw a Hearth surface tile with a
 * hairline border and the Hearth radius (design.md D2, "Wall Visual Language").
 * Every token is wall-owned (`--hearth-*`), never a Lumen alias.
 */
export interface WallFrameChrome {
  /** Whether the frame renders a control surface. */
  surface: boolean;
  /** The control surface background token, or `null` for a chrome-less readout. */
  background: string | null;
  /** The control surface border color token, or `null` for a chrome-less readout. */
  borderColor: string | null;
  /** The control surface corner radius token, or `null` for a chrome-less readout. */
  radius: string | null;
}

/** Maps a widget's grammar to the frame surface it draws (design.md D2). */
export function wallFrameChrome(grammar: WallWidgetGrammar): WallFrameChrome {
  if (grammar === "ambient") {
    return { surface: false, background: null, borderColor: null, radius: null };
  }
  return {
    surface: true,
    background: "var(--hearth-surface)",
    borderColor: "var(--hearth-hairline)",
    radius: "var(--hearth-radius-md)",
  };
}

/**
 * Whether the frame draws a widget's card surface. The `device` widget's frame
 * is chrome-less: its single device card owns the surface (or, for a readout
 * archetype, deliberately draws none), so the frame must not draw a second one
 * (design.md D2, D4; specs/wall-display "A card is a single surface"). Every
 * other type keeps the grammar-derived surface, so the mapping in
 * {@link wallFrameChrome} is unchanged.
 */
export function wallFrameDrawsSurface(type: WallWidgetType, grammar: WallWidgetGrammar): boolean {
  if (type === "device") return false;
  return wallFrameChrome(grammar).surface;
}

/**
 * The widget's configured title, or `null` when none is set (design.md D3).
 * Headers are opt-in: without a configured title the widget's own content
 * labels it, so the type label is never used as a fallback.
 */
export function widgetTitle(widget: WallWidget): string | null {
  const configured = widget.config.title;
  if (typeof configured === "string" && configured.trim().length > 0) return configured;
  return null;
}
