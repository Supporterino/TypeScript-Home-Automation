/**
 * Rooms index — the room management surface: every room as a navigable entry
 * alongside its rename and delete actions, plus the unassigned and all-devices
 * entries (design.md D13, D14; specs/web-ui "Room Management Interface"; task
 * 5.2).
 *
 * Creating, renaming, and deleting live here, next to the list they act on; the
 * room's own view owns membership and the room-level command. Deleting a room
 * is non-destructive and the confirmation says so — its devices become
 * unassigned rather than being deleted.
 *
 * Rebuilt on the Lumen primitive layer (`ui/*`) and `lucide-react` (task 5.2).
 */
import { CircleHelp, DoorOpen, LayoutList, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { createRoom, deleteRoom, renameRoom } from "../api.js";
import { useDataStore } from "../lib/data-store.js";
import { devicesPath, roomPath, unassignedDevicesPath } from "../lib/router.js";
import { Link, useRouter } from "../lib/router-context.js";
import type { RoomWithMembers } from "../types.js";
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  IconButton,
  INPUT_CLASSES,
  Row,
  Stack,
} from "../ui/index.js";

/** The member summary a room row shows, counting what the room's default listing shows. */
function memberSummary(room: RoomWithMembers): string {
  const available = room.members.filter(
    (m) => m.available && m.device !== null && !m.device.hidden,
  ).length;
  const hidden = room.members.filter(
    (m) => m.available && m.device !== null && m.device.hidden,
  ).length;
  const unavailable = room.members.filter((m) => !m.available).length;

  const parts = [`${available} device${available === 1 ? "" : "s"}`];
  if (unavailable > 0) parts.push(`${unavailable} unavailable`);
  if (hidden > 0) parts.push(`${hidden} hidden`);
  return parts.join(" · ");
}

export function RoomsView() {
  const { rooms, refresh } = useDataStore();
  const { basePath } = useRouter();
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<RoomWithMembers | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RoomWithMembers | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function openCreate() {
    setCreateName("");
    setCreateError(null);
    setCreating(true);
  }

  function openRename(room: RoomWithMembers) {
    setRenameName(room.name);
    setRenameError(null);
    setRenameTarget(room);
  }

  function openDelete(room: RoomWithMembers) {
    setDeleteError(null);
    setDeleteTarget(room);
  }

  async function handleCreate() {
    setBusy(true);
    setCreateError(null);
    try {
      await createRoom(createName.trim());
      setCreating(false);
      await refresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create room");
    } finally {
      setBusy(false);
    }
  }

  async function handleRename() {
    if (!renameTarget) return;
    setBusy(true);
    setRenameError(null);
    try {
      await renameRoom(renameTarget.id, renameName.trim());
      setRenameTarget(null);
      await refresh();
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "Failed to rename room");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    setDeleteError(null);
    try {
      await deleteRoom(deleteTarget.id);
      setDeleteTarget(null);
      await refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete room");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack gap={4}>
      <Row justify="between" align="center" gap={3} wrap>
        <h2 className="font-display text-2xl font-bold text-ink">Rooms</h2>
        <Button size="sm" onClick={openCreate}>
          <Plus size={14} aria-hidden />
          New room
        </Button>
      </Row>

      {rooms.length === 0 ? (
        <EmptyState
          icon={<DoorOpen size={28} />}
          title="No rooms yet"
          description="Create one to start grouping devices."
        />
      ) : (
        <Stack gap={2}>
          {rooms.map((room) => (
            <Card key={room.id} padding={false}>
              <Row justify="between" align="center" gap={2} wrap>
                <Link
                  to={roomPath(basePath, room.id)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 rounded-tile px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  <DoorOpen size={16} aria-hidden className="shrink-0 text-muted" />
                  <Stack gap={0} className="min-w-0">
                    <span className="truncate font-semibold text-ink">{room.name}</span>
                    <span className="text-xs text-muted">{memberSummary(room)}</span>
                  </Stack>
                </Link>
                <Row gap={1} className="pr-2">
                  <IconButton
                    label={`Rename ${room.name}`}
                    size="sm"
                    onClick={() => openRename(room)}
                  >
                    <Pencil size={14} />
                  </IconButton>
                  <IconButton
                    label={`Delete ${room.name}`}
                    size="sm"
                    className="text-danger"
                    onClick={() => openDelete(room)}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </Row>
              </Row>
            </Card>
          ))}
        </Stack>
      )}

      <Row gap={2} wrap>
        <Button variant="soft" size="sm" asChild>
          <Link to={unassignedDevicesPath(basePath)}>
            <CircleHelp size={14} aria-hidden />
            Unassigned devices
          </Link>
        </Button>
        <Button variant="soft" size="sm" asChild>
          <Link to={devicesPath(basePath)}>
            <LayoutList size={14} aria-hidden />
            All devices
          </Link>
        </Button>
      </Row>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-ink">New room</DialogTitle>
            <DialogDescription className="text-sm text-muted">
              Give the room a name. You can add devices afterwards.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreate();
            }}
          >
            <label htmlFor="new-room-name" className="text-sm font-medium text-ink">
              Room name
            </label>
            <input
              id="new-room-name"
              className={INPUT_CLASSES}
              value={createName}
              autoFocus
              onChange={(event) => setCreateName(event.currentTarget.value)}
            />
            {createError && (
              <p role="alert" className="text-sm text-danger">
                {createError}
              </p>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || createName.trim().length === 0}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={renameTarget !== null} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-ink">Rename room</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void handleRename();
            }}
          >
            <label htmlFor="rename-room-name" className="text-sm font-medium text-ink">
              Room name
            </label>
            <input
              id="rename-room-name"
              className={INPUT_CLASSES}
              value={renameName}
              onChange={(event) => setRenameName(event.currentTarget.value)}
            />
            {renameError && (
              <p role="alert" className="text-sm text-danger">
                {renameError}
              </p>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setRenameTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || renameName.trim().length === 0}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-ink">Delete room</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted">
            Delete <strong className="text-ink">{deleteTarget?.name}</strong>? Its devices are not
            deleted — they become unassigned.
          </p>
          {deleteError && (
            <p role="alert" className="text-sm text-danger">
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void handleDelete()} disabled={busy}>
              Delete room
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
