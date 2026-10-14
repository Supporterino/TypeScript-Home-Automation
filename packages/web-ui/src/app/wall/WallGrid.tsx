/**
 * The full-bleed 12-column wall grid (design.md D1, D6; wall-zones-and-fit D2,
 * D5; specs/wall-display "Widget Grid Layout", "Wall Zones", "Panel Fit",
 * "Widget Catalog", "Wall Glanceability"). Maps a profile's placements to CSS
 * grid and dispatches each cell to its registry renderer inside a frame. Rows
 * use a bounded unit derived from the measured panel height so a widget's
 * height tracks its span, and the composition is centered vertically. A widget
 * whose renderer throws is contained by a per-widget {@link ErrorBoundary}, so
 * one broken widget never takes down the profile.
 *
 * Zones (wall-zones-and-fit D2): the widgets sharing a `zone` label render
 * inside one band — a tinted Hearth field at the band's bounding box, carrying
 * the zone's caption, drawn *behind* the widget cells so a member keeps its own
 * surface and no surface is nested in another.
 *
 * Panel fit (wall-zones-and-fit D5; specs/wall-display "Panel Fit"): the wall
 * never scrolls. The pure {@link wallGridMetrics} verdict decides the render —
 * a composition that cannot fit the panel at the wall's floors renders a
 * contained explanation with a route to the editor instead of a scroll or a
 * clipped composition, and a widget whose own content cannot fit its span pages
 * rather than overflowing (the device grid).
 *
 * Re-skinned onto Hearth (design.md D6): the root is the wall's Hearth scope
 * (`data-wall-chunk`), on which Hearth's own stylesheet paints the true-black
 * canvas and foreground, so the composition model is unchanged — the grid style
 * is still the pure {@link wallGridStyle}, so the clamped row unit, the widget
 * positions/sizes, the single gutter, and the centering rule stay the wall's own
 * grammar rather than a stock layout.
 */
import type { WallProfileConfig } from "@ts-ha/shared";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { ErrorBoundary } from "../components/ErrorBoundary.js";
import { wallsPath } from "../lib/router.js";
import { Link, useRouter } from "../lib/router-context.js";
import { resolveBands, type WallBand } from "./bands.js";
import { wallBandChrome } from "./frame.js";
import {
  gridPlacementStyle,
  resolveLayout,
  WALL_GUTTER,
  wallGridMetrics,
  wallGridStyle,
} from "./grid.js";
// Hearth — the wall's own stylesheet, delivered on demand (design.md D2, D5;
// specs/wall-display "On-Demand Wall Stylesheet"; specs/web-ui "On-Demand Feature
// Stylesheets"). The build loads it as a file asset, so Bun emits it as its own
// content-hashed stylesheet referenced by this wall chunk — never folded into the
// entry CSS. It is linked here, when the chunk is evaluated ahead of the wall's
// first render, so the dashboard neither references nor fetches it.
import hearthStylesheetUrl from "./hearth.css";
import { WALL_CHUNK_MARKER } from "./registry.js";
import { WALL_LABEL_FONT_SIZE, WALL_TITLE_FONT_SIZE } from "./type-ramp.js";
import { useOrientation } from "./use-orientation.js";
import { WidgetFrame } from "./WidgetFrame.js";
import { WallCardMessage } from "./widgets/card-vocab.js";

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

/**
 * The band layer's per-band style: the band's grid placement (its members'
 * bounding box) plus the band surface, below the widget cells and inert to
 * touch so a tap between members passes through to the grid.
 *
 * {@link wallBandChrome} describes the band's own field with token names —
 * `background` and `radius` — and `radius` is not a CSS property, so a spread
 * would drop it and the band would render with square corners. Each consumer maps
 * the chrome, exactly as `WidgetFrame` maps the frame's.
 */
function bandStyle(band: WallBand): CSSProperties {
  const chrome = wallBandChrome();
  return {
    ...gridPlacementStyle(band),
    background: chrome.background,
    borderRadius: chrome.radius,
    zIndex: 0,
    pointerEvents: "none",
    display: "flex",
    alignItems: "flex-start",
    padding: "var(--hearth-space-4)",
    overflow: "hidden",
    minWidth: 0,
    minHeight: 0,
  };
}

/** The band's caption: the wall's label tier, uppercase, quiet — a container label, not a readout. */
const BAND_CAPTION_STYLE: CSSProperties = {
  color: "var(--hearth-text-muted)",
  fontSize: WALL_LABEL_FONT_SIZE,
  fontWeight: "var(--hearth-weight-semibold)",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

/**
 * The contained explanation an authored composition that cannot fit the panel
 * renders instead of a clipped or scrolling grid (design.md D5; specs/wall-display
 * "Panel Fit"). It is the wall's own message form plus a route to the editor,
 * so the state is actionable rather than silent, and it never scrolls.
 */
const TOO_LARGE_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--hearth-space-4)",
  width: "100vw",
  height: "100dvh",
  boxSizing: "border-box",
  padding: WALL_GUTTER,
  overflow: "hidden",
  textAlign: "center",
};

const TOO_LARGE_HEADING_STYLE: CSSProperties = {
  margin: 0,
  color: "var(--hearth-text)",
  fontFamily: "var(--hearth-font-display)",
  fontSize: WALL_TITLE_FONT_SIZE,
  fontWeight: "var(--hearth-weight-bold)",
};

const TOO_LARGE_ROUTE_STYLE: CSSProperties = {
  color: "var(--hearth-info)",
  fontSize: WALL_LABEL_FONT_SIZE,
  fontWeight: "var(--hearth-weight-semibold)",
  textUnderlineOffset: "4px",
};

export function WallGrid({ config }: { config: WallProfileConfig }) {
  const { basePath } = useRouter();
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
  const availableHeight = height || panelHeight();
  // The pure verdict decides the branch; the style is the wall's own layout
  // grammar and resolves the same rule (design.md D1, D5). The row unit is handed
  // to each widget, so a span-derived layout (the device grid's pages) resolves
  // against the panel the composition was actually placed on.
  const { outcome, rowUnit } = wallGridMetrics(availableHeight, widgets);

  // The wall never scrolls: an authored composition that cannot fit the panel
  // at the wall's floors is explained, not clipped or made scrollable.
  if (outcome === "tooLarge") {
    return (
      <div ref={ref} data-wall-chunk={WALL_CHUNK_MARKER} style={TOO_LARGE_STYLE}>
        <h2 style={TOO_LARGE_HEADING_STYLE}>Too large for this panel</h2>
        <WallCardMessage>
          This wall's composition cannot fit the panel at the wall's minimum touch target and body
          size. Remove or resize a widget in the wall editor.
        </WallCardMessage>
        <Link to={wallsPath(basePath)} style={TOO_LARGE_ROUTE_STYLE}>
          Open the wall editor
        </Link>
      </div>
    );
  }

  const style = wallGridStyle({ widgets, availableHeight });
  const bands = resolveBands(widgets);

  return (
    <div ref={ref} data-wall-chunk={WALL_CHUNK_MARKER} style={style}>
      {bands.map((band) => (
        <div key={`zone:${band.zone}`} style={bandStyle(band)}>
          <span style={BAND_CAPTION_STYLE}>{band.zone}</span>
        </div>
      ))}
      {widgets.map((widget) => (
        <div
          key={widget.id}
          style={{ ...gridPlacementStyle(widget), zIndex: 1, minWidth: 0, minHeight: 0 }}
        >
          <ErrorBoundary>
            <WidgetFrame widget={widget} rowUnit={rowUnit} />
          </ErrorBoundary>
        </div>
      ))}
    </div>
  );
}
