/**
 * The wall favorites widget (design.md D13; specs/wall-display "Widget
 * Catalog"). Renders the user's favorited devices as the same touch-sized
 * device tiles used everywhere else — favorites logic and the tile
 * presentation are reused, never reimplemented.
 *
 * The displayed set is derived from the store's `favorites` list and live
 * device map on every render, so a favorite change streamed from another
 * client reconciles through the existing `state` handling with no local
 * action; the tile's own favorite toggle writes through the store too.
 *
 * A control widget: the frame draws the surface, so each contained tile draws
 * none of its own (specs/wall-display "A card is a single surface").
 */
import { useDataStore } from "../../lib/data-store.js";
import { Grid, ScrollArea, Stack } from "../../ui/index.js";
import type { WallWidgetProps } from "../registry.js";
import { WALL_BODY_FONT_SIZE } from "../type-ramp.js";
import { favoriteDevices } from "./favorites-model.js";
import { WallDeviceTile } from "./WallDeviceTile.js";

export function FavoritesWidget({ contained }: WallWidgetProps) {
  const { favorites, devicesByQualifiedId } = useDataStore();
  const devices = favoriteDevices(favorites, devicesByQualifiedId);

  if (devices.length === 0) {
    return (
      <p className="text-muted" style={{ fontSize: WALL_BODY_FONT_SIZE }}>
        No favorite devices. Star a device to show it here.
      </p>
    );
  }

  return (
    <Stack gap={2} className="h-full min-h-0">
      <ScrollArea className="min-h-0 flex-1">
        <Grid columns={1} md={2} gap={2} className="pr-2">
          {devices.map((device) => (
            <WallDeviceTile key={device.qualifiedId} device={device} contained={contained} />
          ))}
        </Grid>
      </ScrollArea>
    </Stack>
  );
}
