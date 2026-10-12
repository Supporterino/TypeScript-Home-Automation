/**
 * The framed container each grid widget renders inside (design.md D2, D3, D4,
 * D6). The frame owns the widget's grammar-driven surface and its opt-in title,
 * while the per-widget render boundary is applied by {@link WallGrid}. The
 * ambient-vs-control decision and the title rule are the pure
 * {@link wallFrameChrome}/{@link widgetTitle} helpers, so this component stays
 * a thin wrapper that dispatches to the registry's renderer.
 */
import { Box, Paper, Text } from "@mantine/core";
import type { WallWidget } from "@ts-ha/shared";
import { wallFrameChrome, widgetTitle } from "./frame.js";
import { getWidgetDescriptor } from "./registry.js";
import { WALL_LABEL_FONT_SIZE } from "./type-ramp.js";

export function WidgetFrame({ widget }: { widget: WallWidget }) {
  const descriptor = getWidgetDescriptor(widget.type);
  const Renderer = descriptor.renderer;
  const title = widgetTitle(widget);
  const chrome = wallFrameChrome(descriptor.grammar);

  const content = (
    <>
      {title !== null && (
        <Text fz={WALL_LABEL_FONT_SIZE} fw={600} tt="uppercase" c="dimmed" mb={6} truncate>
          {title}
        </Text>
      )}
      <Box style={{ flex: 1, minHeight: 0 }}>
        <Renderer widget={widget} />
      </Box>
    </>
  );

  if (!chrome.surface) {
    return (
      <Box
        h="100%"
        style={{ display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}
      >
        {content}
      </Box>
    );
  }

  return (
    <Paper
      withBorder
      radius="lg"
      h="100%"
      style={{
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minHeight: 0,
        padding: chrome.padding ?? undefined,
        background: chrome.background ?? undefined,
        borderColor: chrome.borderColor ?? undefined,
        borderRadius: chrome.radius ?? undefined,
      }}
    >
      {content}
    </Paper>
  );
}
