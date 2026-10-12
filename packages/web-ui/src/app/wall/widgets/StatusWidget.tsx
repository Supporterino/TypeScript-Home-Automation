/**
 * The wall status/presence summary widget (specs/wall-display "Widget
 * Catalog"). Reuses the overview's pure {@link summarizeDevices} over the live
 * device map, so counts update as `device_state`/`device_reachability` events
 * stream in — no manual refresh.
 */
import { Group, SimpleGrid, Text } from "@mantine/core";
import { IconActivity, IconClock, IconPlugOff, IconPower } from "@tabler/icons-react";
import { type ReactNode, useMemo } from "react";
import { useDataStore } from "../../lib/data-store.js";
import { summarizeDevices } from "../../lib/overview.js";
import { useNow } from "../../lib/use-now.js";
import { WALL_LABEL_FONT_SIZE, WALL_METRIC_FONT_SIZE } from "../type-ramp.js";

function Metric({
  icon,
  label,
  value,
  colorVar,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  colorVar: string;
}) {
  return (
    <div>
      <Group gap={6} wrap="nowrap">
        <span style={{ color: `var(${colorVar})`, display: "flex" }}>{icon}</span>
        <Text fz={WALL_LABEL_FONT_SIZE} fw={600} tt="uppercase" c="dimmed">
          {label}
        </Text>
      </Group>
      <Text fw={700} style={{ fontFamily: "var(--font-display)", fontSize: WALL_METRIC_FONT_SIZE }}>
        {value}
      </Text>
    </div>
  );
}

export function StatusWidget() {
  const { devices } = useDataStore();
  const now = useNow();
  const summary = useMemo(() => summarizeDevices(devices, now), [devices, now]);

  return (
    <SimpleGrid cols={2} spacing="xs" h="100%">
      <Metric icon={<IconPower size={15} />} label="On" value={summary.on} colorVar="--on" />
      <Metric
        icon={<IconPlugOff size={15} />}
        label="Unreachable"
        value={summary.unreachable}
        colorVar="--danger"
      />
      <Metric
        icon={<IconClock size={15} />}
        label="Stale"
        value={summary.stale}
        colorVar="--stale"
      />
      <Metric
        icon={<IconActivity size={15} />}
        label="Motion"
        value={summary.motion}
        colorVar="--info"
      />
    </SimpleGrid>
  );
}
