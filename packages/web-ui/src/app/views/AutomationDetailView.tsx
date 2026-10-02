/**
 * Automation detail — triggers, enabled state, manual trigger, source,
 * execution history, and relationships (design.md D4, D11, D27; specs/web-ui
 * "Automation Management Interface"; tasks 10.14–10.17).
 *
 * The manual trigger control is unavailable while the automation is
 * disabled, so the server's 409 (design.md D27) is a guard this view
 * prevents from being reached in the ordinary case, not an expected
 * response the user sees.
 */
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Code,
  Group,
  Paper,
  Stack,
  Switch,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import {
  fetchAutomationHistory,
  fetchAutomationRelationships,
  fetchAutomationSource,
  setAutomationEnabled,
  triggerAutomation,
} from "../api.js";
import { SourceViewer } from "../components/SourceViewer.js";
import { useDataStore } from "../lib/data-store.js";
import { deviceDetailPath } from "../lib/router.js";
import { Link, useRouter } from "../lib/router-context.js";
import type { AutomationRelationships, ExecutionRecord } from "../types.js";

function outcomeColor(outcome: "success" | "failure"): string {
  return outcome === "success" ? "green" : "red";
}

export function AutomationDetailView({ name }: { name: string }) {
  const { automations, devices, subscribe, refresh } = useDataStore();
  const { basePath } = useRouter();
  const automation = automations.find((a) => a.name === name);

  const [history, setHistory] = useState<ExecutionRecord[] | null>(null);
  const [relationships, setRelationships] = useState<AutomationRelationships | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);

  async function loadDetails() {
    const [historyRes, relationshipsRes] = await Promise.all([
      fetchAutomationHistory(name).catch(() => []),
      fetchAutomationRelationships(name).catch(() => null),
    ]);
    setHistory(historyRes);
    setRelationships(relationshipsRes);
  }

  useEffect(() => {
    setHistory(null);
    setRelationships(null);
    setSource(null);
    void loadDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  // New executions appear without a manual refresh (task 10.17): a
  // completion event for this automation triggers a lightweight history
  // re-fetch rather than trying to reconstruct the record client-side.
  useEffect(() => {
    return subscribe((event) => {
      if (event.category === "automation_execution" && event.automation === name) {
        void loadDetails();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, name]);

  if (!automation) {
    return (
      <Alert color="yellow" icon={<IconAlertTriangle size={16} />} title="Automation not found">
        No automation named "{name}" is currently registered.
      </Alert>
    );
  }

  async function handleToggle(enabled: boolean) {
    setToggling(true);
    setToggleError(null);
    try {
      await setAutomationEnabled(name, enabled);
      await refresh();
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setToggling(false);
    }
  }

  async function handleTrigger() {
    setTriggering(true);
    setTriggerError(null);
    try {
      const trigger = automation!.triggers[0];
      await triggerAutomation(name, { type: trigger?.type ?? "cron" });
    } catch (err) {
      setTriggerError(err instanceof Error ? err.message : "Trigger failed");
    } finally {
      setTriggering(false);
    }
  }

  async function handleOpenSource() {
    if (source !== null) return;
    const src = await fetchAutomationSource(name).catch((err: unknown) =>
      err instanceof Error
        ? `// Failed to load source: ${err.message}`
        : "// Failed to load source",
    );
    setSource(src);
  }

  function findDevice(name: string) {
    return devices.find((d) => d.displayName === name || d.id === name);
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>{name}</Title>
        <Tooltip label={toggleError ?? ""} color="red" disabled={!toggleError}>
          <Switch
            checked={automation.enabled}
            disabled={toggling}
            onChange={(e) => handleToggle(e.currentTarget.checked)}
            label={automation.enabled ? "Enabled" : "Disabled"}
          />
        </Tooltip>
      </Group>

      <Paper withBorder p="sm" radius="md">
        <Text size="xs" tt="uppercase" c="dimmed" fw={600} mb={6}>
          Triggers
        </Text>
        <Stack gap={4}>
          {automation.triggers.map((trigger, i) => (
            <Code key={i} block>
              {JSON.stringify(trigger)}
            </Code>
          ))}
          {automation.triggers.length === 0 && (
            <Text size="sm" c="dimmed">
              No declared triggers.
            </Text>
          )}
        </Stack>
      </Paper>

      <Group>
        <Tooltip
          label="Disabled automations cannot be manually triggered"
          disabled={automation.enabled}
        >
          <Button onClick={handleTrigger} loading={triggering} disabled={!automation.enabled}>
            Trigger now
          </Button>
        </Tooltip>
        {triggerError && (
          <Text c="red" size="sm">
            {triggerError}
          </Text>
        )}
      </Group>

      <Accordion multiple defaultValue={["history"]}>
        <Accordion.Item value="history">
          <Accordion.Control>Recent executions</Accordion.Control>
          <Accordion.Panel>
            {history === null ? (
              <Text size="sm" c="dimmed">
                Loading…
              </Text>
            ) : history.length === 0 ? (
              <Text size="sm" c="dimmed">
                No executions since startup.
              </Text>
            ) : (
              <Stack gap={4}>
                {history.map((record, i) => (
                  <Group key={i} justify="space-between" wrap="nowrap">
                    <Text size="sm">{new Date(record.startedAt).toLocaleString()}</Text>
                    <Text size="xs" c="dimmed">
                      {record.durationMs}ms
                    </Text>
                    <Badge size="sm" color={outcomeColor(record.outcome)} variant="light">
                      {record.outcome}
                    </Badge>
                    {record.error && (
                      <Text size="xs" c="red" truncate style={{ flex: 1 }}>
                        {record.error}
                      </Text>
                    )}
                  </Group>
                ))}
              </Stack>
            )}
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="relationships">
          <Accordion.Control>Relationships</Accordion.Control>
          <Accordion.Panel>
            {relationships === null ? (
              <Text size="sm" c="dimmed">
                Loading…
              </Text>
            ) : (
              <Stack gap="sm">
                <div>
                  <Text size="xs" tt="uppercase" c="dimmed" fw={600} mb={4}>
                    Required services
                  </Text>
                  {relationships.declared.requiredServices.length === 0 ? (
                    <Text size="sm" c="dimmed">
                      None declared.
                    </Text>
                  ) : (
                    <Group gap="xs">
                      {relationships.declared.requiredServices.map((svc) => (
                        <Badge
                          key={svc.name}
                          color={svc.registered ? "green" : "red"}
                          variant="light"
                        >
                          {svc.name} {svc.registered ? "" : "· unavailable"}
                        </Badge>
                      ))}
                    </Group>
                  )}
                </div>

                <div>
                  <Text size="xs" tt="uppercase" c="dimmed" fw={600} mb={4}>
                    Related devices
                  </Text>
                  {relationships.declared.relatedDevices.length === 0 ? (
                    <Text size="sm" c="dimmed">
                      None declared.
                    </Text>
                  ) : (
                    <Group gap="xs">
                      {relationships.declared.relatedDevices.map((deviceName) => {
                        const device = findDevice(deviceName);
                        return device ? (
                          <Link
                            key={deviceName}
                            to={deviceDetailPath(basePath, device.qualifiedId)}
                          >
                            <Badge variant="light" style={{ cursor: "pointer" }}>
                              {deviceName}
                            </Badge>
                          </Link>
                        ) : (
                          <Badge key={deviceName} variant="light" color="gray">
                            {deviceName}
                          </Badge>
                        );
                      })}
                    </Group>
                  )}
                </div>

                <div>
                  <Text size="xs" tt="uppercase" c="dimmed" fw={600} mb={4}>
                    Watched state keys (declared)
                  </Text>
                  {relationships.declared.watchedStateKeys.length === 0 ? (
                    <Text size="sm" c="dimmed">
                      None declared.
                    </Text>
                  ) : (
                    <Group gap="xs">
                      {relationships.declared.watchedStateKeys.map((key) => (
                        <Code key={key}>{key}</Code>
                      ))}
                    </Group>
                  )}
                </div>

                <div>
                  <Text size="xs" tt="uppercase" c="dimmed" fw={600} mb={4}>
                    Observed written state keys (since startup)
                    {relationships.observed.truncated && (
                      <Badge ml={6} size="xs" color="yellow" variant="light">
                        truncated
                      </Badge>
                    )}
                  </Text>
                  {relationships.observed.writtenStateKeys.length === 0 ? (
                    <Text size="sm" c="dimmed">
                      None observed yet — this does not mean the automation writes nothing, only
                      that no write has been observed since startup.
                    </Text>
                  ) : (
                    <Group gap="xs">
                      {relationships.observed.writtenStateKeys.map((key) => (
                        <Code key={key}>{key}</Code>
                      ))}
                    </Group>
                  )}
                </div>
              </Stack>
            )}
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="source">
          <Accordion.Control onClick={handleOpenSource}>Source</Accordion.Control>
          <Accordion.Panel>
            {source === null ? (
              <Text size="sm" c="dimmed">
                Opening this section loads the source.
              </Text>
            ) : (
              <SourceViewer source={source} />
            )}
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}
