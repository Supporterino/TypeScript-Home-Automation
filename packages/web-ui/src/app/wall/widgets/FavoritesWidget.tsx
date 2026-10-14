/**
 * The wall favorites widget (design.md D11, D13; specs/wall-display "Widget
 * Catalog"). Renders the user's favorited devices as the same touch-sized
 * device tiles used everywhere else — favorites logic and the tile
 * presentation are reused, never reimplemented.
 *
 * The displayed set is derived from the store's `favorites` list and live
 * device map on every render, so a favorite change streamed from another
 * client reconciles through the existing `state` handling with no local
 * action; the tile's own favorite toggle writes through the store too.
 *
 * Composed on the shared Hearth card vocabulary (design.md D11): a leading star
 * glyph and the title, with the favorite count as the metric; the tiles are the
 * card's affordances. A control widget: the frame draws the surface, so each
 * contained tile draws none of its own (specs/wall-display "A card is a single
 * surface").
 */
import { Star } from "lucide-react";
import { useDataStore } from "../../lib/data-store.js";
import type { WallWidgetProps } from "../registry.js";
import {
  WALL_CARD_GLYPH_SIZE,
  WallCardHead,
  WallCardLabel,
  WallCardMessage,
  WallCardMetric,
  wallControlGapPx,
} from "./card-vocab.js";
import { favoriteDevices } from "./favorites-model.js";
import { WallDeviceTile } from "./WallDeviceTile.js";

export function FavoritesWidget({ contained }: WallWidgetProps) {
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
      <WallCardHead icon={<Star size={WALL_CARD_GLYPH_SIZE} />} title="Favorites" />

      <span style={{ display: "flex", alignItems: "baseline", gap: "var(--hearth-space-2)" }}>
        <WallCardMetric>{devices.length}</WallCardMetric>
        <WallCardLabel>{devices.length === 1 ? "favorite" : "favorites"}</WallCardLabel>
      </span>

      {devices.length === 0 ? (
        <WallCardMessage>No favorite devices. Star a device to show it here.</WallCardMessage>
      ) : (
        <div style={{ minHeight: 0, flex: 1, overflowY: "auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
              alignContent: "start",
              gap: `${wallControlGapPx()}px`,
            }}
          >
            {devices.map((device) => (
              <WallDeviceTile key={device.qualifiedId} device={device} contained={contained} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
