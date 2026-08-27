/**
 * The landing view: a device control surface, not engine status (design.md
 * D13; specs/web-ui "Navigation and Information Architecture"; task 10.7).
 * Engine readiness is demoted to a small status badge here.
 */
import { Badge, Group, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { DeviceTile } from "../components/DeviceTile.js";
import { useDataStore } from "../lib/data-store.js";

export function DashboardView() {
  const { status, rooms, unassignedDevices } = useDataStore();

  const ready = status?.status === "ready";

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2}>Dashboard</Title>
        <Badge color={ready ? "green" : "red"} variant="light" size="sm">
          {ready ? "Engine ready" : "Engine not ready"}
        </Badge>
      </Group>

      {rooms.length === 0 && unassignedDevices.length === 0 && (
        <Text c="dimmed" size="sm">
          No devices yet. Devices appear here once a source (Zigbee, Shelly, Nanoleaf, or a state
          toggle) reports them.
        </Text>
      )}

      {rooms.map((room) => {
        const availableMembers = room.members.filter((m) => m.available && m.device);
        if (availableMembers.length === 0) return null;
        return (
          <Stack key={room.id} gap="xs">
            <Text fw={600} size="sm" c="dimmed" tt="uppercase">
              {room.name}
            </Text>
            <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing="sm">
              {availableMembers.map((member) => (
                // biome-ignore lint/style/noNonNullAssertion: filtered above
                <DeviceTile key={member.qualifiedId} device={member.device!} />
              ))}
            </SimpleGrid>
          </Stack>
        );
      })}

      {unassignedDevices.length > 0 && (
        <Stack gap="xs">
          <Text fw={600} size="sm" c="dimmed" tt="uppercase">
            Unassigned
          </Text>
          <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing="sm">
            {unassignedDevices.map((device) => (
              <DeviceTile key={device.qualifiedId} device={device} />
            ))}
          </SimpleGrid>
        </Stack>
      )}
    </Stack>
  );
}
