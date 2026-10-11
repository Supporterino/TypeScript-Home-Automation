/**
 * Wall-profile editor entry point (task 6.1; specs/web-ui "Wall Editor
 * Admission In Admin Navigation"; specs/wall-display "Wall Configuration
 * Editor"). Rendered inside `AppShell` via `RouteOutlet`, so it is reachable
 * through admin navigation at its own reloadable URL. It lists profiles and
 * admits creating, renaming, deleting, and configuring them; the profile
 * editor itself opens as a full-screen modal ({@link WallEditor}) — the wall is
 * not a route the editor lives under.
 *
 * Mutations surface the server's inline error (a 409 conflict or 400 invalid)
 * and reload the list on success, mirroring `RoomsView`'s pattern.
 */
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconDeviceScreen,
  IconPencil,
  IconPlus,
  IconSettings,
  IconTrash,
} from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { createWall, deleteWall, fetchWalls, updateWall } from "../api.js";
import { wallPath } from "../lib/router.js";
import { useRouter } from "../lib/router-context.js";
import type { WallProfile } from "../types.js";
import { emptyWallConfig } from "../wall/editor/model.js";
import { WallEditor } from "../wall/editor/WallEditor.js";

export function WallsView() {
  const { basePath } = useRouter();
  const [walls, setWalls] = useState<WallProfile[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [renaming, setRenaming] = useState<WallProfile | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<WallProfile | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [editing, setEditing] = useState<WallProfile | null>(null);

  const load = useCallback(async () => {
    try {
      setWalls(await fetchWalls());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load wall profiles");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    setSubmitting(true);
    setCreateError(null);
    try {
      const created = await createWall(newName.trim(), emptyWallConfig());
      setNewName("");
      setCreating(false);
      await load();
      setEditing(created);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create wall profile");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRename() {
    if (!renaming) return;
    setSubmitting(true);
    setRenameError(null);
    try {
      await updateWall(renaming.name, { name: renameName.trim() });
      setRenaming(null);
      await load();
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "Failed to rename wall profile");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setSubmitting(true);
    setDeleteError(null);
    try {
      await deleteWall(deleting.name);
      setDeleting(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete wall profile");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>Walls</Title>
        <Button
          size="xs"
          leftSection={<IconPlus size={14} />}
          onClick={() => {
            setCreateError(null);
            setCreating(true);
          }}
        >
          New wall
        </Button>
      </Group>

      <Text size="sm" c="dimmed">
        Wall profiles are consumed read-only at their own address; the panel itself has no editing
        controls.
      </Text>

      {loadError && (
        <Alert color="red" title="Could not load wall profiles">
          {loadError}
        </Alert>
      )}

      {walls === null && !loadError && <Loader size="sm" />}

      <Stack gap="xs">
        {walls?.length === 0 && (
          <Text c="dimmed" size="sm">
            No wall profiles yet — create one to start composing a panel.
          </Text>
        )}
        {walls?.map((profile) => (
          <Paper key={profile.name} withBorder p="sm" radius="md">
            <Group justify="space-between">
              <Group gap="xs">
                <IconDeviceScreen size={16} />
                <Stack gap={0}>
                  <Text fw={600}>{profile.name}</Text>
                  <Text size="xs" c="dimmed" ff="monospace">
                    {wallPath(basePath, profile.name)} · {profile.config.widgets.length} widget
                    {profile.config.widgets.length === 1 ? "" : "s"}
                  </Text>
                </Stack>
              </Group>
              <Group gap={4}>
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconSettings size={14} />}
                  onClick={() => setEditing(profile)}
                >
                  Configure
                </Button>
                <ActionIcon
                  variant="subtle"
                  aria-label={`Rename ${profile.name}`}
                  onClick={() => {
                    setRenameName(profile.name);
                    setRenameError(null);
                    setRenaming(profile);
                  }}
                >
                  <IconPencil size={16} />
                </ActionIcon>
                <ActionIcon
                  color="red"
                  variant="subtle"
                  aria-label={`Delete ${profile.name}`}
                  onClick={() => {
                    setDeleteError(null);
                    setDeleting(profile);
                  }}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            </Group>
          </Paper>
        ))}
      </Stack>

      <Modal opened={creating} onClose={() => setCreating(false)} title="New wall profile">
        <Stack>
          <TextInput
            label="Profile name"
            description="Used as the wall's address; must be unique."
            value={newName}
            onChange={(e) => setNewName(e.currentTarget.value)}
            data-autofocus
          />
          {createError && (
            <Text c="red" size="sm">
              {createError}
            </Text>
          )}
          <Button
            onClick={handleCreate}
            loading={submitting}
            disabled={newName.trim().length === 0}
          >
            Create
          </Button>
        </Stack>
      </Modal>

      <Modal
        opened={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename wall profile"
      >
        <Stack>
          <TextInput
            label="Profile name"
            value={renameName}
            onChange={(e) => setRenameName(e.currentTarget.value)}
            data-autofocus
          />
          {renameError && (
            <Text c="red" size="sm">
              {renameError}
            </Text>
          )}
          <Button
            onClick={handleRename}
            loading={submitting}
            disabled={renameName.trim().length === 0}
          >
            Rename
          </Button>
        </Stack>
      </Modal>

      <Modal
        opened={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete wall profile"
      >
        <Stack>
          <Text size="sm">
            Delete <strong>{deleting?.name}</strong>? Any panel displaying it will explain that it
            no longer exists.
          </Text>
          {deleteError && (
            <Text c="red" size="sm">
              {deleteError}
            </Text>
          )}
          <Button color="red" onClick={handleDelete} loading={submitting}>
            Delete
          </Button>
        </Stack>
      </Modal>

      {editing && (
        <WallEditor
          profile={editing}
          onClose={() => setEditing(null)}
          onSaved={() => void load()}
        />
      )}
    </Stack>
  );
}
