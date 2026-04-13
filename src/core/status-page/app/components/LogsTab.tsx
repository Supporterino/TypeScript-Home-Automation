import {
  Badge,
  Box,
  Button,
  Code,
  Collapse,
  Group,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useState } from "react";
import type { DashboardData, LogEntry } from "../types";

// ── Constants ─────────────────────────────────────────────────────────────

const LEVEL_NAMES: Record<number, string> = {
  10: "TRACE",
  20: "DEBUG",
  30: "INFO",
  40: "WARN",
  50: "ERROR",
  60: "FATAL",
};

/**
 * Fields shown in the primary row — excluded from the extra-fields expansion.
 */
const HIDDEN_FIELDS = new Set(["level", "time", "msg", "pid", "hostname", "automation", "service"]);

function levelColor(level: number): string {
  if (level <= 20) return "cyan";
  if (level === 30) return "green";
  if (level === 40) return "yellow";
  return "red";
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

function extraFields(entry: LogEntry): [string, unknown][] {
  return Object.entries(entry).filter(([k]) => !HIDDEN_FIELDS.has(k));
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return JSON.stringify(value, null, 2);
}

/** Stable identity key for a log entry — used as expansion map key. */
function entryKey(entry: LogEntry): string {
  return `${entry.time}-${entry.level}-${entry.msg}`;
}

const LEVEL_OPTIONS = [
  { value: "0", label: "All levels" },
  { value: "10", label: "TRACE+" },
  { value: "20", label: "DEBUG+" },
  { value: "30", label: "INFO+" },
  { value: "40", label: "WARN+" },
  { value: "50", label: "ERROR+" },
];

// ── Component ─────────────────────────────────────────────────────────────

interface Props {
  data: DashboardData | null;
}

export function LogsTab({ data }: Props) {
  const allLogs = data?.logs ?? [];

  const [levelFilter, setLevelFilter] = useState("0");
  const [autoFilter, setAutoFilter] = useState("");
  const [textFilter, setTextFilter] = useState("");

  // Expansion is keyed by stable entry identity (time+level+msg), NOT by
  // array index. This means expanded rows survive data refreshes — a new
  // entry arriving at the top doesn't close whatever was already open.
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  function clearFilters() {
    setLevelFilter("0");
    setAutoFilter("");
    setTextFilter("");
    // Don't reset expandedKeys — user may still want to see what they opened
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
    .reverse()
    .slice(0, 200);

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

      <Group gap="sm" wrap="wrap">
        <Select
          placeholder="Level"
          data={LEVEL_OPTIONS}
          value={levelFilter}
          onChange={(v) => setLevelFilter(v ?? "0")}
          w={130}
          size="sm"
        />
        <TextInput
          placeholder="Filter by automation…"
          value={autoFilter}
          onChange={(e) => setAutoFilter(e.currentTarget.value)}
          w={200}
          size="sm"
        />
        <TextInput
          placeholder="Search text…"
          value={textFilter}
          onChange={(e) => setTextFilter(e.currentTarget.value)}
          w={200}
          size="sm"
        />
        <Button variant="subtle" size="sm" onClick={clearFilters}>
          Clear
        </Button>
        <Text size="xs" c="dimmed" style={{ alignSelf: "center", marginLeft: "auto" }}>
          {filtered.length} entries
        </Text>
      </Group>

      <ScrollArea h="calc(100vh - 260px)" type="auto">
        {filtered.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            No log entries match the current filters
          </Text>
        ) : (
          <Table fz="xs" ff="monospace" withRowBorders={false} striped={false}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={90}>Time</Table.Th>
                <Table.Th w={70}>Level</Table.Th>
                <Table.Th w={140}>Automation</Table.Th>
                <Table.Th>Message</Table.Th>
                <Table.Th w={24} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((entry) => {
                const key = entryKey(entry);
                return (
                  <LogRow
                    key={key}
                    entry={entry}
                    rowKey={key}
                    isExpanded={expandedKeys.has(key)}
                    onToggle={toggleRow}
                  />
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </ScrollArea>
    </Stack>
  );
}

// ── Log row ───────────────────────────────────────────────────────────────

interface LogRowProps {
  entry: LogEntry;
  rowKey: string;
  isExpanded: boolean;
  onToggle: (key: string) => void;
}

function LogRow({ entry, rowKey, isExpanded, onToggle }: LogRowProps) {
  const levelName = LEVEL_NAMES[entry.level] ?? String(entry.level);
  const color = levelColor(entry.level);
  const extras = extraFields(entry);
  const hasExtras = extras.length > 0;

  return (
    <>
      <Table.Tr
        style={hasExtras ? { cursor: "pointer" } : undefined}
        onClick={hasExtras ? () => onToggle(rowKey) : undefined}
        bg={isExpanded ? "var(--mantine-color-default-hover)" : undefined}
      >
        <Table.Td c="dimmed" style={{ whiteSpace: "nowrap" }}>
          {formatTime(entry.time)}
        </Table.Td>
        <Table.Td>
          <Badge color={color} size="xs" variant="light">
            {levelName}
          </Badge>
        </Table.Td>
        <Table.Td c="blue" style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 }}>
          {entry.automation ?? entry.service ?? ""}
        </Table.Td>
        <Table.Td style={{ wordBreak: "break-all" }}>{entry.msg}</Table.Td>
        <Table.Td style={{ textAlign: "center" }}>
          {hasExtras && (
            <Text
              c="dimmed"
              size="xs"
              style={{
                userSelect: "none",
                display: "inline-block",
                transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 150ms ease",
                lineHeight: 1,
              }}
              aria-label={isExpanded ? "Collapse details" : "Expand details"}
            >
              ▶
            </Text>
          )}
        </Table.Td>
      </Table.Tr>

      {/* Always render the collapse row — Collapse handles visibility via animation */}
      {hasExtras && (
        <Table.Tr style={{ background: "none" }}>
          <Table.Td colSpan={5} p={0} style={{ borderBottom: "none" }}>
            <Collapse in={isExpanded}>
              <ExtraFieldsBlock extras={extras} />
            </Collapse>
          </Table.Td>
        </Table.Tr>
      )}
    </>
  );
}

// ── Extra fields block ────────────────────────────────────────────────────

function ExtraFieldsBlock({ extras }: { extras: [string, unknown][] }) {
  return (
    <Box px="md" py="xs" bg="var(--mantine-color-default-hover)">
      <Table fz="xs" ff="monospace" withRowBorders={false} withTableBorder={false}>
        <Table.Tbody>
          {extras.map(([key, value]) => {
            const formatted = formatFieldValue(value);
            const isMultiline = formatted.includes("\n");
            return (
              <Table.Tr key={key} style={{ background: "none" }}>
                <Table.Td
                  c="blue"
                  fw={600}
                  style={{ whiteSpace: "nowrap", verticalAlign: "top", width: 160 }}
                >
                  {key}
                </Table.Td>
                <Table.Td style={{ wordBreak: "break-all" }}>
                  {isMultiline ? (
                    <Code block fz="xs" ff="monospace">
                      {formatted}
                    </Code>
                  ) : (
                    <Text size="xs" ff="monospace" c="dimmed">
                      {formatted}
                    </Text>
                  )}
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Box>
  );
}
