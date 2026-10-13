/**
 * The wall single-device widget (design.md D13; specs/wall-display "Widget
 * Catalog", "Touch Operation"). Renders one configured device through the
 * same touch-sized tile used everywhere else, so it reconciles and reverts a
 * failed command exactly like the dashboard tile (the tile owns the
 * optimistic/ranking behaviour).
 *
 * A device that is not (or no longer) known renders a contained explanation
 * inside the widget's own area, never a throw that would take down the
 * profile. The frame is chrome-less, so its tile owns the surface.
 */
import { useDataStore } from "../../lib/data-store.js";
import type { WallWidgetProps } from "../registry.js";
import { WALL_BODY_FONT_SIZE } from "../type-ramp.js";
import { WallDeviceTile } from "./WallDeviceTile.js";

export function DeviceWidget({ widget, contained }: WallWidgetProps) {
  const { devicesByQualifiedId } = useDataStore();
  const qualifiedId =
    typeof widget.config.qualifiedId === "string" ? widget.config.qualifiedId : "";
  const device = devicesByQualifiedId.get(qualifiedId);

  if (!device) {
    return (
      <div className="flex h-full flex-col justify-center">
        <p className="text-muted" style={{ fontSize: WALL_BODY_FONT_SIZE }}>
          {qualifiedId ? `Device "${qualifiedId}" is not available.` : "No device configured."}
        </p>
      </div>
    );
  }

  return <WallDeviceTile device={device} contained={contained} />;
}
