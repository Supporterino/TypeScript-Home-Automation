/**
 * The wall device-grid widget: renders the explicitly selected devices as a paged
 * uniform grid of the shared wall device card.
 */
import { useDataStore } from "../../lib/data-store.js";
import { WallCardMessage } from "../cards/card-anatomy.js";
import { widgetTitle } from "../frame.js";
import type { WallWidgetProps } from "../registry.js";
import { WallDeviceCard, WallDeviceUnavailable, wallTileCardBox } from "./DeviceWidget.js";
import { deviceGridIds } from "./device-grid-model.js";
import { PagedTileGrid } from "./PagedTileGrid.js";

export function DeviceGridWidget({ widget, contained, rowUnit }: WallWidgetProps) {
  const { devicesByQualifiedId } = useDataStore();
  const ids = deviceGridIds(widget.config);

  if (ids.length === 0) {
    return (
      <div style={{ display: "flex", height: "100%", alignItems: "center" }}>
        <WallCardMessage>
          No devices selected. Choose the devices this grid shows in the wall editor.
        </WallCardMessage>
      </div>
    );
  }

  return (
    <PagedTileGrid
      items={ids}
      keyOf={(qualifiedId) => qualifiedId}
      // Each tile composes for the box the grid drew it in.
      renderTile={(qualifiedId, box) => {
        const device = devicesByQualifiedId.get(qualifiedId);
        return device ? (
          <WallDeviceCard
            device={device}
            contained={contained}
            box={wallTileCardBox(rowUnit, box.heightPx)}
          />
        ) : (
          <WallDeviceUnavailable qualifiedId={qualifiedId} contained={contained} />
        );
      }}
      span={widget}
      rowUnit={rowUnit}
      titled={widgetTitle(widget) !== null}
      label="devices"
    />
  );
}
