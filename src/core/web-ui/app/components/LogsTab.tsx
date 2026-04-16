import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Code,
  Collapse,
  Group,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconArrowDown, IconChevronRight, IconX } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import type { DashboardData, LogEntry } from "../types.js";
import {
  entryKey,
  extraFields,
  formatDateTime,
  formatFieldValue,
  formatTime,
  LEVEL_NAMES,
  LEVEL_OPTIONS,
  levelColor,
  levelCssColor,
} from "../utils/logUtils.js";

// ── Component ─────────────────────────────────────────────────────────────

interface Props {
  data: DashboardData | null;
}

export function LogsTab({ data }: Props) {
  const allLogs = data?.logs ?? [];

  const [levelFilter, setLevelFilter] = useState("0");
  const [autoFilter, setAutoFilter] = useState("");
  const [textFilter, setTextFilter] = useState("");
  const [tailMode, setTailMode] = useState(false);

  // Expansion keyed by stable entry identity so expansions survive data refreshes.
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLogCount = useRef(allLogs.length);

  // Auto-scroll to bottom when new entries arrive and tail mode is on.
  useEffect(() => {
    if (tailMode && allLogs.length !== prevLogCount.current && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
    prevLogCount.current = allLogs.length;
  }, [allLogs.length, tailMode]);

  const hasActiveFilters = levelFilter !== "0" || autoFilter !== "" || textFilter !== "";

  function clearFilters() {
    setLevelFilter("0");
    setAutoFilter("");
    setTextFilter("");
  }

  const minLevel = Number.parseInt(levelFilter, 10);

  const filtered = allLogs
    .filter((e) => (minLevel > 0 ? e.level >= minLevel : true))
    .filter((e) =>
      autoFilter ? (e.automation ?? "").toLowerCase().includes(autoFilter.toLowerCase()) : true,
    )
    .filter((e) =>
      textFilter
        ? (e.msg ?? "").toLowerCase().includes(textFilter.toLowerCase()) ||
          JSON.stringify(e).toLowerCase().includes(textFilter.toLowerCase())
        : true,
    )
    .slice()
    .reverse();

  function toggleRow(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <Stack gap="md">
      <Title order={2}>Logs</Title>

      {/* ── Filter bar ─────────────────────────────────────────────────── */}
      <Stack gap="xs">
        <SegmentedControl
          data={LEVEL_OPTIONS}
          value={levelFilter}
          onChange={setLevelFilter}
          size="xs"
          fullWidth
        />
        <Group gap="sm" wrap="wrap">
          <TextInput
            placeholder="Filter by automation…"
            value={autoFilter}
            onChange={(e) => setAutoFilter(e.currentTarget.value)}
            size="xs"
            w={200}
            rightSection={
              autoFilter ? (
                <ActionIcon size="xs" variant="subtle" onClick={() => setAutoFilter("")}>
                  <IconX size={10} />
                </ActionIcon>
              ) : null
            }
          />
          <TextInput
            placeholder="Search text…"
            value={textFilter}
            onChange={(e) => setTextFilter(e.currentTarget.value)}
            size="xs"
            w={220}
            rightSection={
              textFilter ? (
                <ActionIcon size="xs" variant="subtle" onClick={() => setTextFilter("")}>
                  <IconX size={10} />
                </ActionIcon>
              ) : null
            }
          />
          {hasActiveFilters && (
            <Button variant="subtle" size="xs" color="dimmed" onClick={clearFilters}>
              Clear all
            </Button>
          )}
          <Group gap="xs" ml="auto" align="center">
            <Tooltip label={tailMode ? "Auto-scroll on (click to disable)" : "Auto-scroll off"}>
              <ActionIcon
                variant={tailMode ? "filled" : "default"}
                color={tailMode ? "blue" : undefined}
                size="sm"
                onClick={() => setTailMode((v) => !v)}
                aria-label="Toggle tail mode"
              >
                <IconArrowDown size={14} />
              </ActionIcon>
            </Tooltip>
            <Text size="xs" c="dimmed">
              {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
            </Text>
          </Group>
        </Group>
      </Stack>

      {/* ── Log feed ───────────────────────────────────────────────────── */}
      <ScrollArea.Autosize
        mah="calc(100dvh - 310px)"
        type="auto"
        scrollbars="y"
        viewportRef={scrollRef}
      >
        {filtered.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl" size="sm">
            No log entries match the current filters
          </Text>
        ) : (
          <Stack gap={2}>
            {filtered.map((entry) => {
              const key = entryKey(entry);
              return (
                <LogEntry
                  key={key}
                  entry={entry}
                  entryKey={key}
                  isExpanded={expandedKeys.has(key)}
                  onToggle={toggleRow}
                />
              );
            })}
          </Stack>
        )}
      </ScrollArea.Autosize>
    </Stack>
  );
}

// ── Log entry row ─────────────────────────────────────────────────────────

interface LogEntryProps {
  entry: LogEntry;
  entryKey: string;
  isExpanded: boolean;
  onToggle: (key: string) => void;
}

function LogEntry({ entry, entryKey: key, isExpanded, onToggle }: LogEntryProps) {
  const levelName = LEVEL_NAMES[entry.level] ?? String(entry.level);
  const color = levelColor(entry.level);
  const borderColor = levelCssColor(entry.level);
  const extras = extraFields(entry);
  const hasExtras = extras.length > 0;
  const source = entry.automation ?? (entry as { service?: string }).service ?? "";

  return (
    <Box
      style={{
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: "0 4px 4px 0",
        cursor: hasExtras ? "pointer" : undefined,
      }}
      bg="var(--mantine-color-default-hover)"
      px="sm"
      py={4}
      onClick={hasExtras ? () => onToggle(key) : undefined}
    >
      {/* Primary row */}
      <Group gap="xs" wrap="nowrap" align="flex-start">
        <Tooltip label={formatDateTime(entry.time)} openDelay={400}>
          <Text
            size="xs"
            c="dimmed"
            ff="monospace"
            style={{ whiteSpace: "nowrap", flexShrink: 0, minWidth: 72 }}
          >
            {formatTime(entry.time)}
          </Text>
        </Tooltip>

        <Badge color={color} size="xs" variant="light" style={{ flexShrink: 0, minWidth: 52 }}>
          {levelName}
        </Badge>

        {source && (
          <Text
            size="xs"
            c="blue"
            ff="monospace"
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              flexShrink: 0,
              maxWidth: 160,
            }}
          >
            {source}
          </Text>
        )}

        <Text size="xs" ff="monospace" style={{ flex: 1, minWidth: 0, wordBreak: "break-word" }}>
          {entry.msg}
        </Text>

        {hasExtras && (
          <ActionIcon
            size="xs"
            variant="transparent"
            c="dimmed"
            style={{ flexShrink: 0 }}
            aria-label={isExpanded ? "Collapse details" : "Expand details"}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(key);
            }}
          >
            <IconChevronRight
              size={12}
              style={{
                transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 150ms ease",
              }}
            />
          </ActionIcon>
        )}
      </Group>

      {/* Expandable extra fields */}
      {hasExtras && (
        <Collapse expanded={isExpanded}>
          <ExtraFieldsBlock extras={extras} />
        </Collapse>
      )}
    </Box>
  );
}

// ── Extra fields block ────────────────────────────────────────────────────

function ExtraFieldsBlock({ extras }: { extras: [string, unknown][] }) {
  return (
    <Box
      mt="xs"
      px="sm"
      py="xs"
      style={(theme) => ({
        borderRadius: theme.radius.sm,
        background: "var(--mantine-color-default)",
        borderTop: "1px solid var(--mantine-color-default-border)",
      })}
    >
      <Stack gap={4}>
        {extras.map(([key, value]) => {
          const formatted = formatFieldValue(value);
          const isMultiline = formatted.includes("\n");
          return (
            <Group key={key} gap="md" align="flex-start" wrap="nowrap">
              <Text
                size="xs"
                c="blue"
                fw={600}
                ff="monospace"
                style={{ whiteSpace: "nowrap", minWidth: 120, flexShrink: 0 }}
              >
                {key}
              </Text>
              {isMultiline ? (
                <Code block fz="xs" ff="monospace" style={{ flex: 1 }}>
                  {formatted}
                </Code>
              ) : (
                <Text
                  size="xs"
                  ff="monospace"
                  c="dimmed"
                  style={{ flex: 1, wordBreak: "break-all" }}
                >
                  {formatted}
                </Text>
              )}
            </Group>
          );
        })}
      </Stack>
    </Box>
  );
}
