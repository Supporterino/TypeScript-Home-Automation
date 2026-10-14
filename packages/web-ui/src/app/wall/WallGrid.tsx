/**
 * The full-bleed 12-column wall grid (design.md D1, D6; specs/wall-display
 * "Widget Grid Layout", "Widget Catalog", "Wall Glanceability"). Maps a
 * profile's placements to CSS grid and dispatches each cell to its registry
 * renderer inside a frame. Rows use a bounded unit derived from the measured
 * panel height so a widget's height tracks its span, and the composition is
 * centered vertically. A widget whose renderer throws is contained by a
 * per-widget {@link ErrorBoundary}, so one broken widget never takes down the
 * profile.
 *
 * Re-skinned onto Hearth (design.md D6): the root is the wall's Hearth scope
 * (`data-wall-chunk`), on which Hearth's own stylesheet paints the true-black
 * canvas and foreground, so the composition model is unchanged — the grid style
 * is still the pure {@link wallGridStyle}, so the clamped row unit, the widget
 * positions/sizes, the single gutter, and the centering rule stay the wall's own
 * grammar rather than a stock layout.
 */
import type { WallProfileConfig } from "@ts-ha/shared";
import { useEffect, useRef, useState } from "react";
import { ErrorBoundary } from "../components/ErrorBoundary.js";
import { gridPlacementStyle, resolveLayout, wallGridStyle } from "./grid.js";
// Hearth — the wall's own stylesheet, delivered on demand (design.md D2, D5;
// specs/wall-display "On-Demand Wall Stylesheet"; specs/web-ui "On-Demand Feature
// Stylesheets"). The build loads it as a file asset, so Bun emits it as its own
// content-hashed stylesheet referenced by this wall chunk — never folded into the
// entry CSS. It is linked here, when the chunk is evaluated ahead of the wall's
// first render, so the dashboard neither references nor fetches it.
import hearthStylesheetUrl from "./hearth.css";
import { WALL_CHUNK_MARKER } from "./registry.js";
import { useOrientation } from "./use-orientation.js";
import { WidgetFrame } from "./WidgetFrame.js";

if (typeof document !== "undefined") {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL(hearthStylesheetUrl, import.meta.url).href;
  document.head.appendChild(link);
}

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
