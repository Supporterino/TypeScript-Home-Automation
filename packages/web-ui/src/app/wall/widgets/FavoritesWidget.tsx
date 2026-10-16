/**
 * The wall favorites widget: renders the user's favorited devices as the ported
 * device card, paged through the wall's shared pagination layer.
 */
import { Star } from "lucide-react";
import { useDataStore } from "../../lib/data-store.js";
import {
  WallCardLabel,
  WallCardMessage,
  WallCardReading,
  WallCardStateItem,
} from "../cards/card-anatomy.js";
import { WALL_CARD_GLYPH_SIZE } from "../cards/metrics.js";
import { widgetTitle } from "../frame.js";
import type { WallWidgetProps } from "../registry.js";
import { WallDeviceCard, wallTileCardBox } from "./DeviceWidget.js";
import { favoriteDevices } from "./favorites-model.js";
import { PagedTileGrid } from "./PagedTileGrid.js";

/**
 * The grid rows the card's own chrome consumes above the tiles at the resolved row
 * unit, reserved by the page plan.
 */
const FAVORITES_HEADER_ROWS = 2;

export function FavoritesWidget({ widget, contained, rowUnit }: WallWidgetProps) {
  const { favorites, devicesByQualifiedId } = useDataStore();
  const devices = favoriteDevices(favorites, devicesByQualifiedId);

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        minHeight: 0,
        flexDirection: "column",
        gap: "var(--hearth-space-3)",
      }}
    >
      <WallCardStateItem icon={<Star size={WALL_CARD_GLYPH_SIZE} />} label="Favorites" />

      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--hearth-space-2)" }}>
        <WallCardReading>{devices.length}</WallCardReading>
        <WallCardLabel>{devices.length === 1 ? "favorite" : "favorites"}</WallCardLabel>
      </div>

      {devices.length === 0 ? (
        <WallCardMessage>No favorite devices. Star a device to show it here.</WallCardMessage>
      ) : (
        <PagedTileGrid
          items={devices}
          keyOf={(device) => device.qualifiedId}
          renderTile={(device, box) => (
            <WallDeviceCard
              device={device}
              contained={contained}
              // The tile composes for the box the grid drew it in.
              box={wallTileCardBox(rowUnit, box.heightPx)}
            />
          )}
          span={widget}
          rowUnit={rowUnit}
          reservedRows={FAVORITES_HEADER_ROWS}
          titled={widgetTitle(widget) !== null}
          label="favorites"
        />
      )}
    </div>
  );
}
