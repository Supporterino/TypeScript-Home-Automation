/**
 * The operator state view — ordinary keys with their values, editable from the
 * stream. Reserved internal keys come from `filterReservedKeys` and never show.
 */
import { Database, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { deleteStateKey, setStateKey } from "../api.js";
import { useDataStore } from "../lib/data-store.js";
import { filterReservedKeys } from "../lib/reserved-keys.js";
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

/** The shared textarea treatment. */
const TEXTAREA_CLASSES =
  "min-h-32 w-full resize-y rounded-input border border-hairline bg-surface px-3 py-2 font-mono text-xs text-ink motion-toggle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export function StateView() {
  const { state } = useDataStore();
  const visible = filterReservedKeys(state);
  const keys = Object.keys(visible).sort();

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function openEdit(key: string) {
    setEditingKey(key);
    setEditingValue(JSON.stringify(visible[key], null, 2));
    setError(null);
  }

  function openCreate() {
    setNewKey("");
    setNewValue("");
    setError(null);
    setCreating(true);
  }

  async function handleSave() {
    if (editingKey === null) return;
    try {
      const parsed = JSON.parse(editingValue);
      await setStateKey(editingKey, parsed);
      setEditingKey(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON");
    }
  }

  async function handleCreate() {
    try {
      const parsed = newValue.trim().length > 0 ? JSON.parse(newValue) : null;
      await setStateKey(newKey.trim(), parsed);
      setCreating(false);
      setNewKey("");
      setNewValue("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON");
    }
  }

  async function handleDelete(key: string) {
    setError(null);
    try {
      await deleteStateKey(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete the state key");
    }
  }

  return (
    <Stack gap={4}>
      <Row justify="between" align="center" gap={3} wrap>
        <h2 className="font-display text-2xl font-bold text-ink">State</h2>
        <Row gap={2} align="center">
          <span className="text-xs text-muted">
            {keys.length} key{keys.length === 1 ? "" : "s"}
          </span>
          <Button size="sm" onClick={openCreate}>
            <Plus size={14} aria-hidden />
            New key
          </Button>
        </Row>
      </Row>

      {error && editingKey === null && !creating && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {keys.length === 0 ? (
        <EmptyState
          icon={<Database size={28} />}
          title="No state keys stored"
          description="Ordinary state written by automations and services appears here, live."
        />
      ) : (
        <Stack gap={2}>
          {keys.map((key) => (
            <Card key={key} padding={false}>
              <Row justify="between" align="start" gap={2} wrap={false}>
                <Stack gap={1} className="min-w-0 flex-1 px-4 py-3">
                  <span className="truncate font-mono text-sm font-semibold text-ink">{key}</span>
                  <code className="block overflow-auto rounded-input border border-hairline bg-surface-2 p-2 font-mono text-xs text-ink">
                    {JSON.stringify(visible[key])}
                  </code>
                </Stack>
                <Row gap={1} className="shrink-0 p-2">
                  <IconButton label={`Edit ${key}`} size="sm" onClick={() => openEdit(key)}>
                    <Pencil size={14} />
                  </IconButton>
                  <IconButton
                    label={`Delete ${key}`}
                    size="sm"
                    className="text-danger"
                    onClick={() => void handleDelete(key)}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </Row>
              </Row>
            </Card>
          ))}
        </Stack>
      )}

      <Dialog
        open={editingKey !== null}
        onOpenChange={(open) => {
          if (!open) setEditingKey(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-ink">Edit state key</DialogTitle>
            <DialogDescription className="break-all font-mono text-xs text-muted">
              {editingKey}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSave();
            }}
          >
            <label htmlFor="state-value" className="text-sm font-medium text-ink">
              Value (JSON)
            </label>
            <textarea
              id="state-value"
              className={TEXTAREA_CLASSES}
              value={editingValue}
              autoFocus
              onChange={(event) => setEditingValue(event.currentTarget.value)}
            />
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditingKey(null)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-ink">New state key</DialogTitle>
            <DialogDescription className="text-sm text-muted">
              The value is parsed as JSON; leave it empty to store null.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreate();
            }}
          >
            <label htmlFor="new-state-key" className="text-sm font-medium text-ink">
              Key
            </label>
            <input
              id="new-state-key"
              className={INPUT_CLASSES}
              value={newKey}
              autoFocus
              onChange={(event) => setNewKey(event.currentTarget.value)}
            />
            <label htmlFor="new-state-value" className="text-sm font-medium text-ink">
              Value (JSON)
            </label>
            <textarea
              id="new-state-value"
              className={TEXTAREA_CLASSES}
              value={newValue}
              placeholder="null"
              onChange={(event) => setNewValue(event.currentTarget.value)}
            />
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={newKey.trim().length === 0}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
