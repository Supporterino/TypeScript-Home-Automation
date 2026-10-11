/**
 * The wall energy widget (specs/wall-display "Widget Catalog"; specs/energy-
 * monitoring). Reads `GET /api/energy` and refetches, debounced, on every
 * device event that can change the aggregated totals, so the totals update
 * live without a manual refresh.
 */
import { Group, Loader, Paper, Stack, Text } from "@mantine/core";
import { IconBolt, IconDatabase } from "@tabler/icons-react";
import type { EnergyData } from "@ts-ha/shared";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { fetchEnergy } from "../../api.js";
import { useDataStore } from "../../lib/data-store.js";
import { isEnergyRelevantEvent } from "../../lib/energy.js";
import { energyDisplay } from "./energy-model.js";

/** Coalesces a burst of device events into one endpoint refetch. */
const REFETCH_DEBOUNCE_MS = 750;

function Metric({
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
    <Paper withBorder p="xs">
      <Group gap={6} wrap="nowrap">
        <span style={{ color: `var(${colorVar})`, display: "flex" }}>{icon}</span>
        <Text size="xs" fw={600} tt="uppercase" c="dimmed">
          {label}
        </Text>
      </Group>
      <Text fw={700} style={{ fontFamily: "var(--font-display)", fontSize: 24 }}>
        {value}
      </Text>
    </Paper>
  );
}

export function EnergyWidget() {
  const { subscribe, transport } = useDataStore();
  const [data, setData] = useState<EnergyData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchEnergy());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load energy data");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const previousTransport = useRef(transport);
  useEffect(() => {
    const previous = previousTransport.current;
    previousTransport.current = transport;
    if (previous !== "live" && transport === "live") void load();
  }, [transport, load]);

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

  if (error !== null) {
    return (
      <Text size="sm" c="red">
        Energy data unavailable: {error}
      </Text>
    );
  }

  if (data === null) {
    return (
      <Stack h="100%" justify="center" align="center">
        <Loader size="sm" />
      </Stack>
    );
  }

  const display = energyDisplay(data);

  return (
    <Stack gap="xs" h="100%" justify="center">
      <Metric icon={<IconBolt size={15} />} label="Power" value={display.power} colorVar="--info" />
      <Metric
        icon={<IconDatabase size={15} />}
        label="Total"
        value={display.consumption}
        colorVar="--on"
      />
      {display.meteringCount === 0 && (
        <Text size="xs" c="dimmed">
          No metering devices report yet.
        </Text>
      )}
    </Stack>
  );
}
