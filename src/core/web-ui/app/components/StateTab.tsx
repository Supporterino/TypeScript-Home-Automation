import {
  ActionIcon,
  Button,
  Code,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { deleteStateKey, setStateKey } from "../api";
import type { DashboardData } from "../types";

interface NewKeyModalProps {
  opened: boolean;
  onClose: () => void;
  onCreated: (key: string, value: unknown) => void;
}

function NewKeyModal({ opened, onClose, onCreated }: NewKeyModalProps) {
  const [key, setKey] = useState("");
  const [rawValue, setRawValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!key.trim()) {
      setError("Key is required");
      return;
    }
    let value: unknown;
    try {
      value = rawValue.trim() ? JSON.parse(rawValue) : "";
    } catch {
      value = rawValue;
    }
    setLoading(true);
    setError(null);
    try {
      await setStateKey(key.trim(), value);
      onCreated(key.trim(), value);
      setKey("");
      setRawValue("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="New State Key">
      <Stack>
        <TextInput
          label="Key"
          placeholder="my-automation:key_name"
          value={key}
          onChange={(e) => setKey(e.currentTarget.value)}
          required
          ff="monospace"
        />
        <TextInput
          label="Value (JSON or plain string)"
          placeholder='true, 42, "hello", {"key":"value"}'
          value={rawValue}
          onChange={(e) => setRawValue(e.currentTarget.value)}
        />
        {error && (
          <Text c="red" size="sm">
            {error}
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate} loading={loading}>
            Create
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

interface StateRowProps {
  stateKey: string;
  value: unknown;
  onMutate: (key: string, newValue?: unknown) => void;
}

function StateRow({ stateKey, value, onMutate }: StateRowProps) {
  const display = typeof value === "object" ? JSON.stringify(value) : String(value);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(display);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, { open: openDelete, close: closeDelete }] = useDisclosure(false);

  function handleEditStart() {
    setEditValue(display);
    setEditing(true);
    setError(null);
  }

  async function handleSave() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(editValue);
    } catch {
      parsed = editValue;
    }
    setLoading(true);
    try {
      await setStateKey(stateKey, parsed);
      onMutate(stateKey, parsed);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    setLoading(true);
    try {
      await deleteStateKey(stateKey);
      onMutate(stateKey);
      closeDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Table.Tr>
        <Table.Td>
          <Code fz="xs">{stateKey}</Code>
        </Table.Td>
        <Table.Td>
          {editing ? (
            <TextInput
              value={editValue}
              onChange={(e) => setEditValue(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") setEditing(false);
              }}
              size="xs"
              ff="monospace"
              autoFocus
              error={error}
            />
          ) : (
            <Text
              size="sm"
              ff="monospace"
              style={{ cursor: "text" }}
              onClick={handleEditStart}
              title="Click to edit"
            >
              {display}
            </Text>
          )}
        </Table.Td>
        <Table.Td>
          <Group gap={4} wrap="nowrap">
            {editing ? (
              <>
                <Button
                  size="xs"
                  variant="light"
                  color="green"
                  onClick={handleSave}
                  loading={loading}
                >
                  Save
                </Button>
                <Button size="xs" variant="subtle" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </>
            ) : null}
            <Tooltip label="Delete">
              <ActionIcon variant="subtle" color="red" size="sm" onClick={openDelete}>
                ✕
              </ActionIcon>
            </Tooltip>
          </Group>
        </Table.Td>
      </Table.Tr>

      <Modal opened={deleteOpen} onClose={closeDelete} title="Delete state key" size="sm">
        <Stack>
          <Text size="sm">
            Delete <Code>{stateKey}</Code>? This cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={closeDelete}>
              Cancel
            </Button>
            <Button color="red" onClick={handleDelete} loading={loading}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

interface Props {
  data: DashboardData | null;
  onMutate: () => void;
}

export function StateTab({ data, onMutate }: Props) {
  const state = data?.state ?? {};
  const [newKeyOpen, { open: openNewKey, close: closeNewKey }] = useDisclosure(false);

  function handleMutate() {
    // Trigger a data refresh from the parent
    onMutate();
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>State</Title>
        <Button size="sm" onClick={openNewKey}>
          + New Key
        </Button>
      </Group>

      <Table.ScrollContainer minWidth={400}>
        <Table striped highlightOnHover withTableBorder withColumnBorders={false}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w="40%">Key</Table.Th>
              <Table.Th>Value</Table.Th>
              <Table.Th w={160}>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {Object.keys(state).length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={3}>
                  <Text c="dimmed" ta="center" py="xl">
                    No state keys
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              Object.entries(state).map(([key, value]) => (
                <StateRow key={key} stateKey={key} value={value} onMutate={handleMutate} />
              ))
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <NewKeyModal opened={newKeyOpen} onClose={closeNewKey} onCreated={handleMutate} />
    </Stack>
  );
}
