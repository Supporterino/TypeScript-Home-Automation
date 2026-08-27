/**
 * Device detail — controls derived generically from the device's declared
 * capabilities, not a fixed per-model list (design.md D12; specs/web-ui
 * "Device Control Interface"; task 10.11).
 */
import { Alert, Badge, Group, Paper, Select, Stack, Text, Title } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { assignDeviceRoom, unassignDeviceRoom } from "../api.js";
import { CapabilityControl } from "../components/CapabilityControl.js";
import { flattenCapabilities } from "../lib/capability-ranking.js";
import { useDataStore } from "../lib/data-store.js";
import { formatAge, isObservationStale } from "../lib/format.js";
import { useNow } from "../lib/use-now.js";

/** "current_heating_setpoint" → "Current heating setpoint". */
function prettifyPropertyName(property: string): string {
  const spaced = property.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function DeviceDetailView({ qualifiedId }: { qualifiedId: string }) {
  const { devicesByQualifiedId, rooms, refresh } = useDataStore();
  const now = useNow();
  const device = devicesByQualifiedId.get(qualifiedId);

  if (!device) {
    return (
      <Alert color="yellow" icon={<IconAlertTriangle size={16} />} title="Device not found">
        This device is not currently known to any source.
      </Alert>
    );
  }

  const currentRoom = rooms.find((r) => r.members.some((m) => m.qualifiedId === qualifiedId));
  const flat = flattenCapabilities(device.capabilities);
  const stale = isObservationStale(
    device.observation.observedAt,
    device.observation.refreshIntervalMs,
    now,
  );

  async function handleRoomChange(roomId: string | null) {
    if (roomId) await assignDeviceRoom(qualifiedId, roomId);
    else await unassignDeviceRoom(qualifiedId);
    await refresh();
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap">
        <Title order={2}>{device.displayName}</Title>
        <Group gap="xs">
          <Badge variant="light">{device.source}</Badge>
          {!device.reachable && (
            <Badge color="red" variant="light">
              Unreachable
            </Badge>
          )}
          {device.observation.mode === "polled" && (
            <Badge color={stale ? "yellow" : "gray"} variant="light">
              polled · {formatAge(now - device.observation.observedAt)} ago
            </Badge>
          )}
          {device.observation.mode === "push" && (
            <Badge color="green" variant="light">
              live
            </Badge>
          )}
        </Group>
      </Group>

      <Select
        label="Room"
        placeholder="Unassigned"
        clearable
        data={rooms.map((r) => ({ value: r.id, label: r.name }))}
        value={currentRoom?.id ?? null}
        onChange={handleRoomChange}
        style={{ maxWidth: 320 }}
      />

      <Stack gap="sm">
        {flat.length === 0 && (
          <Text c="dimmed" size="sm">
            This device declares no capabilities.
          </Text>
        )}
        {flat.map((capability) => (
          <Paper key={capability.property} withBorder p="sm" radius="md">
            <Group justify="space-between" wrap="nowrap" align="center">
              <Text size="sm" fw={500}>
                {prettifyPropertyName(capability.property)}
              </Text>
              <div style={{ minWidth: 160 }}>
                <CapabilityControl device={device} capability={capability} />
              </div>
            </Group>
          </Paper>
        ))}
      </Stack>
    </Stack>
  );
}
