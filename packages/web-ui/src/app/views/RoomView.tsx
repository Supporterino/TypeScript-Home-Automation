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
  Badge,
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
  IconInfoCircle,
  IconListCheck,
  IconPencil,
  IconPlus,
  IconPower,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useState } from "react";
import {
  assignDeviceRoom,
  deleteRoom,
  renameRoom,
  sendRoomCommand,
  unassignDeviceRoom,
} from "../api.js";
import { DeviceTile } from "../components/DeviceTile.js";
import { isOperableDevice } from "../lib/capability-ranking.js";
import { useDataStore } from "../lib/data-store.js";
import {
  classifyRoomCommandResults,
  groupOnOffCommand,
  mergeRoomCommandResults,
  supportsOnOffCommand,
} from "../lib/room-command.js";
import { roomsPath } from "../lib/router.js";
import { useRouter } from "../lib/router-context.js";

export function RoomView({ roomId }: { roomId: string }) {
  const { rooms, unassignedDevices, refresh, applyOptimisticOverride, revertOptimisticOverride } =
    useDataStore();
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
  // Room-command outcome, surfaced per task 10.2/10.3.
  const [commandBusy, setCommandBusy] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [skippedCount, setSkippedCount] = useState(0);

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

  /**
   * Issues the room batch command (design.md D5; specs/web-ui "Room-Level
   * Command"; task 10.1). Members are grouped by the on/off property they
   * declare — one request per distinct family, since the endpoint rejects a
   * property a member does not declare, so a single `{ on }` body could never
   * address a Zigbee `state` light. A homogeneous room still issues exactly
   * one request. Every actuatable member is reflected optimistically through
   * the store-level override layer — so every mounted tile updates, not just
   * this view — using the value actually sent for its family, then the
   * per-member responses are merged: `applied` is left to the stream or the
   * override deadline, `failed` reverts and is surfaced as an error, and
   * `skipped` is reported separately as an informational count (tasks 10.2,
   * 10.3).
   */
  async function handleRoomCommand(on: boolean) {
    const capableMembers = room!.members
      .filter((m) => m.available && m.device)
      // biome-ignore lint/style/noNonNullAssertion: filtered above
      .map((m) => ({ qualifiedId: m.qualifiedId, capabilities: m.device!.capabilities }))
      .filter((m) => supportsOnOffCommand(m.capabilities));

    // Nothing to command: do not issue a pointless request.
    if (capableMembers.length === 0) return;

    setCommandBusy(true);
    setCommandError(null);
    setSkippedCount(0);

    const groups = groupOnOffCommand(capableMembers, on);
    // biome-ignore lint/style/noNonNullAssertion: members are filtered available above
    const deviceByMember = new Map(
      room!.members.filter((m) => m.available && m.device).map((m) => [m.qualifiedId, m.device!]),
    );

    const overrides: { qualifiedId: string; property: string; token: symbol }[] = [];
    for (const group of groups) {
      for (const member of group.members) {
        const token = applyOptimisticOverride(
          member.qualifiedId,
          group.property,
          group.value,
          deviceByMember.get(member.qualifiedId)?.observation,
        );
        overrides.push({ qualifiedId: member.qualifiedId, property: group.property, token });
      }
    }
    const overrideByMember = new Map(overrides.map((o) => [o.qualifiedId, o]));

    try {
      const responses = await Promise.all(
        groups.map((group) => sendRoomCommand(room!.id, { [group.property]: group.value })),
      );
      const { skipped, failed } = classifyRoomCommandResults(mergeRoomCommandResults(responses));

      for (const qualifiedId of failed) {
        const override = overrideByMember.get(qualifiedId);
        if (override) {
          revertOptimisticOverride(qualifiedId, override.property, override.token);
        }
      }

      if (skipped.length > 0) setSkippedCount(skipped.length);
      if (failed.length > 0) {
        setCommandError(
          `${failed.length} member${failed.length === 1 ? "" : "s"} could not be commanded and reverted.`,
        );
      }
    } catch (err) {
      // The request itself failed: no member's outcome is known, so revert
      // every optimistic override and surface the failure.
      for (const { qualifiedId, property, token } of overrides) {
        revertOptimisticOverride(qualifiedId, property, token);
      }
      setCommandError(err instanceof Error ? err.message : "Room command failed");
    } finally {
      setCommandBusy(false);
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
  const actuatableMembers = allAvailableMembers.filter((m) =>
    // biome-ignore lint/style/noNonNullAssertion: filtered above
    supportsOnOffCommand(m.device!.capabilities),
  );
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

      {actuatableMembers.length > 0 && (
        <Group gap="xs" align="center">
          <Text size="sm" c="dimmed">
            Room control
          </Text>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconPower size={14} />}
            loading={commandBusy}
            onClick={() => void handleRoomCommand(true)}
          >
            All on
          </Button>
          <Button
            size="xs"
            variant="light"
            color="gray"
            leftSection={<IconPower size={14} />}
            loading={commandBusy}
            onClick={() => void handleRoomCommand(false)}
          >
            All off
          </Button>
        </Group>
      )}

      {commandError && (
        <Alert color="red" icon={<IconAlertTriangle size={16} />} title="Room command failed">
          {commandError}
        </Alert>
      )}

      {skippedCount > 0 && (
        <Badge
          color="gray"
          variant="light"
          leftSection={<IconInfoCircle size={12} />}
          style={{ alignSelf: "flex-start" }}
        >
          {skippedCount} skipped (no control)
        </Badge>
      )}

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
