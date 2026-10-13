/**
 * The operator log view — level and free-text (message + automation) filtering,
 * appending new entries live without discarding an active filter (design.md
 * D12; specs/web-ui "Operator Views"; task 6.2).
 *
 * Filtering itself is the pure `log-filter.ts` module — this component only
 * wires filter state to it and renders the result, so a newly streamed entry is
 * filtered the same way an existing one is and the active filter stays applied.
 *
 * Rebuilt on the Lumen primitive layer (`ui/*`) and `lucide-react`.
 */
import { ChevronRight, ScrollText } from "lucide-react";
import { useMemo, useState } from "react";
import { useDataStore } from "../lib/data-store.js";
import {
  EMPTY_LOG_FILTER,
  filterLogEntries,
  isLogFilterActive,
  type LogFilter,
} from "../lib/log-filter.js";
import {
  Badge,
  type BadgeTone,
  Button,
  cn,
  EmptyState,
  Row,
  ScrollArea,
  Stack,
  ToggleGroup,
  ToggleGroupItem,
} from "../ui/index.js";
import {
  entryKey,
  extraFields,
  formatDateTime,
  formatFieldValue,
  formatTime,
  LEVEL_NAMES,
  LEVEL_OPTIONS,
} from "../utils/logUtils.js";

/** The shared text-input treatment (the `ui/` layer carries no input primitive). */
const INPUT_CLASSES =
  "touch-target h-8 w-full rounded-input border border-hairline bg-surface px-3 text-sm text-ink motion-toggle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** The badge tone for a pino level, doubling as the non-colour-coded severity. */
function levelTone(level: number): BadgeTone {
  if (level <= 20) return "info";
  if (level === 30) return "on";
  if (level === 40) return "stale";
  return "danger";
}

/** The left-edge accent class mirroring {@link levelTone}. */
function levelBorderClass(level: number): string {
  if (level <= 20) return "border-info";
  if (level === 30) return "border-on";
  if (level === 40) return "border-stale";
  return "border-danger";
}

export function LogsView() {
  const { logs } = useDataStore();
  const [filter, setFilter] = useState<LogFilter>(EMPTY_LOG_FILTER);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => filterLogEntries(logs, filter).slice().reverse(), [logs, filter]);

  function toggleRow(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <Stack gap={4}>
      <Row justify="between" align="center" gap={3} wrap>
        <h2 className="font-display text-2xl font-bold text-ink">Logs</h2>
        <span className="text-xs text-muted">
          {filtered.length} entr{filtered.length === 1 ? "y" : "ies"}
        </span>
      </Row>

      <Row gap={2} align="center" wrap>
        <ToggleGroup
          type="single"
          aria-label="Minimum log level"
          value={String(filter.minLevel)}
          onValueChange={(value) => {
            setFilter((f) => ({ ...f, minLevel: Number.parseInt(value || "0", 10) }));
          }}
          className="flex flex-wrap gap-1 rounded-input border border-hairline bg-surface-2 p-1"
        >
          {LEVEL_OPTIONS.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <input
          type="search"
          className={cn(INPUT_CLASSES, "sm:max-w-[12rem]")}
          placeholder="Filter by automation"
          aria-label="Filter by automation"
          value={filter.automation}
          onChange={(event) => setFilter((f) => ({ ...f, automation: event.currentTarget.value }))}
        />
        <input
          type="search"
          className={cn(INPUT_CLASSES, "sm:max-w-[14rem]")}
          placeholder="Search text"
          aria-label="Search text"
          value={filter.text}
          onChange={(event) => setFilter((f) => ({ ...f, text: event.currentTarget.value }))}
        />
        {isLogFilterActive(filter) && (
          <Button size="sm" variant="ghost" onClick={() => setFilter(EMPTY_LOG_FILTER)}>
            Clear filters
          </Button>
        )}
      </Row>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ScrollText size={28} />}
          title="No log entries match"
          description={
            isLogFilterActive(filter)
              ? "No entries match the current filters. Adjust or clear them to see more."
              : "Log entries appear here as the engine emits them."
          }
        />
      ) : (
        <ScrollArea className="h-[32rem] rounded-tile border border-hairline bg-surface">
          <Stack gap={0} className="p-2">
            {filtered.map((entry) => {
              const key = entryKey(entry);
              const isOpen = expanded.has(key);
              const extras = extraFields(entry);
              const expandable = extras.length > 0;
              return (
                <div key={key}>
                  <button
                    type="button"
                    onClick={() => toggleRow(key)}
                    aria-expanded={expandable ? isOpen : undefined}
                    className={cn(
                      "flex w-full items-center gap-2 border-l-4 py-1 pl-2 pr-1 text-left motion-toggle hover:bg-surface-2",
                      "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
                      levelBorderClass(entry.level),
                    )}
                  >
                    {expandable && (
                      <ChevronRight
                        size={12}
                        aria-hidden
                        className={cn("shrink-0 text-muted motion-toggle", isOpen && "rotate-90")}
                      />
                    )}
                    <span
                      className="shrink-0 font-mono text-xs text-muted"
                      title={formatDateTime(entry.time)}
                    >
                      {formatTime(entry.time)}
                    </span>
                    <Badge tone={levelTone(entry.level)}>
                      {LEVEL_NAMES[entry.level] ?? entry.level}
                    </Badge>
                    {entry.automation && <Badge tone="neutral">{entry.automation}</Badge>}
                    <span className="min-w-0 flex-1 truncate text-sm text-ink" title={entry.msg}>
                      {entry.msg}
                    </span>
                  </button>
                  {expandable && isOpen && (
                    <Stack gap={1} className="py-2 pl-8 pr-2">
                      {extras.map(([field, value]) => (
                        <Row key={field} gap={2} align="start" wrap={false}>
                          <span className="w-24 shrink-0 text-xs text-muted">{field}</span>
                          <code className="min-w-0 flex-1 whitespace-pre-wrap break-all rounded-input border border-hairline bg-surface-2 p-1 font-mono text-xs text-ink">
                            {formatFieldValue(value)}
                          </code>
                        </Row>
                      ))}
                    </Stack>
                  )}
                </div>
              );
            })}
          </Stack>
        </ScrollArea>
      )}
    </Stack>
  );
}
