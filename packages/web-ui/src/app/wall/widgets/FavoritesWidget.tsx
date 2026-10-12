/**
 * The wall favorites widget (design.md D7; specs/wall-display "Widget
 * Catalog"). Renders the user's favorited devices as the same touch-sized
 * device tiles used everywhere else — favorites logic and the tile
 * presentation are reused, never reimplemented.
 *
 * The displayed set is derived from the store's `favorites` list and live
 * device map on every render, so a favorite change streamed from another
 * client reconciles through the existing `state` handling with no local
 * action; the tile's own favorite toggle writes through the store too.
 */
import { ScrollArea, SimpleGrid, Stack, Text } from "@mantine/core";
import { useDataStore } from "../../lib/data-store.js";
import type { WallWidgetProps } from "../registry.js";
import { WALL_BODY_FONT_SIZE } from "../type-ramp.js";
import { favoriteDevices } from "./favorites-model.js";
import { WallDeviceTile } from "./WallDeviceTile.js";

export function FavoritesWidget({ contained }: WallWidgetProps) {
  const { favorites, devicesByQualifiedId } = useDataStore();
  const devices = favoriteDevices(favorites, devicesByQualifiedId);

  if (devices.length === 0) {
    return (
      <Text fz={WALL_BODY_FONT_SIZE} c="dimmed">
        No favorite devices. Star a device to show it here.
      </Text>
    );
  }

  return (
    <Stack h="100%" gap="xs" style={{ minHeight: 0 }}>
      <ScrollArea style={{ flex: 1, minHeight: 0 }}>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs" pr="xs">
          {devices.map((device) => (
            <WallDeviceTile key={device.qualifiedId} device={device} contained={contained} />
          ))}
        </SimpleGrid>
      </ScrollArea>
    </Stack>
  );
}
