/**
 * The operator state view — list, inspect, write, and delete ordinary keys,
 * updating from the stream without a manual refresh (design.md D20, D25;
 * specs/web-ui "Operator Views", "Internal State Keys Are Not Presented";
 * task 10.20).
 *
 * Rows are derived from `filterReservedKeys` and there is no free-text key
 * field anywhere in this view — rooms cannot be destroyed and enabled flags
 * cannot be edited from here because there is nothing here that addresses
 * them (design.md D20; task 10.16b).
 */
import {
  ActionIcon,
  Button,
  Code,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { deleteStateKey, setStateKey } from "../api.js";
import { useDataStore } from "../lib/data-store.js";
import { filterReservedKeys } from "../lib/reserved-keys.js";

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

  async function handleSaveEdit() {
    if (editingKey === null) return;
    try {
      const parsed = JSON.parse(editingValue);
      await setStateKey(editingKey, parsed);
      setEditingKey(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON");
    }
  }

  async function handleDelete(key: string) {
    await deleteStateKey(key);
  }

  async function handleCreate() {
    try {
      const parsed = newValue.trim().length > 0 ? JSON.parse(newValue) : null;
      await setStateKey(newKey.trim(), parsed);
      setCreating(false);
      setNewKey("");
      setNewValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON");
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>State</Title>
        <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setCreating(true)}>
          New key
        </Button>
      </Group>

      {keys.length === 0 ? (
        <Text c="dimmed" size="sm">
          No state keys stored.
        </Text>
      ) : (
        <Stack gap={4}>
          {keys.map((key) => (
            <Paper key={key} withBorder p="sm" radius="md">
              <Group justify="space-between" wrap="nowrap">
                <Stack gap={2} style={{ flex: 1, overflow: "hidden" }}>
                  <Text size="sm" fw={600}>
                    {key}
                  </Text>
                  <Code block fz="xs">
                    {JSON.stringify(visible[key])}
                  </Code>
                </Stack>
                <Group gap="xs" wrap="nowrap">
                  <ActionIcon
                    variant="light"
                    onClick={() => openEdit(key)}
                    aria-label={`Edit ${key}`}
                  >
                    <IconPencil size={14} />
                  </ActionIcon>
                  <ActionIcon
                    variant="light"
                    color="red"
                    onClick={() => handleDelete(key)}
                    aria-label={`Delete ${key}`}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Group>
              </Group>
            </Paper>
          ))}
        </Stack>
      )}

      <Modal
        opened={editingKey !== null}
        onClose={() => setEditingKey(null)}
        title={`Edit ${editingKey}`}
      >
        <Stack>
          <Textarea
            value={editingValue}
            onChange={(e) => setEditingValue(e.currentTarget.value)}
            autosize
            minRows={4}
            ff="monospace"
          />
          {error && (
            <Text c="red" size="sm">
              {error}
            </Text>
          )}
          <Button onClick={handleSaveEdit}>Save</Button>
        </Stack>
      </Modal>

      <Modal opened={creating} onClose={() => setCreating(false)} title="New state key">
        <Stack>
          <TextInput
            label="Key"
            value={newKey}
            onChange={(e) => setNewKey(e.currentTarget.value)}
          />
          <Textarea
            label="Value (JSON)"
            value={newValue}
            onChange={(e) => setNewValue(e.currentTarget.value)}
            placeholder="null"
            autosize
            minRows={3}
            ff="monospace"
          />
          {error && (
            <Text c="red" size="sm">
              {error}
            </Text>
          )}
          <Button onClick={handleCreate} disabled={newKey.trim().length === 0}>
            Create
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
