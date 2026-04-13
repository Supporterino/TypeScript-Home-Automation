import {
  Badge,
  Button,
  Code,
  Collapse,
  Group,
  JsonInput,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { triggerAutomation } from "../api";
import type { Automation, DashboardData, TriggerDef } from "../types";

const TRIGGER_TYPE_COLORS: Record<string, string> = {
  mqtt: "violet",
  cron: "cyan",
  state: "green",
  webhook: "orange",
};

const TRIGGER_TEMPLATES: Record<string, (name: string) => string> = {
  mqtt: (name) => JSON.stringify({ type: "mqtt", topic: `manual/${name}`, payload: {} }, null, 2),
  cron: () => JSON.stringify({ type: "cron", expression: "manual", firedAt: new Date() }, null, 2),
  state: () =>
    JSON.stringify({ type: "state", key: "manual", newValue: null, oldValue: null }, null, 2),
  webhook: () =>
    JSON.stringify(
      { type: "webhook", path: "manual", method: "POST", headers: {}, query: {}, body: null },
      null,
      2,
    ),
};

interface TriggerModalProps {
  automation: Automation | null;
  opened: boolean;
  onClose: () => void;
}

function TriggerModal({ automation, opened, onClose }: TriggerModalProps) {
  const [triggerType, setTriggerType] = useState<string>("mqtt");
  const [payload, setPayload] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleTypeChange(type: string | null) {
    if (!type || !automation) return;
    setTriggerType(type);
    setPayload(TRIGGER_TEMPLATES[type]?.(automation.name) ?? "{}");
  }

  // Reset form state whenever the modal opens or the target automation changes
  useEffect(() => {
    if (opened && automation) {
      setTriggerType("mqtt");
      setPayload(TRIGGER_TEMPLATES.mqtt(automation.name));
      setError(null);
    }
  }, [opened, automation]);

  async function handleFire() {
    if (!automation) return;
    let context: Record<string, unknown>;
    try {
      context = JSON.parse(payload);
    } catch {
      setError("Invalid JSON payload");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await triggerAutomation(automation.name, context);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={`Trigger: ${automation?.name ?? ""}`}>
      <Stack>
        <Select
          label="Trigger type"
          data={["mqtt", "cron", "state", "webhook"]}
          value={triggerType}
          onChange={handleTypeChange}
        />
        <JsonInput
          label="Context payload (JSON)"
          value={payload}
          onChange={setPayload}
          autosize
          minRows={6}
          formatOnBlur
          ff="monospace"
          fz="xs"
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
          <Button onClick={handleFire} loading={loading}>
            Fire Trigger
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

interface AutomationRowProps {
  automation: Automation;
  onTrigger: (automation: Automation) => void;
}

function AutomationRow({ automation, onTrigger }: AutomationRowProps) {
  const [expanded, { toggle }] = useDisclosure(false);

  const triggerChips = automation.triggers.map((t, i) => (
    <Badge key={i} color={TRIGGER_TYPE_COLORS[t.type] ?? "gray"} variant="light" size="sm">
      {t.type}
    </Badge>
  ));

  return (
    <>
      <Table.Tr
        style={{ cursor: "pointer" }}
        onClick={toggle}
        bg={expanded ? "var(--mantine-color-default-hover)" : undefined}
      >
        <Table.Td>
          <Text fw={600} ff="monospace" size="sm">
            {automation.name}
          </Text>
        </Table.Td>
        <Table.Td>
          <Group gap={4}>{triggerChips.length ? triggerChips : <Text c="dimmed">—</Text>}</Group>
        </Table.Td>
        <Table.Td>
          <Button
            size="xs"
            variant="light"
            onClick={(e) => {
              e.stopPropagation();
              onTrigger(automation);
            }}
          >
            Trigger
          </Button>
        </Table.Td>
      </Table.Tr>
      {/* Always render — let Collapse handle visibility so animation works correctly */}
      <Table.Tr style={{ background: "none" }}>
        <Table.Td colSpan={3} p={0} style={{ borderBottom: "none" }}>
          <Collapse in={expanded}>
            <Stack p="md" gap="xs">
              <Text size="xs" tt="uppercase" fw={600} c="dimmed">
                Trigger definitions
              </Text>
              <Code block fz="xs">
                {JSON.stringify(automation.triggers, null, 2)}
              </Code>
            </Stack>
          </Collapse>
        </Table.Td>
      </Table.Tr>
    </>
  );
}

interface Props {
  data: DashboardData | null;
}

export function AutomationsTab({ data }: Props) {
  const automations = data?.automations ?? [];
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [selectedAutomation, setSelectedAutomation] = useState<Automation | null>(null);

  function handleTrigger(automation: Automation) {
    setSelectedAutomation(automation);
    openModal();
  }

  return (
    <Stack gap="md">
      <Title order={2}>Automations</Title>

      <Table.ScrollContainer minWidth={500}>
        <Table striped highlightOnHover withTableBorder withColumnBorders={false}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Triggers</Table.Th>
              <Table.Th w={100}>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {automations.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={3}>
                  <Text c="dimmed" ta="center" py="xl">
                    No automations registered
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              automations.map((a) => (
                <AutomationRow key={a.name} automation={a} onTrigger={handleTrigger} />
              ))
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <TriggerModal automation={selectedAutomation} opened={modalOpened} onClose={closeModal} />
    </Stack>
  );
}
