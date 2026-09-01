/**
 * The device list view over the unified endpoint — shows source,
 * reachability, and observation freshness (design.md D2; specs/web-ui
 * "Device Tiles"; task 10.10). Reused for both "all devices" and the
 * "unassigned" entry via the `filter` prop.
 */
import { Group, SimpleGrid, Stack, Switch, Text, Title } from "@mantine/core";
import { useState } from "react";
import { DeviceTile } from "../components/DeviceTile.js";
import { isOperableDevice } from "../lib/capability-ranking.js";
import { useDataStore } from "../lib/data-store.js";

export function DevicesView({ onlyUnassigned = false }: { onlyUnassigned?: boolean }) {
  const { devices, unassignedDevices } = useDataStore();
  const [operableOnly, setOperableOnly] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const list = onlyUnassigned ? unassignedDevices : devices;
  const shown = showHidden ? list : list.filter((d) => !d.hidden);
  const visible = operableOnly ? shown.filter((d) => isOperableDevice(d.capabilities)) : shown;

  const genuinelyEmpty = list.length === 0;
  const filteredEmpty = !genuinelyEmpty && visible.length === 0;
  const allHiddenOnly = filteredEmpty && !showHidden && shown.length === 0;

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>{onlyUnassigned ? "Unassigned devices" : "All devices"}</Title>
        <Group gap="md">
          <Switch
            label="Show hidden"
            size="sm"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.currentTarget.checked)}
            disabled={genuinelyEmpty}
          />
          <Switch
            label="Operable only"
            size="sm"
            checked={operableOnly}
            onChange={(e) => setOperableOnly(e.currentTarget.checked)}
            disabled={genuinelyEmpty}
          />
        </Group>
      </Group>

      {genuinelyEmpty && (
        <Text c="dimmed" size="sm">
          {onlyUnassigned ? "Every known device belongs to a room." : "No devices known yet."}
        </Text>
      )}

      {filteredEmpty &&
        (allHiddenOnly ? (
          <Text c="dimmed" size="sm">
            Every device is hidden — turn on "Show hidden" to see them.
          </Text>
        ) : (
          <Text c="dimmed" size="sm">
            No operable devices. Every known device only reports — turn off "Operable only" to see
            them.
          </Text>
        ))}

      {visible.length > 0 && (
        <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing="sm">
          {visible.map((device) => (
            <DeviceTile key={device.qualifiedId} device={device} />
          ))}
        </SimpleGrid>
      )}
    </Stack>
  );
}
