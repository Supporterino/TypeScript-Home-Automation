import {
  Badge,
  Button,
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

const LEVEL_NAMES: Record<number, string> = {
  10: "TRACE",
  20: "DEBUG",
  30: "INFO",
  40: "WARN",
  50: "ERROR",
  60: "FATAL",
};

function levelColor(level: number): string {
  if (level <= 20) return "cyan";
  if (level === 30) return "green";
  if (level === 40) return "yellow";
  return "red";
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

const LEVEL_OPTIONS = [
  { value: "0", label: "All levels" },
  { value: "10", label: "TRACE+" },
  { value: "20", label: "DEBUG+" },
  { value: "30", label: "INFO+" },
  { value: "40", label: "WARN+" },
  { value: "50", label: "ERROR+" },
];

interface Props {
  data: DashboardData | null;
}

export function LogsTab({ data }: Props) {
  const allLogs = data?.logs ?? [];

  const [levelFilter, setLevelFilter] = useState("0");
  const [autoFilter, setAutoFilter] = useState("");
  const [textFilter, setTextFilter] = useState("");

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
    .reverse()
    .slice(0, 200);

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
        <Text size="xs" c="dimmed" ml="auto" style={{ alignSelf: "center" }}>
          {filtered.length} entries
        </Text>
      </Group>

      <ScrollArea h="calc(100vh - 260px)" type="auto">
        {filtered.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            No log entries match the current filters
          </Text>
        ) : (
          <Table fz="xs" ff="monospace" withRowBorders={false} striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={90}>Time</Table.Th>
                <Table.Th w={70}>Level</Table.Th>
                <Table.Th w={140}>Automation</Table.Th>
                <Table.Th>Message</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((entry, i) => (
                <LogRow key={i} entry={entry} />
              ))}
            </Table.Tbody>
          </Table>
        )}
      </ScrollArea>
    </Stack>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  const levelName = LEVEL_NAMES[entry.level] ?? String(entry.level);
  const color = levelColor(entry.level);
  return (
    <Table.Tr>
      <Table.Td c="dimmed" style={{ whiteSpace: "nowrap" }}>
        {formatTime(entry.time)}
      </Table.Td>
      <Table.Td>
        <Badge color={color} size="xs" variant="light">
          {levelName}
        </Badge>
      </Table.Td>
      <Table.Td c="violet" style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 }}>
        {entry.automation ?? ""}
      </Table.Td>
      <Table.Td style={{ wordBreak: "break-all" }}>{entry.msg}</Table.Td>
    </Table.Tr>
  );
}
