/**
 * The wall device-grid widget (wall-zones-and-fit D12; specs/wall-display
 * "Device Grid Widget", "Panel Fit", "Widget Catalog"). Renders the device set
 * the author selected explicitly as a uniform grid of the shared wall device
 * card, one page at a time.
 *
 * The grid's own content can exceed the span it was placed at, and the wall never
 * scrolls (design.md D5): the page math in `wall/pages.ts` decides how many
 * devices a page presents, and the grid draws exactly that page through the
 * shared {@link PagedTileGrid} — touch page controls rather than overflow or
 * scroll. Every tile is the shared {@link WallDeviceCard} for its device's class,
 * so ranking, optimistic override, state encoding, and the touch-target scale stay
 * single-sourced; the frame draws the card's surface, so the contained tiles draw
 * none of their own.
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
      // Each tile composes for the box the grid drew it in — the page plan's row
      // height, the tile's own cell bounded against inflation (design.md D4, D7;
      // specs/wall-display "Paged Tile Sizing"). Its form resolves from that box,
      // so the same device composes a richer form in a taller grid than in a
      // shorter one.
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
