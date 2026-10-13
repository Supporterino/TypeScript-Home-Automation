/**
 * The full-bleed 12-column wall grid (design.md D13; specs/wall-display "Widget
 * Grid Layout", "Widget Catalog", "Wall Glanceability"). Maps a profile's
 * placements to CSS grid and dispatches each cell to its registry renderer
 * inside a frame. Rows use a bounded unit derived from the measured panel
 * height so a widget's height tracks its span, and the composition is centered
 * vertically. A widget whose renderer throws is contained by a per-widget
 * {@link ErrorBoundary}, so one broken widget never takes down the profile.
 *
 * Rebuilt on the Lumen layers (design.md D13): the grid style is still the pure
 * {@link wallGridStyle}, so the clamped row unit, the single gutter, and the
 * centering rule stay the wall's own grammar rather than a stock layout.
 */
import type { WallProfileConfig } from "@ts-ha/shared";
import { useEffect, useRef, useState } from "react";
import { ErrorBoundary } from "../components/ErrorBoundary.js";
import { gridPlacementStyle, resolveLayout, wallGridStyle } from "./grid.js";
import { WALL_CHUNK_MARKER } from "./registry.js";
import { useOrientation } from "./use-orientation.js";
import { WidgetFrame } from "./WidgetFrame.js";

/** The panel's inner height in CSS pixels; `0` before a DOM exists. */
function panelHeight(): number {
  return typeof window === "undefined" ? 0 : window.innerHeight;
}

export function WallGrid({ config }: { config: WallProfileConfig }) {
  const orientation = useOrientation();
  const widgets = resolveLayout(config, orientation);
  // Measured live by ResizeObserver so a same-orientation viewport change (a
  // desktop resize, a kiosk toolbar auto-hiding) re-resolves the row unit and
  // the fit decision; the viewport height is the fallback until the first
  // measurement, so the first paint is not sized to zero.
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setHeight(element.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const style = wallGridStyle({ widgets, availableHeight: height || panelHeight() });

  return (
    <div ref={ref} data-wall-chunk={WALL_CHUNK_MARKER} style={style}>
      {widgets.map((widget) => (
        <div key={widget.id} style={{ ...gridPlacementStyle(widget), minWidth: 0, minHeight: 0 }}>
          <ErrorBoundary>
            <WidgetFrame widget={widget} />
          </ErrorBoundary>
        </div>
      ))}
    </div>
  );
}
