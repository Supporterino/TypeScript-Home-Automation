/**
 * The full-bleed 12-column wall grid: maps a profile's placements to CSS grid
 * and dispatches each cell to its registry renderer inside a frame.
 */
import type { WallProfileConfig } from "@ts-ha/shared";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { ErrorBoundary } from "../components/ErrorBoundary.js";
import { wallsPath } from "../lib/router.js";
import { useRouter } from "../lib/router-context.js";
import { resolveBands, type WallBand } from "./bands.js";
import { WallCardMessage, WallCardRoute } from "./cards/card-anatomy.js";
import { wallBandChrome, wallChromeTextStyle } from "./frame.js";
import {
  gridPlacementStyle,
  resolveLayout,
  WALL_GUTTER,
  wallGridMetrics,
  wallGridStyle,
} from "./grid.js";
// Hearth's stylesheet loads as its own hashed asset, linked when this chunk is evaluated.
import hearthStylesheetUrl from "./hearth.css";
import { WALL_CHUNK_MARKER } from "./registry.js";
import { WALL_LABEL_FONT_SIZE, WALL_TITLE_FONT_SIZE } from "./type-ramp.js";
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

/**
 * The band layer's per-band style: grid placement plus the band surface, below
 * the widget cells and inert to touch.
 */
function bandStyle(band: WallBand): CSSProperties {
  const chrome = wallBandChrome();
  return {
    ...gridPlacementStyle(band),
    background: chrome.background,
    borderRadius: chrome.radius,
    padding: chrome.padding,
    zIndex: 0,
    pointerEvents: "none",
    display: "flex",
    alignItems: "flex-start",
    overflow: "hidden",
    minWidth: 0,
    minHeight: 0,
  };
}

/** The band's caption style: the wall's label tier with the ported text treatment. */
const BAND_CAPTION_STYLE: CSSProperties = {
  ...wallChromeTextStyle(),
  color: "var(--hearth-text-muted)",
  fontSize: WALL_LABEL_FONT_SIZE,
};

/**
 * The contained explanation a composition that cannot fit the panel renders
 * instead of a clipped or scrolling grid.
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

/** The explanation's heading style: the wall's title tier with the ported treatment. */
const TOO_LARGE_HEADING_STYLE: CSSProperties = {
  ...wallChromeTextStyle(),
  margin: 0,
  color: "var(--hearth-text)",
  fontSize: WALL_TITLE_FONT_SIZE,
};

export function WallGrid({ config }: { config: WallProfileConfig }) {
  const { basePath } = useRouter();
  const orientation = useOrientation();
  const widgets = resolveLayout(config, orientation);
  // Measured live so a viewport change re-resolves the row unit and fit.
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
  // The row unit is handed to each widget so paged layouts resolve against this panel.
  const { outcome, rowUnit } = wallGridMetrics(availableHeight, widgets);

  // The wall never scrolls: an unfittable composition is explained, not clipped.
  if (outcome === "tooLarge") {
    return (
      <div ref={ref} data-wall-chunk={WALL_CHUNK_MARKER} style={TOO_LARGE_STYLE}>
        <h2 style={TOO_LARGE_HEADING_STYLE}>Too large for this panel</h2>
        <WallCardMessage>
          This wall's composition cannot fit the panel at the wall's minimum touch target and body
          size. Remove or resize a widget in the wall editor.
        </WallCardMessage>
        {/* The explanation's route is the wall's own affordance, not a panel link. */}
        <WallCardRoute to={wallsPath(basePath)} label="Open the wall editor" />
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
