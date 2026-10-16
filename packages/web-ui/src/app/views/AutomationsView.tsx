/**
 * Automation list — each automation's enabled state, toggleable, with a failed
 * toggle leaving the previous state and surfacing the error.
 */
import { Workflow } from "lucide-react";
import { useState } from "react";
import { setAutomationEnabled } from "../api.js";
import { useDataStore } from "../lib/data-store.js";
import { automationDetailPath } from "../lib/router.js";
import { Link, useRouter } from "../lib/router-context.js";
import { Card, EmptyState, Row, Stack, Switch } from "../ui/index.js";

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
    <Stack gap={4}>
      <h2 className="font-display text-2xl font-bold text-ink">Automations</h2>

      {automations.length === 0 ? (
        <EmptyState
          icon={<Workflow size={28} />}
          title="No automations discovered"
          description="Automations appear here once the engine has scanned its automations directory."
        />
      ) : (
        <Stack gap={2}>
          {automations.map((automation) => {
            const error = errors.get(automation.name);
            return (
              <Card key={automation.name} padding={false}>
                <Row justify="between" align="center" gap={2} wrap>
                  <Link
                    to={automationDetailPath(basePath, automation.name)}
                    className="flex min-w-0 flex-1 items-center rounded-tile px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <Stack gap={0} className="min-w-0">
                      <span className="truncate font-semibold text-ink">{automation.name}</span>
                      <span className="text-xs text-muted">
                        {automation.triggers.length} trigger
                        {automation.triggers.length === 1 ? "" : "s"}
                      </span>
                    </Stack>
                  </Link>
                  <Stack gap={1} align="end" className="shrink-0 py-2 pr-4">
                    <label className="flex items-center gap-2 text-sm text-muted">
                      <Switch
                        checked={automation.enabled}
                        disabled={pending.has(automation.name)}
                        aria-label={`Enable ${automation.name}`}
                        onCheckedChange={(next) => void handleToggle(automation.name, next)}
                      />
                      <span>{automation.enabled ? "Enabled" : "Disabled"}</span>
                    </label>
                    {error && (
                      <p role="alert" className="max-w-[16rem] text-xs text-danger">
                        {error}
                      </p>
                    )}
                  </Stack>
                </Row>
              </Card>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
