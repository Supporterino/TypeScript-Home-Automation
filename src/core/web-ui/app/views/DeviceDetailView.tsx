/**
 * Device detail — controls derived generically from the device's declared
 * capabilities, not a fixed per-model list (design.md D12; specs/web-ui
 * "Device Control Interface"; task 10.11).
 */
import { Alert, Badge, Button, Group, Paper, Select, Stack, Text, Title } from "@mantine/core";
import { IconAlertTriangle, IconEye, IconEyeOff, IconUsersGroup } from "@tabler/icons-react";
import { assignDeviceRoom, unassignDeviceRoom } from "../api.js";
import { CapabilityControl } from "../components/CapabilityControl.js";
import { flattenCapabilities } from "../lib/capability-ranking.js";
import { useDataStore } from "../lib/data-store.js";
import { formatAge, isObservationStale } from "../lib/format.js";
import { deviceDetailPath } from "../lib/router.js";
import { useRouter } from "../lib/router-context.js";
import { useNow } from "../lib/use-now.js";

/** "current_heating_setpoint" → "Current heating setpoint". */
function prettifyPropertyName(property: string): string {
  const spaced = property.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function DeviceDetailView({ qualifiedId }: { qualifiedId: string }) {
  const { devicesByQualifiedId, rooms, refresh, hideDevice, unhideDevice } = useDataStore();
  const { navigate, basePath } = useRouter();
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
  const isGroup = device.source === "zigbee-group";

  async function handleRoomChange(roomId: string | null) {
    if (roomId) await assignDeviceRoom(qualifiedId, roomId);
    else await unassignDeviceRoom(qualifiedId);
    await refresh();
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap">
        <Group gap="xs" wrap="nowrap">
          {isGroup && <IconUsersGroup size={20} color="var(--mantine-color-dimmed)" />}
          <Title order={2}>{device.displayName}</Title>
        </Group>
        <Group gap="xs">
          <Badge variant="light">{isGroup ? "group" : device.source}</Badge>
          {device.hidden && (
            <Badge color="gray" variant="outline">
              Hidden
            </Badge>
          )}
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
          <Button
            size="xs"
            variant="default"
            leftSection={device.hidden ? <IconEye size={14} /> : <IconEyeOff size={14} />}
            onClick={() =>
              void (device.hidden ? unhideDevice(qualifiedId) : hideDevice(qualifiedId))
            }
          >
            {device.hidden ? "Unhide" : "Hide"}
          </Button>
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

      {isGroup && device.memberQualifiedIds && device.memberQualifiedIds.length > 0 && (
        <Stack gap="xs">
          <Text fw={600} size="sm" c="dimmed" tt="uppercase">
            Members
          </Text>
          <Text c="dimmed" size="xs">
            Membership is managed in Zigbee2MQTT and read-only here.
          </Text>
          <Group gap="xs">
            {device.memberQualifiedIds.map((memberId) => {
              const member = devicesByQualifiedId.get(memberId);
              return (
                <Button
                  key={memberId}
                  size="xs"
                  variant="light"
                  color={member?.hidden ? "gray" : "blue"}
                  onClick={() => navigate(deviceDetailPath(basePath, memberId))}
                >
                  {member?.displayName ?? memberId}
                  {member?.hidden ? " (hidden)" : ""}
                </Button>
              );
            })}
          </Group>
        </Stack>
      )}

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
