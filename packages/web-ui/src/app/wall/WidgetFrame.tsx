/**
 * The framed container each grid widget renders inside (design.md D4, D6). The
 * frame owns the widget's title and the per-widget render boundary is applied
 * by {@link WallGrid}; this file only resolves a title and dispatches to the
 * registry's renderer.
 */
import { Box, Paper, Text } from "@mantine/core";
import type { WallWidget } from "@ts-ha/shared";
import { getWidgetDescriptor } from "./registry.js";

/** The widget's configured title when set, otherwise its type's label. */
function widgetTitle(widget: WallWidget): string {
  const configured = widget.config.title;
  if (typeof configured === "string" && configured.length > 0) return configured;
  return getWidgetDescriptor(widget.type).label;
}

export function WidgetFrame({ widget }: { widget: WallWidget }) {
  const descriptor = getWidgetDescriptor(widget.type);
  const Renderer = descriptor.renderer;

  return (
    <Paper
      withBorder
      radius="lg"
      p="sm"
      h="100%"
      style={{ display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}
    >
      <Text size="xs" fw={600} tt="uppercase" c="dimmed" mb={6} truncate>
        {widgetTitle(widget)}
      </Text>
      <Box style={{ flex: 1, minHeight: 0 }}>
        <Renderer widget={widget} />
      </Box>
    </Paper>
  );
}
