/**
 * Pure decisions for the widget frame (design.md D2, D3; specs/wall-display
 * "Wall Glanceability"). Dependency-free so the ambient-vs-control presentation
 * and the opt-in title rule are reachable by `bun test` without a DOM, while
 * {@link WidgetFrame} stays a thin wrapper.
 */
import type { WallWidget } from "@ts-ha/shared";
import type { WallWidgetGrammar } from "./registry.js";

/**
 * The surface a frame draws for a widget's grammar. `ambient` readouts are
 * chrome-less — no `Paper`, no border, no background — so large type sits
 * directly on the panel; `control` widgets draw a `--surface` tile with a
 * hairline border and the shared tile radius (design.md D2).
 */
export interface WallFrameChrome {
  /** Whether the frame renders a `Paper` control surface. */
  surface: boolean;
  /** The control surface background token, or `null` for a chrome-less readout. */
  background: string | null;
  /** The control surface border color token, or `null` for a chrome-less readout. */
  borderColor: string | null;
  /** The control surface corner radius token, or `null` for a chrome-less readout. */
  radius: string | null;
  /** The control surface padding token, or `null` for a chrome-less readout. */
  padding: string | null;
}

/** Maps a widget's grammar to the frame surface it draws (design.md D2). */
export function wallFrameChrome(grammar: WallWidgetGrammar): WallFrameChrome {
  if (grammar === "ambient") {
    return { surface: false, background: null, borderColor: null, radius: null, padding: null };
  }
  return {
    surface: true,
    background: "var(--surface)",
    borderColor: "var(--hairline)",
    radius: "var(--radius-tile)",
    padding: "var(--space-4)",
  };
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
