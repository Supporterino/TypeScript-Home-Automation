/**
 * The full-bleed 12-column wall grid (design.md D4, D6; specs/wall-display
 * "Widget Grid Layout", "Widget Catalog"). Maps a profile's placements to CSS
 * grid and dispatches each cell to its registry renderer inside a frame. A
 * widget whose renderer throws is contained by a per-widget
 * {@link ErrorBoundary}, so one broken widget never takes down the profile.
 */
import { Box } from "@mantine/core";
import { WALL_GRID_COLUMNS, type WallProfileConfig } from "@ts-ha/shared";
import { ErrorBoundary } from "../components/ErrorBoundary.js";
import { gridPlacementStyle, resolveLayout } from "./grid.js";
import { WALL_CHUNK_MARKER } from "./registry.js";
import { useOrientation } from "./use-orientation.js";
import { WidgetFrame } from "./WidgetFrame.js";

const GRID_GAP_PX = 12;

export function WallGrid({ config }: { config: WallProfileConfig }) {
  const orientation = useOrientation();
  const widgets = resolveLayout(config, orientation);

  return (
    <Box
      data-wall-chunk={WALL_CHUNK_MARKER}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${WALL_GRID_COLUMNS}, minmax(0, 1fr))`,
        gridAutoRows: "minmax(0, 1fr)",
        gap: GRID_GAP_PX,
        width: "100vw",
        height: "100dvh",
        padding: GRID_GAP_PX,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {widgets.map((widget) => (
        <div key={widget.id} style={{ ...gridPlacementStyle(widget), minWidth: 0, minHeight: 0 }}>
          <ErrorBoundary>
            <WidgetFrame widget={widget} />
          </ErrorBoundary>
        </div>
      ))}
    </Box>
  );
}
