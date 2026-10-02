/**
 * The lazy Energy view (design.md D6, D7, D12; specs/energy-monitoring;
 * specs/web-ui "Energy View"; tasks 11.1–11.2).
 *
 * Reads `GET /api/energy` — the aggregated instantaneous power, cumulative
 * consumption, per-device breakdown, and bounded history. The endpoint is
 * not part of the store's snapshot (it is not needed for first paint), so the
 * view fetches it itself and re-fetches on the relevant device events and on
 * a stream reconnect, debounced. It stays useful with no metering devices and
 * with history disabled: both render explanatory states, never an error.
 *
 * The trend is a hand-rendered inline SVG polyline (design.md D12); no chart
 * library is added to first paint or to this chunk.
 */
import { Alert, Badge, Group, Loader, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import {
  IconAlertTriangle,
  IconBolt,
  IconChartLine,
  IconDatabase,
  IconPlugOff,
  IconPower,
} from "@tabler/icons-react";
import type { EnergyData } from "@ts-ha/shared";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchEnergy } from "../api.js";
import { useDataStore } from "../lib/data-store.js";
import {
  formatKwh,
  formatWatts,
  isEnergyRelevantEvent,
  SPARKLINE_HEIGHT,
  SPARKLINE_WIDTH,
  sparklineLabel,
  sparklinePoints,
} from "../lib/energy.js";

/** Coalesces a burst of device events into one endpoint refetch. */
const REFETCH_DEBOUNCE_MS = 750;

function MetricCard({
  icon,
  label,
  value,
  colorVar,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  colorVar: string;
}) {
  return (
    <Paper withBorder p="sm">
      <Group gap={6} wrap="nowrap">
        <span style={{ color: `var(${colorVar})`, display: "flex" }}>{icon}</span>
        <Text size="xs" fw={600} tt="uppercase" c="dimmed">
          {label}
        </Text>
      </Group>
      <Text size="xl" fw={700} style={{ fontFamily: "var(--font-display)" }}>
        {value}
      </Text>
    </Paper>
  );
}

function Sparkline({ data }: { data: EnergyData }) {
  const points = useMemo(() => sparklinePoints(data.history), [data.history]);
  const label = useMemo(() => sparklineLabel(data.history), [data.history]);
  if (points === "") return null;

  return (
    <Paper withBorder p="sm">
      <Group gap={6} mb={6}>
        <IconChartLine size={14} />
        <Text size="xs" fw={600} tt="uppercase" c="dimmed">
          Recent power trend
        </Text>
      </Group>
      <svg
        viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
        width="100%"
        height={64}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
      >
        <polyline
          points={points}
          fill="none"
          stroke="var(--info)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </Paper>
  );
}

export function EnergyView() {
  const { subscribe, transport } = useDataStore();
  const [data, setData] = useState<EnergyData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await fetchEnergy();
      setData(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load energy data");
    }
  }, []);

  // Mount fetch. The view only mounts when its route matches, and the route
  // is a lazy chunk, so `/api/energy` is never requested for first paint.
  useEffect(() => {
    void load();
  }, [load]);

  // Re-fetch when the stream (re)connects: events may have been missed while
  // disconnected, exactly as the store re-snapshots (design.md "Data Sources").
  const previousTransport = useRef(transport);
  useEffect(() => {
    const previous = previousTransport.current;
    previousTransport.current = transport;
    if (previous !== "live" && transport === "live") void load();
  }, [transport, load]);

  // Device events don't carry the aggregated total, so refetch the endpoint —
  // debounced, because a room command emits one event per member.
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return subscribe((event) => {
      if (!isEnergyRelevantEvent(event)) return;
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(() => {
        refetchTimer.current = null;
        void load();
      }, REFETCH_DEBOUNCE_MS);
    });
  }, [subscribe, load]);

  useEffect(() => {
    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
    };
  }, []);

  const noMetering = data !== null && data.breakdown.length === 0;

  return (
    <Stack gap="lg">
      <Group justify="space-between" wrap="wrap">
        <Title order={2}>Energy</Title>
        {data && !noMetering && (
          <Text size="xs" c="dimmed">
            {data.breakdown.length} metering device{data.breakdown.length === 1 ? "" : "s"}
          </Text>
        )}
      </Group>

      {error && (
        <Alert color="red" icon={<IconAlertTriangle size={16} />} title="Energy data unavailable">
          {error}
        </Alert>
      )}

      {!data && !error ? (
        <Loader size="sm" mt="md" />
      ) : data ? (
        <>
          <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
            <MetricCard
              icon={<IconPower size={16} />}
              label="Current power"
              value={formatWatts(data.powerWatts)}
              colorVar="--info"
            />
            <MetricCard
              icon={<IconDatabase size={16} />}
              label="Cumulative"
              value={formatKwh(data.energyWh)}
              colorVar="--on"
            />
            <MetricCard
              icon={<IconBolt size={16} />}
              label="Metering devices"
              value={String(data.breakdown.length)}
              colorVar="--stale"
            />
          </SimpleGrid>

          <Sparkline data={data} />

          {noMetering ? (
            <Text c="dimmed" size="sm">
              No devices report energy metering yet. Instantaneous power and cumulative consumption
              appear here once a metering device (for example a Shelly switch) is reporting.
            </Text>
          ) : (
            <Stack gap="xs">
              <Text size="xs" fw={600} tt="uppercase" c="dimmed">
                Per-device breakdown
              </Text>
              {data.breakdown.map((device) => (
                <Paper key={device.qualifiedId} withBorder p="sm">
                  <Group justify="space-between" wrap="nowrap" gap="sm">
                    <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                      <Text size="sm" fw={500} truncate>
                        {device.displayName}
                      </Text>
                      {!device.available && (
                        <Badge
                          color="red"
                          variant="light"
                          size="xs"
                          leftSection={<IconPlugOff size={10} />}
                        >
                          unavailable
                        </Badge>
                      )}
                    </Group>
                    <Group gap="lg" wrap="nowrap">
                      <Text size="sm" ff="monospace">
                        {device.powerWatts === undefined ? "—" : formatWatts(device.powerWatts)}
                      </Text>
                      <Text size="sm" ff="monospace">
                        {device.energyWh === undefined ? "—" : formatKwh(device.energyWh)}
                      </Text>
                    </Group>
                  </Group>
                </Paper>
              ))}
              <Text size="xs" c="dimmed">
                A dash means the device reports no such reading — it is not counted as zero.
                Unavailable devices are excluded from the totals above.
              </Text>
            </Stack>
          )}
        </>
      ) : null}
    </Stack>
  );
}
