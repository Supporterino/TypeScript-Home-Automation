/**
 * A single room's detail and management view — rename, delete, assign,
 * unassign (design.md D14; specs/web-ui "Room Management Interface"; task
 * 10.8, 10.9).
 *
 * An unavailable member is rendered distinctly and never shown with its
 * stale state presented as current (task 10.9) — {@link DeviceTile} already
 * marks unreachable devices, but an *unavailable* room member (its source
 * dropped it entirely) has no live descriptor at all, so it is rendered
 * here directly rather than through the tile.
 */
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconAlertTriangle, IconPencil, IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { assignDeviceRoom, deleteRoom, renameRoom, unassignDeviceRoom } from "../api.js";
import { DeviceTile } from "../components/DeviceTile.js";
import { useDataStore } from "../lib/data-store.js";
import { roomsPath } from "../lib/router.js";
import { useRouter } from "../lib/router-context.js";

export function RoomView({ roomId }: { roomId: string }) {
  const { rooms, unassignedDevices, refresh } = useDataStore();
  const { navigate, basePath } = useRouter();
  const room = rooms.find((r) => r.id === roomId);

  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(room?.name ?? "");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!room) {
    return (
      <Alert color="yellow" icon={<IconAlertTriangle size={16} />} title="Room not found">
        This room no longer exists. It may have just been deleted.
      </Alert>
    );
  }

  async function handleRename() {
    setBusy(true);
    setError(null);
    try {
      await renameRoom(room!.id, name.trim());
      setRenaming(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename room");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await deleteRoom(room!.id);
      setDeleteConfirmOpen(false);
      navigate(roomsPath(basePath));
    } finally {
      setBusy(false);
    }
  }

  async function handleAssign() {
    if (!assignTarget) return;
    setBusy(true);
    try {
      await assignDeviceRoom(assignTarget, room!.id);
      setAssignTarget(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleUnassign(qualifiedId: string) {
    setBusy(true);
    try {
      await unassignDeviceRoom(qualifiedId);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const availableMembers = room.members.filter((m) => m.available && m.device);
  const unavailableMembers = room.members.filter((m) => !m.available);

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>{room.name}</Title>
        <Group gap="xs">
          <ActionIcon variant="light" onClick={() => setRenaming(true)} aria-label="Rename room">
            <IconPencil size={16} />
          </ActionIcon>
          <ActionIcon
            variant="light"
            color="red"
            onClick={() => setDeleteConfirmOpen(true)}
            aria-label="Delete room"
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      </Group>

      <Group gap="xs" align="flex-end">
        <Select
          label="Assign a device to this room"
          placeholder="Choose a device"
          data={unassignedDevices.map((d) => ({ value: d.qualifiedId, label: d.displayName }))}
          value={assignTarget}
          onChange={setAssignTarget}
          searchable
          style={{ minWidth: 240 }}
        />
        <Button
          leftSection={<IconPlus size={14} />}
          onClick={handleAssign}
          disabled={!assignTarget}
          loading={busy}
        >
          Add
        </Button>
      </Group>

      {availableMembers.length === 0 && unavailableMembers.length === 0 && (
        <Text c="dimmed" size="sm">
          No devices in this room yet.
        </Text>
      )}

      <Stack gap="xs">
        {availableMembers.map((member) => (
          <Group key={member.qualifiedId} justify="space-between" wrap="nowrap">
            <div style={{ flex: 1, maxWidth: 260 }}>
              {/* biome-ignore lint/style/noNonNullAssertion: filtered above */}
              <DeviceTile device={member.device!} />
            </div>
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={() => handleUnassign(member.qualifiedId)}
              aria-label="Remove from room"
            >
              <IconX size={16} />
            </ActionIcon>
          </Group>
        ))}

        {unavailableMembers.map((member) => (
          <Paper key={member.qualifiedId} withBorder p="sm" radius="md" opacity={0.6}>
            <Group justify="space-between">
              <Group gap="xs">
                <Badge color="gray" variant="light" size="sm">
                  Unavailable
                </Badge>
                <Text size="sm" c="dimmed" ff="monospace">
                  {member.qualifiedId}
                </Text>
              </Group>
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={() => handleUnassign(member.qualifiedId)}
                aria-label="Remove from room"
              >
                <IconX size={16} />
              </ActionIcon>
            </Group>
          </Paper>
        ))}
      </Stack>

      <Modal opened={renaming} onClose={() => setRenaming(false)} title="Rename room">
        <Stack>
          <TextInput value={name} onChange={(e) => setName(e.currentTarget.value)} data-autofocus />
          {error && (
            <Text c="red" size="sm">
              {error}
            </Text>
          )}
          <Button onClick={handleRename} loading={busy} disabled={name.trim().length === 0}>
            Save
          </Button>
        </Stack>
      </Modal>

      <Modal
        opened={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Delete room"
      >
        <Stack>
          <Text size="sm">
            Delete <strong>{room.name}</strong>? Its devices are not deleted — they become
            unassigned.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button color="red" onClick={handleDelete} loading={busy}>
              Delete room
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
