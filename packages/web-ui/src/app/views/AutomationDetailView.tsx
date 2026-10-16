/**
 * Automation detail — triggers, enabled state, manual trigger, source, execution
 * history, and declared vs observed relationships.
 */
import {
  CircleCheck,
  CircleX,
  Clock,
  Cpu,
  FileCode,
  KeyRound,
  Play,
  ScrollText,
  TriangleAlert,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  fetchAutomationHistory,
  fetchAutomationRelationships,
  fetchAutomationSource,
  manualTriggerContext,
  setAutomationEnabled,
  triggerAutomation,
} from "../api.js";
import { SourceViewer } from "../components/SourceViewer.js";
import { useDataStore } from "../lib/data-store.js";
import { entryKey, formatDateTime, formatTime, LEVEL_NAMES } from "../lib/log-utils.js";
import { deviceDetailPath } from "../lib/router.js";
import { Link, useRouter } from "../lib/router-context.js";
import type { AutomationRelationships, ExecutionRecord, TriggerContext } from "../types.js";
import {
  Badge,
  Button,
  Card,
  Chip,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  EmptyState,
  Row,
  Stack,
  Switch,
} from "../ui/index.js";

/** How many of an automation's most recent log entries the detail view lists. */
const LOG_LIMIT = 50;

/** A quiet uppercase section label. */
function SectionLabel({ children }: { children: ReactNode }) {
  return <span className="text-xs font-bold uppercase tracking-wide text-muted">{children}</span>;
}

/** A short, human description of what fired a run. */
function describeTrigger(trigger: TriggerContext): string {
  switch (trigger.type) {
    case "mqtt":
      return trigger.topic;
    case "cron":
      return trigger.expression;
    case "state":
      return trigger.key;
    case "webhook":
      return `${trigger.method} ${trigger.path}`;
    default:
      return trigger.type;
  }
}

/** The mono treatment for a raw state key. */
const CODE_CLASSES =
  "inline-flex items-center rounded-input border border-hairline bg-surface-2 px-2 py-0.5 font-mono text-xs text-ink";

export function AutomationDetailView({ name }: { name: string }) {
  const { automations, devices, logs, subscribe, refresh } = useDataStore();
  const { basePath } = useRouter();
  const automation = automations.find((a) => a.name === name);

  const [history, setHistory] = useState<ExecutionRecord[] | null>(null);
  const [relationships, setRelationships] = useState<AutomationRelationships | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
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
    setSourceOpen(false);
    void loadDetails();
  }, [name]);

  // A completion event for this automation triggers a lightweight history
  // re-fetch rather than reconstructing the record client-side.
  useEffect(() => {
    return subscribe((event) => {
      if (event.category === "automation_execution" && event.automation === name) {
        void loadDetails();
      }
    });
  }, [subscribe, name]);

  // The store's log buffer updates from the stream, so this list appends live.
  const automationLogs = useMemo(
    () =>
      logs
        .filter((entry) => entry.automation === name)
        .slice(-LOG_LIMIT)
        .reverse(),
    [logs, name],
  );

  if (!automation) {
    return (
      <EmptyState
        icon={<TriangleAlert size={28} />}
        title="Automation not found"
        description={`No automation named "${name}" is currently registered.`}
      />
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
      const trigger = automation?.triggers[0];
      await triggerAutomation(name, manualTriggerContext(trigger?.type ?? "cron"));
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
    <Stack gap={4}>
      <Row justify="between" align="start" gap={3} wrap>
        <h2 className="min-w-0 truncate font-display text-2xl font-bold text-ink">{name}</h2>
        <Stack gap={1} align="end" className="shrink-0">
          <label className="flex items-center gap-2 text-sm text-muted">
            <Switch
              checked={automation.enabled}
              disabled={toggling}
              aria-label={`Enable ${name}`}
              onCheckedChange={(next) => void handleToggle(next)}
            />
            <span>{automation.enabled ? "Enabled" : "Disabled"}</span>
          </label>
          {toggleError && (
            <p role="alert" className="max-w-[16rem] text-xs text-danger">
              {toggleError}
            </p>
          )}
        </Stack>
      </Row>

      <Card>
        <Stack gap={2}>
          <SectionLabel>Triggers</SectionLabel>
          {automation.triggers.length === 0 ? (
            <p className="text-sm text-muted">No declared triggers.</p>
          ) : (
            <Stack gap={1}>
              {automation.triggers.map((trigger, i) => (
                <code
                  key={i}
                  className="block overflow-auto rounded-input border border-hairline bg-surface-2 p-2 font-mono text-xs text-ink"
                >
                  {JSON.stringify(trigger)}
                </code>
              ))}
            </Stack>
          )}
        </Stack>
      </Card>

      <Row gap={2} align="center" wrap>
        <Button
          size="sm"
          disabled={triggering || !automation.enabled}
          onClick={() => void handleTrigger()}
        >
          <Play size={14} aria-hidden />
          Trigger now
        </Button>
        {triggerError && (
          <p role="alert" className="text-sm text-danger">
            {triggerError}
          </p>
        )}
        {!automation.enabled && (
          <span className="text-xs text-muted">
            Disabled automations cannot be manually triggered.
          </span>
        )}
      </Row>

      <Card>
        <Stack gap={2}>
          <Row gap={1} align="center">
            <Clock size={14} aria-hidden className="text-muted" />
            <SectionLabel>Recent executions</SectionLabel>
          </Row>
          {history === null ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted">No executions since startup.</p>
          ) : (
            <Stack gap={1}>
              {history.map((record, i) => (
                <Row
                  key={i}
                  justify="between"
                  align="center"
                  gap={2}
                  wrap
                  className="border-b border-hairline py-1 last:border-b-0"
                >
                  <span className="text-sm text-ink">
                    {new Date(record.startedAt).toLocaleString()}
                  </span>
                  <Row gap={2} align="center" wrap>
                    <Badge tone="neutral">{record.trigger.type}</Badge>
                    <span
                      className="max-w-[12rem] truncate font-mono text-xs text-muted"
                      title={describeTrigger(record.trigger)}
                    >
                      {describeTrigger(record.trigger)}
                    </span>
                    <span className="font-mono text-xs text-muted">{record.durationMs}ms</span>
                    <Badge tone={record.outcome === "success" ? "on" : "danger"}>
                      {record.outcome}
                    </Badge>
                  </Row>
                  {record.error && (
                    <p className="w-full text-xs text-danger" title={record.error}>
                      {record.error}
                    </p>
                  )}
                </Row>
              ))}
            </Stack>
          )}
        </Stack>
      </Card>

      <Card>
        <Stack gap={3}>
          <SectionLabel>Declared — complete without running</SectionLabel>

          <Stack gap={1}>
            <span className="text-sm font-medium text-ink">Required services</span>
            {relationships === null ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : relationships.declared.requiredServices.length === 0 ? (
              <p className="text-sm text-muted">None declared.</p>
            ) : (
              <Row gap={1} wrap>
                {relationships.declared.requiredServices.map((svc) => (
                  <Badge key={svc.name} tone={svc.registered ? "on" : "danger"}>
                    {svc.registered ? (
                      <CircleCheck size={12} aria-hidden />
                    ) : (
                      <CircleX size={12} aria-hidden />
                    )}
                    {svc.name}
                    {svc.registered ? "" : " · unavailable"}
                  </Badge>
                ))}
              </Row>
            )}
          </Stack>

          <Stack gap={1}>
            <Row gap={1} align="center">
              <Cpu size={13} aria-hidden className="text-muted" />
              <span className="text-sm font-medium text-ink">Related devices</span>
            </Row>
            {relationships === null ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : relationships.declared.relatedDevices.length === 0 ? (
              <p className="text-sm text-muted">None declared.</p>
            ) : (
              <Row gap={1} wrap>
                {relationships.declared.relatedDevices.map((deviceName) => {
                  const device = findDevice(deviceName);
                  return device ? (
                    <Link
                      key={deviceName}
                      to={deviceDetailPath(basePath, device.qualifiedId)}
                      className="inline-flex items-center rounded-pill border border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-accent hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      {deviceName}
                    </Link>
                  ) : (
                    <Chip key={deviceName}>{deviceName}</Chip>
                  );
                })}
              </Row>
            )}
          </Stack>

          <Stack gap={1}>
            <Row gap={1} align="center">
              <KeyRound size={13} aria-hidden className="text-muted" />
              <span className="text-sm font-medium text-ink">Watched state keys</span>
            </Row>
            {relationships === null ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : relationships.declared.watchedStateKeys.length === 0 ? (
              <p className="text-sm text-muted">None declared.</p>
            ) : (
              <Row gap={1} wrap>
                {relationships.declared.watchedStateKeys.map((key) => (
                  <code key={key} className={CODE_CLASSES}>
                    {key}
                  </code>
                ))}
              </Row>
            )}
          </Stack>
        </Stack>
      </Card>

      <Card>
        <Stack gap={2}>
          <Row gap={2} align="center" wrap>
            <SectionLabel>Observed — since startup</SectionLabel>
            {relationships?.observed.truncated && <Badge tone="stale">truncated</Badge>}
          </Row>
          <Row gap={1} align="center">
            <KeyRound size={13} aria-hidden className="text-muted" />
            <span className="text-sm font-medium text-ink">Written state keys</span>
          </Row>
          {relationships === null ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : relationships.observed.writtenStateKeys.length === 0 ? (
            <p className="text-sm text-muted">
              None observed yet — this does not mean the automation writes nothing, only that no
              write has been observed since startup.
            </p>
          ) : (
            <Row gap={1} wrap>
              {relationships.observed.writtenStateKeys.map((key) => (
                <code key={key} className={CODE_CLASSES}>
                  {key}
                </code>
              ))}
            </Row>
          )}
        </Stack>
      </Card>

      <Card>
        <Stack gap={2}>
          <Row gap={1} align="center">
            <ScrollText size={14} aria-hidden className="text-muted" />
            <SectionLabel>Log entries</SectionLabel>
          </Row>
          {automationLogs.length === 0 ? (
            <p className="text-sm text-muted">No log entries for this automation.</p>
          ) : (
            <Stack gap={1}>
              {automationLogs.map((entry) => (
                <Row key={entryKey(entry)} gap={2} align="baseline" wrap={false}>
                  <span
                    className="shrink-0 font-mono text-xs text-muted"
                    title={formatDateTime(entry.time)}
                  >
                    {formatTime(entry.time)}
                  </span>
                  <Badge tone="neutral">{LEVEL_NAMES[entry.level] ?? entry.level}</Badge>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink" title={entry.msg}>
                    {entry.msg}
                  </span>
                </Row>
              ))}
            </Stack>
          )}
        </Stack>
      </Card>

      <Collapsible
        open={sourceOpen}
        onOpenChange={(open) => {
          setSourceOpen(open);
          if (open) void handleOpenSource();
        }}
      >
        <Card>
          <Stack gap={3}>
            <Row gap={2} align="center" wrap>
              <CollapsibleTrigger asChild>
                <Button size="sm" variant="soft">
                  <FileCode size={14} aria-hidden />
                  {sourceOpen ? "Hide source" : "Show source"}
                </Button>
              </CollapsibleTrigger>
              <span className="text-xs text-muted">
                Opening this section loads the syntax highlighter.
              </span>
            </Row>
            <CollapsibleContent>
              {source === null ? (
                <p className="text-sm text-muted">Loading source…</p>
              ) : (
                <SourceViewer source={source} />
              )}
            </CollapsibleContent>
          </Stack>
        </Card>
      </Collapsible>
    </Stack>
  );
}
