/**
 * Rooms index — every room as a navigable entry, alongside the unassigned
 * and all-devices entries (design.md D13, D14; specs/web-ui "Navigation and
 * Information Architecture"; task 10.8).
 */
import { Button, Group, Modal, Paper, Stack, Text, TextInput, Title } from "@mantine/core";
import { IconDeviceUnknown, IconDoorEnter, IconListDetails, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { createRoom } from "../api.js";
import { useDataStore } from "../lib/data-store.js";
import { devicesPath, roomPath, unassignedDevicesPath } from "../lib/router.js";
import { Link, useRouter } from "../lib/router-context.js";

export function RoomsView() {
  const { rooms, refresh } = useDataStore();
  const { basePath } = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate() {
    setSubmitting(true);
    setError(null);
    try {
      await createRoom(name.trim());
      setName("");
      setCreating(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>Rooms</Title>
        <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setCreating(true)}>
          New room
        </Button>
      </Group>

      <Stack gap="xs">
        {rooms.length === 0 && (
          <Text c="dimmed" size="sm">
            No rooms yet — create one to start grouping devices.
          </Text>
        )}
        {rooms.map((room) => {
          const availableCount = room.members.filter((m) => m.available).length;
          const unavailableCount = room.members.length - availableCount;
          return (
            <Paper key={room.id} withBorder p="sm" radius="md">
              <Link
                to={roomPath(basePath, room.id)}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <Group justify="space-between">
                  <Group gap="xs">
                    <IconDoorEnter size={16} />
                    <Text fw={600}>{room.name}</Text>
                  </Group>
                  <Text size="sm" c="dimmed">
                    {availableCount} device{availableCount === 1 ? "" : "s"}
                    {unavailableCount > 0 ? ` · ${unavailableCount} unavailable` : ""}
                  </Text>
                </Group>
              </Link>
            </Paper>
          );
        })}
      </Stack>

      <Group gap="sm">
        <Link to={unassignedDevicesPath(basePath)} style={{ textDecoration: "none" }}>
          <Button variant="light" size="xs" leftSection={<IconDeviceUnknown size={14} />}>
            Unassigned devices
          </Button>
        </Link>
        <Link to={devicesPath(basePath)} style={{ textDecoration: "none" }}>
          <Button variant="light" size="xs" leftSection={<IconListDetails size={14} />}>
            All devices
          </Button>
        </Link>
      </Group>

      <Modal opened={creating} onClose={() => setCreating(false)} title="New room">
        <Stack>
          <TextInput
            label="Room name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            data-autofocus
          />
          {error && (
            <Text c="red" size="sm">
              {error}
            </Text>
          )}
          <Button onClick={handleCreate} loading={submitting} disabled={name.trim().length === 0}>
            Create
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
