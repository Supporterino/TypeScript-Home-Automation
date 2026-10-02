/**
 * A single room's detail and management view — rename, delete, assign,
 * unassign (design.md D14, D6, D7; specs/web-ui "Room Management
 * Interface"; task 10.8, 10.9).
 *
 * Members are presented in the same grid every other device collection
 * uses, through the same {@link DeviceTile} component — an unavailable
 * member renders through its unavailable variant rather than a parallel
 * layout, and never shows its stale state as current. Removing a member
 * is not always-present chrome: it lives behind a room-level edit mode,
 * reachable by tap so it works on the PWA's primary input.
 */
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconCheck,
  IconListCheck,
  IconPencil,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useState } from "react";
import { assignDeviceRoom, deleteRoom, renameRoom, unassignDeviceRoom } from "../api.js";
import { DeviceTile } from "../components/DeviceTile.js";
import { isOperableDevice } from "../lib/capability-ranking.js";
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
  // Local, discarded on navigation — nothing about edit mode is worth
  // persisting (design.md D7).
  const [editMode, setEditMode] = useState(false);
  // Session-scoped filter (design.md D5), same predicate as every other
  // device collection (design.md D4).
  const [operableOnly, setOperableOnly] = useState(false);
  // Session-scoped reveal (design.md D12): a viewing preference, never a
  // change to any device's hidden flag — resets on reload.
  const [showHidden, setShowHidden] = useState(false);

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

  const allAvailableMembers = room.members.filter((m) => m.available && m.device);
  const unavailableMembers = room.members.filter((m) => !m.available);
  // biome-ignore lint/style/noNonNullAssertion: filtered above
  const shownMembers = showHidden
    ? allAvailableMembers
    : allAvailableMembers.filter((m) => !m.device!.hidden);
  const availableMembers = operableOnly
    ? // biome-ignore lint/style/noNonNullAssertion: filtered above
      shownMembers.filter((m) => isOperableDevice(m.device!.capabilities))
    : shownMembers;

  const genuinelyEmpty = allAvailableMembers.length === 0 && unavailableMembers.length === 0;
  const filteredEmpty =
    !genuinelyEmpty && availableMembers.length === 0 && unavailableMembers.length === 0;
  const allHiddenOnly =
    filteredEmpty && !showHidden && allAvailableMembers.length > 0 && shownMembers.length === 0;

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
          <ActionIcon
            variant={editMode ? "filled" : "light"}
            onClick={() => setEditMode((v) => !v)}
            aria-label={editMode ? "Done managing members" : "Manage members"}
          >
            {editMode ? <IconCheck size={16} /> : <IconListCheck size={16} />}
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

      {genuinelyEmpty && (
        <Text c="dimmed" size="sm">
          No devices in this room yet.
        </Text>
      )}

      {!genuinelyEmpty && (
        <Group justify="flex-end">
          <Switch
            label="Show hidden"
            size="sm"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.currentTarget.checked)}
          />
          <Switch
            label="Operable only"
            size="sm"
            checked={operableOnly}
            onChange={(e) => setOperableOnly(e.currentTarget.checked)}
          />
        </Group>
      )}

      {filteredEmpty &&
        (allHiddenOnly ? (
          <Text c="dimmed" size="sm">
            This room's devices are hidden, not absent — turn on "Show hidden" to see them.
          </Text>
        ) : (
          <Text c="dimmed" size="sm">
            No operable devices. Every device in this room only reports — turn off "Operable only"
            to see them.
          </Text>
        ))}

      {(availableMembers.length > 0 || unavailableMembers.length > 0) && (
        <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing="sm">
          {availableMembers.map((member) => (
            <DeviceTile
              key={member.qualifiedId}
              // biome-ignore lint/style/noNonNullAssertion: filtered above
              device={member.device!}
              action={
                editMode ? (
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    onClick={() => handleUnassign(member.qualifiedId)}
                    aria-label="Remove from room"
                  >
                    <IconX size={16} />
                  </ActionIcon>
                ) : undefined
              }
            />
          ))}

          {unavailableMembers.map((member) => (
            <DeviceTile
              key={member.qualifiedId}
              unavailable
              qualifiedId={member.qualifiedId}
              action={
                editMode ? (
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    onClick={() => handleUnassign(member.qualifiedId)}
                    aria-label="Remove from room"
                  >
                    <IconX size={16} />
                  </ActionIcon>
                ) : undefined
              }
            />
          ))}
        </SimpleGrid>
      )}

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
