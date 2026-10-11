/**
 * The wall clock/date widget (specs/wall-display "Widget Catalog", "Always-On
 * Operation"; design.md D11). Ticks once a second from the client clock and
 * needs no server data, so it renders correctly while the engine is
 * unreachable.
 */
import { Stack, Text } from "@mantine/core";
import { useNow } from "../../lib/use-now.js";
import { formatClock } from "./clock.js";

export function ClockWidget() {
  const now = useNow(1000);
  const { time, date } = formatClock(now);

  return (
    <Stack gap={0} h="100%" justify="center" align="center">
      <Text
        fw={700}
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(2rem, 6vw, 4.5rem)",
          lineHeight: 1.05,
        }}
      >
        {time}
      </Text>
      <Text size="md" c="dimmed" ta="center">
        {date}
      </Text>
    </Stack>
  );
}
