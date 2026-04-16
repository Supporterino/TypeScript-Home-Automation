import {
  Accordion,
  Badge,
  Button,
  Code,
  Group,
  JsonInput,
  Modal,
  Select,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { triggerAutomation } from "../api.js";
import type { Automation, DashboardData } from "../types.js";

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

// ── Trigger modal ─────────────────────────────────────────────────────────

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

  // Reset form whenever the modal opens or the target automation changes.
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
          validationError="Invalid JSON"
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

// ── Automation accordion control label ────────────────────────────────────

interface AutomationControlLabelProps {
  automation: Automation;
  onTrigger: (automation: Automation) => void;
}

function AutomationControlLabel({ automation, onTrigger }: AutomationControlLabelProps) {
  const triggerChips = automation.triggers.map((t, i) => (
    <Badge
      key={`${t.type}-${i}`}
      color={TRIGGER_TYPE_COLORS[t.type] ?? "gray"}
      variant="light"
      size="sm"
    >
      {t.type}
    </Badge>
  ));

  return (
    <Group gap="sm" wrap="nowrap" justify="space-between">
      <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
        <Text fw={600} ff="monospace" size="sm" style={{ flexShrink: 0 }}>
          {automation.name}
        </Text>
        <Group gap={4} wrap="wrap">
          {triggerChips.length ? (
            triggerChips
          ) : (
            <Text c="dimmed" size="xs">
              —
            </Text>
          )}
        </Group>
      </Group>
      <Button
        size="xs"
        variant="light"
        style={{ flexShrink: 0 }}
        onClick={(e) => {
          e.stopPropagation();
          onTrigger(automation);
        }}
      >
        Trigger
      </Button>
    </Group>
  );
}

// ── AutomationsTab ────────────────────────────────────────────────────────

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

  if (automations.length === 0) {
    return (
      <Stack gap="md">
        <Title order={2}>Automations</Title>
        <Text c="dimmed" ta="center" py="xl">
          No automations registered
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="baseline">
        <Title order={2}>Automations</Title>
        <Text size="sm" c="dimmed">
          {automations.length} {automations.length === 1 ? "automation" : "automations"}
        </Text>
      </Group>

      <Accordion variant="separated" radius="md" chevronPosition="right">
        {automations.map((automation) => (
          <Accordion.Item key={automation.name} value={automation.name}>
            <Accordion.Control
              aria-label={`${automation.name} — ${automation.triggers.length} triggers`}
            >
              <AutomationControlLabel automation={automation} onTrigger={handleTrigger} />
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="xs">
                <Text size="xs" tt="uppercase" fw={600} c="dimmed">
                  Trigger definitions
                </Text>
                <Code block fz="xs" ff="monospace">
                  {JSON.stringify(automation.triggers, null, 2)}
                </Code>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>

      <TriggerModal automation={selectedAutomation} opened={modalOpened} onClose={closeModal} />
    </Stack>
  );
}
