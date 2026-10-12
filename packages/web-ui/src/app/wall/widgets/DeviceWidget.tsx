/**
 * The wall single-device widget (design.md D7; specs/wall-display "Widget
 * Catalog", "Touch Operation"). Renders one configured device through the
 * same touch-sized tile used everywhere else, so it reconciles and reverts a
 * failed command exactly like the dashboard tile (the tile owns the
 * optimistic/ranking behaviour).
 *
 * A device that is not (or no longer) known renders a contained explanation
 * inside the widget's own area, never a throw that would take down the
 * profile.
 */
import { Stack, Text } from "@mantine/core";
import { useDataStore } from "../../lib/data-store.js";
import type { WallWidgetProps } from "../registry.js";
import { WALL_BODY_FONT_SIZE } from "../type-ramp.js";
import { WallDeviceTile } from "./WallDeviceTile.js";

export function DeviceWidget({ widget }: WallWidgetProps) {
  const { devicesByQualifiedId } = useDataStore();
  const qualifiedId =
    typeof widget.config.qualifiedId === "string" ? widget.config.qualifiedId : "";
  const device = devicesByQualifiedId.get(qualifiedId);

  if (!device) {
    return (
      <Stack h="100%" justify="center">
        <Text fz={WALL_BODY_FONT_SIZE} c="dimmed">
          {qualifiedId ? `Device "${qualifiedId}" is not available.` : "No device configured."}
        </Text>
      </Stack>
    );
  }

  return <WallDeviceTile device={device} />;
}
