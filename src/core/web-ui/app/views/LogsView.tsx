/**
 * The operator log view — level and free-text filtering, appending new
 * entries live without discarding an active filter (design.md D25;
 * specs/web-ui "Operator Views"; task 10.21).
 *
 * Filtering itself is the pure `log-filter.ts` module (design.md D23) —
 * this component only wires filter state to it and renders the result.
 */
import {
  Badge,
  Code,
  Collapse,
  Group,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { useDataStore } from "../lib/data-store.js";
import {
  EMPTY_LOG_FILTER,
  filterLogEntries,
  isLogFilterActive,
  type LogFilter,
} from "../lib/log-filter.js";
import {
  entryKey,
  extraFields,
  formatDateTime,
  formatFieldValue,
  formatTime,
  LEVEL_OPTIONS,
  levelColor,
} from "../utils/logUtils.js";

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
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap">
        <Title order={2}>Logs</Title>
        <Text size="xs" c="dimmed">
          {filtered.length} entr{filtered.length === 1 ? "y" : "ies"}
        </Text>
      </Group>

      <Group gap="sm" wrap="wrap">
        <SegmentedControl
          size="xs"
          data={LEVEL_OPTIONS}
          value={String(filter.minLevel)}
          onChange={(v) => setFilter((f) => ({ ...f, minLevel: Number.parseInt(v, 10) }))}
        />
        <TextInput
          size="xs"
          placeholder="Filter by automation"
          value={filter.automation}
          onChange={(e) => setFilter((f) => ({ ...f, automation: e.currentTarget.value }))}
        />
        <TextInput
          size="xs"
          placeholder="Search text"
          value={filter.text}
          onChange={(e) => setFilter((f) => ({ ...f, text: e.currentTarget.value }))}
        />
        {isLogFilterActive(filter) && (
          <Text
            size="xs"
            c="blue"
            style={{ cursor: "pointer" }}
            onClick={() => setFilter(EMPTY_LOG_FILTER)}
          >
            Clear filters
          </Text>
        )}
      </Group>

      <ScrollArea h={520}>
        <Stack gap={2}>
          {filtered.length === 0 && (
            <Text c="dimmed" size="sm">
              No log entries match the current filters.
            </Text>
          )}
          {filtered.map((entry) => {
            const key = entryKey(entry);
            const isOpen = expanded.has(key);
            const extras = extraFields(entry);
            return (
              <div key={key}>
                <Group
                  gap="xs"
                  wrap="nowrap"
                  onClick={() => toggleRow(key)}
                  style={{
                    cursor: "pointer",
                    borderLeft: `3px solid var(--mantine-color-${levelColor(entry.level)}-5)`,
                    padding: "2px 6px",
                  }}
                >
                  {extras.length > 0 && (
                    <IconChevronRight
                      size={12}
                      style={{ transform: isOpen ? "rotate(90deg)" : undefined }}
                    />
                  )}
                  <Text
                    size="xs"
                    c="dimmed"
                    title={formatDateTime(entry.time)}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {formatTime(entry.time)}
                  </Text>
                  <Badge size="xs" color={levelColor(entry.level)} variant="light">
                    {entry.level}
                  </Badge>
                  {entry.automation && (
                    <Badge size="xs" variant="outline">
                      {entry.automation}
                    </Badge>
                  )}
                  <Text size="sm" style={{ flex: 1 }} truncate>
                    {entry.msg}
                  </Text>
                </Group>
                {extras.length > 0 && (
                  <Collapse expanded={isOpen}>
                    <Stack gap={2} pl="lg" py={4}>
                      {extras.map(([field, value]) => (
                        <Group key={field} gap="xs" wrap="nowrap" align="flex-start">
                          <Text size="xs" c="dimmed" w={100}>
                            {field}
                          </Text>
                          <Code fz="xs" style={{ whiteSpace: "pre-wrap" }}>
                            {formatFieldValue(value)}
                          </Code>
                        </Group>
                      ))}
                    </Stack>
                  </Collapse>
                )}
              </div>
            );
          })}
        </Stack>
      </ScrollArea>
    </Stack>
  );
}
