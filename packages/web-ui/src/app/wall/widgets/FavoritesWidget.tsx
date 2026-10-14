/**
 * The wall favorites widget (design.md D11, D13; wall-zones-and-fit D5;
 * specs/wall-display "Widget Catalog", "Panel Fit"). Renders the user's
 * favorited devices as the same touch-sized device tiles used everywhere else —
 * favorites logic and the tile presentation are reused, never reimplemented.
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
 *
 * A set larger than the card can show pages through the wall's shared pagination
 * layer — one page at a time with touch page controls — rather than scrolling its
 * tile area, so the wall never scrolls (wall-zones-and-fit D5).
 */
import { Star } from "lucide-react";
import { useDataStore } from "../../lib/data-store.js";
import { widgetTitle } from "../frame.js";
import type { WallWidgetProps } from "../registry.js";
import {
  WALL_CARD_GLYPH_SIZE,
  WallCardHead,
  WallCardLabel,
  WallCardMessage,
  WallCardMetric,
} from "./card-vocab.js";
import { favoriteDevices } from "./favorites-model.js";
import { PagedTileGrid } from "./PagedTileGrid.js";
import { WallDeviceTile } from "./WallDeviceTile.js";

/**
 * The grid rows the card's own chrome — the star glyph with the title, then the
 * count with its label — consumes above the tiles at the resolved row unit. The
 * page plan reserves it, so a page never promises a tile row the card cannot show.
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
      <WallCardHead icon={<Star size={WALL_CARD_GLYPH_SIZE} />} title="Favorites" />

      <span style={{ display: "flex", alignItems: "baseline", gap: "var(--hearth-space-2)" }}>
        <WallCardMetric>{devices.length}</WallCardMetric>
        <WallCardLabel>{devices.length === 1 ? "favorite" : "favorites"}</WallCardLabel>
      </span>

      {devices.length === 0 ? (
        <WallCardMessage>No favorite devices. Star a device to show it here.</WallCardMessage>
      ) : (
        <PagedTileGrid
          items={devices}
          keyOf={(device) => device.qualifiedId}
          renderTile={(device) => (
            <WallDeviceTile
              device={device}
              contained={contained}
              // A paged tile is the device card at the wall's minimum-span tile
              // cell, so it composes the tier and form that cell resolves — the
              // same ones the device grid gives its tiles (wall-zones-and-fit D4).
              tier="compact"
              cardForm="compact"
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
