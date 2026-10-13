/**
 * Wall-profile editor entry point (design.md D12; specs/web-ui "Wall Editor
 * Admission In Admin Navigation"; specs/wall-display "Wall Configuration
 * Editor"; task 6.4). Rendered inside the shell via `RouteOutlet`, so it is
 * reachable through admin navigation at its own reloadable URL. It lists
 * profiles and admits creating, renaming, deleting, and configuring them; the
 * profile editor itself opens as a full-screen overlay ({@link WallEditor}) —
 * the wall is not a route the editor lives under.
 *
 * Mutations surface the server's inline error (a 409 conflict or 400 invalid)
 * and reload the list on success, mirroring `RoomsView`'s pattern.
 *
 * Rebuilt on the Lumen primitive layer (`ui/*`) and `lucide-react`.
 */
import { Monitor, Pencil, Plus, Settings, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createWall, deleteWall, fetchWalls, updateWall } from "../api.js";
import { wallPath } from "../lib/router.js";
import { useRouter } from "../lib/router-context.js";
import type { WallProfile } from "../types.js";
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
  Row,
  Spinner,
  Stack,
} from "../ui/index.js";
import { emptyWallConfig } from "../wall/editor/model.js";
import { WallEditor } from "../wall/editor/WallEditor.js";

/** The shared text-input treatment (the `ui/` layer carries no input primitive). */
const INPUT_CLASSES =
  "touch-target h-10 w-full rounded-input border border-hairline bg-surface px-3 text-sm text-ink motion-toggle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

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
    <Stack gap={4}>
      <Row justify="between" align="center" gap={3} wrap>
        <h2 className="font-display text-2xl font-bold text-ink">Walls</h2>
        <Button
          size="sm"
          onClick={() => {
            setCreateError(null);
            setCreating(true);
          }}
        >
          <Plus size={14} aria-hidden />
          New wall
        </Button>
      </Row>

      <p className="text-sm text-muted">
        Wall profiles are consumed read-only at their own address; the panel itself has no editing
        controls.
      </p>

      {loadError && (
        <Stack gap={1} className="rounded-tile border border-danger/40 bg-danger/10 p-3">
          <span className="font-semibold text-ink">Could not load wall profiles</span>
          <p role="alert" className="text-sm text-muted">
            {loadError}
          </p>
        </Stack>
      )}

      {walls === null && !loadError && <Spinner className="mt-2" />}

      {walls?.length === 0 && (
        <EmptyState
          icon={<Monitor size={28} />}
          title="No wall profiles yet"
          description="Create one to start composing a panel for a wall-mounted display."
        />
      )}

      <Stack gap={2}>
        {walls?.map((profile) => (
          <Card key={profile.name} padding={false}>
            <Row justify="between" align="center" gap={2} wrap>
              <Row gap={2} align="center" className="min-w-0 flex-1 px-4 py-3" wrap={false}>
                <Monitor size={16} aria-hidden className="shrink-0 text-muted" />
                <Stack gap={0} className="min-w-0">
                  <span className="truncate font-semibold text-ink">{profile.name}</span>
                  <span className="truncate font-mono text-xs text-muted">
                    {wallPath(basePath, profile.name)} · {profile.config.widgets.length} widget
                    {profile.config.widgets.length === 1 ? "" : "s"}
                  </span>
                </Stack>
              </Row>
              <Row gap={1} align="center" className="shrink-0 py-2 pr-3">
                <Button size="sm" variant="soft" onClick={() => setEditing(profile)}>
                  <Settings size={14} aria-hidden />
                  Configure
                </Button>
                <IconButton
                  label={`Rename ${profile.name}`}
                  size="sm"
                  onClick={() => {
                    setRenameName(profile.name);
                    setRenameError(null);
                    setRenaming(profile);
                  }}
                >
                  <Pencil size={16} />
                </IconButton>
                <IconButton
                  label={`Delete ${profile.name}`}
                  size="sm"
                  className="text-danger"
                  onClick={() => {
                    setDeleteError(null);
                    setDeleting(profile);
                  }}
                >
                  <Trash2 size={16} />
                </IconButton>
              </Row>
            </Row>
          </Card>
        ))}
      </Stack>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-ink">New wall profile</DialogTitle>
            <DialogDescription className="text-sm text-muted">
              The profile name is used as the wall's address; it must be unique.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreate();
            }}
          >
            <label htmlFor="new-wall-name" className="text-sm font-medium text-ink">
              Profile name
            </label>
            <input
              id="new-wall-name"
              className={INPUT_CLASSES}
              value={newName}
              autoFocus
              onChange={(event) => setNewName(event.currentTarget.value)}
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
              <Button type="submit" disabled={submitting || newName.trim().length === 0}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={renaming !== null} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-ink">
              Rename wall profile
            </DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void handleRename();
            }}
          >
            <label htmlFor="rename-wall-name" className="text-sm font-medium text-ink">
              Profile name
            </label>
            <input
              id="rename-wall-name"
              className={INPUT_CLASSES}
              value={renameName}
              autoFocus
              onChange={(event) => setRenameName(event.currentTarget.value)}
            />
            {renameError && (
              <p role="alert" className="text-sm text-danger">
                {renameError}
              </p>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || renameName.trim().length === 0}>
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-ink">
              Delete wall profile
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted">
            Delete <strong className="text-ink">{deleting?.name}</strong>? Any panel displaying it
            will explain that it no longer exists.
          </p>
          {deleteError && (
            <p role="alert" className="text-sm text-danger">
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void handleDelete()} disabled={submitting}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
