/**
 * Automation list — shows each automation's enabled state and allows it to
 * be toggled, reverting and surfacing the error on failure (design.md D4,
 * D27; specs/web-ui "Automation Management Interface"; task 10.13).
 */
import { Group, Paper, Stack, Switch, Text, Title, Tooltip } from "@mantine/core";
import { useState } from "react";
import { setAutomationEnabled } from "../api.js";
import { useDataStore } from "../lib/data-store.js";
import { automationDetailPath } from "../lib/router.js";
import { Link, useRouter } from "../lib/router-context.js";

export function AutomationsView() {
  const { automations, refresh } = useDataStore();
  const { basePath } = useRouter();
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());

  async function handleToggle(name: string, enabled: boolean) {
    setPending((prev) => new Set(prev).add(name));
    setErrors((prev) => {
      const next = new Map(prev);
      next.delete(name);
      return next;
    });
    try {
      await setAutomationEnabled(name, enabled);
      await refresh();
    } catch (err) {
      setErrors((prev) =>
        new Map(prev).set(name, err instanceof Error ? err.message : "Failed to update"),
      );
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    }
  }

  return (
    <Stack gap="md">
      <Title order={2}>Automations</Title>

      {automations.length === 0 ? (
        <Text c="dimmed" size="sm">
          No automations discovered.
        </Text>
      ) : (
        <Stack gap="xs">
          {automations.map((automation) => {
            const error = errors.get(automation.name);
            const control = (
              <Switch
                checked={automation.enabled}
                disabled={pending.has(automation.name)}
                onChange={(e) => handleToggle(automation.name, e.currentTarget.checked)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Enable ${automation.name}`}
              />
            );
            return (
              <Paper key={automation.name} withBorder p="sm" radius="md">
                <Group justify="space-between">
                  <Link
                    to={automationDetailPath(basePath, automation.name)}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <Stack gap={2}>
                      <Text fw={600}>{automation.name}</Text>
                      <Text size="xs" c="dimmed">
                        {automation.triggers.length} trigger
                        {automation.triggers.length === 1 ? "" : "s"}
                      </Text>
                    </Stack>
                  </Link>
                  {error ? (
                    <Tooltip label={error} color="red">
                      {control}
                    </Tooltip>
                  ) : (
                    control
                  )}
                </Group>
              </Paper>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
