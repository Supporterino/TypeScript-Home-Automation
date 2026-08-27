/**
 * The device list view over the unified endpoint — shows source,
 * reachability, and observation freshness (design.md D2; specs/web-ui
 * "Device Tiles"; task 10.10). Reused for both "all devices" and the
 * "unassigned" entry via the `filter` prop.
 */
import { SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { DeviceTile } from "../components/DeviceTile.js";
import { useDataStore } from "../lib/data-store.js";

export function DevicesView({ onlyUnassigned = false }: { onlyUnassigned?: boolean }) {
  const { devices, unassignedDevices } = useDataStore();
  const list = onlyUnassigned ? unassignedDevices : devices;

  return (
    <Stack gap="md">
      <Title order={2}>{onlyUnassigned ? "Unassigned devices" : "All devices"}</Title>

      {list.length === 0 ? (
        <Text c="dimmed" size="sm">
          {onlyUnassigned ? "Every known device belongs to a room." : "No devices known yet."}
        </Text>
      ) : (
        <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing="sm">
          {list.map((device) => (
            <DeviceTile key={device.qualifiedId} device={device} />
          ))}
        </SimpleGrid>
      )}
    </Stack>
  );
}
