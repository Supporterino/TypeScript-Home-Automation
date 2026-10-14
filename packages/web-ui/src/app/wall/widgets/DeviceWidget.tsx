/**
 * The wall single-device widget (design.md D13; specs/wall-display "Widget
 * Catalog", "Touch Operation"). Renders one configured device through the
 * same touch-sized tile used everywhere else, so it reconciles and reverts a
 * failed command exactly like the dashboard tile (the tile owns the
 * optimistic/ranking behaviour).
 *
 * A device that is not (or no longer) known renders a contained explanation
 * inside the widget's own area, never a throw that would take down the
 * profile. The frame is chrome-less, so its tile owns the surface, and the
 * contained explanation uses the shared Hearth card vocabulary (design.md D11).
 */
import { useDataStore } from "../../lib/data-store.js";
import type { WallWidgetProps } from "../registry.js";
import { WallCardMessage } from "./card-vocab.js";
import { WallDeviceTile } from "./WallDeviceTile.js";

export function DeviceWidget({ widget, contained, tier, cardForm }: WallWidgetProps) {
  const { devicesByQualifiedId } = useDataStore();
  const qualifiedId =
    typeof widget.config.qualifiedId === "string" ? widget.config.qualifiedId : "";
  const device = devicesByQualifiedId.get(qualifiedId);

  if (!device) {
    return (
      <div
        style={{
          display: "flex",
          height: "100%",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <WallCardMessage>
          {qualifiedId ? `Device "${qualifiedId}" is not available.` : "No device configured."}
        </WallCardMessage>
      </div>
    );
  }

  return <WallDeviceTile device={device} contained={contained} tier={tier} cardForm={cardForm} />;
}
