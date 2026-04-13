import {
  Badge,
  Code,
  Group,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import type { DashboardData, LogEntry } from "../types";

const LEVEL_NAMES: Record<number, string> = {
  10: "TRACE",
  20: "DEBUG",
  30: "INFO",
  40: "WARN",
  50: "ERROR",
  60: "FATAL",
};

const LEVEL_COLORS: Record<number, string> = {
  10: "cyan",
  20: "cyan",
  30: "green",
  40: "yellow",
  50: "red",
  60: "red",
};

function levelColor(level: number): string {
  if (level <= 20) return "cyan";
  if (level === 30) return "green";
  if (level === 40) return "yellow";
  return "red";
}

function formatUptime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString();
}

interface StatCardProps {
  label: string;
  children: React.ReactNode;
}

function StatCard({ label, children }: StatCardProps) {
  return (
    <Paper withBorder p="md" radius="md">
      <Text size="xs" tt="uppercase" fw={600} c="dimmed" mb={4}>
        {label}
      </Text>
      {children}
    </Paper>
  );
}

interface Props {
  data: DashboardData | null;
}

export function OverviewTab({ data }: Props) {
  const status = data?.status ?? null;
  const automations = data?.automations ?? [];
  const state = data?.state ?? {};
  const recentLogs = (data?.logs ?? []).slice(-10).reverse();

  const engineReady = status?.status === "ready";
  const mqttConnected = status?.checks?.mqtt === true;
  const uptime = status?.startedAt != null ? formatUptime(Date.now() - status.startedAt) : "—";

  return (
    <Stack gap="md">
      <Title order={2}>Overview</Title>

      <SimpleGrid cols={{ base: 2, sm: 3, md: 6 }} spacing="md">
        <StatCard label="Engine">
          <Badge color={engineReady ? "green" : "red"} size="lg" variant="light">
            {engineReady ? "Ready" : "Not Ready"}
          </Badge>
        </StatCard>

        <StatCard label="MQTT">
          <Badge color={mqttConnected ? "green" : "red"} size="lg" variant="light">
            {mqttConnected ? "Connected" : "Disconnected"}
          </Badge>
        </StatCard>

        <StatCard label="Uptime">
          <Text fw={700} size="lg" ff="monospace">
            {uptime}
          </Text>
        </StatCard>

        <StatCard label="Timezone">
          <Text fw={700} size="lg" c="violet">
            {status?.tz ?? "—"}
          </Text>
        </StatCard>

        <StatCard label="Automations">
          <Text fw={700} size="lg" c="violet">
            {automations.length}
          </Text>
        </StatCard>

        <StatCard label="State Keys">
          <Text fw={700} size="lg" c="cyan">
            {Object.keys(state).length}
          </Text>
        </StatCard>
      </SimpleGrid>

      <Paper withBorder p="md" radius="md">
        <Text size="xs" tt="uppercase" fw={600} c="dimmed" mb="sm">
          Recent Logs
        </Text>
        <ScrollArea h={280}>
          {recentLogs.length === 0 ? (
            <Text c="dimmed" size="sm" ta="center" py="xl">
              No log entries yet
            </Text>
          ) : (
            <Table striped highlightOnHover withRowBorders={false} fz="xs" ff="monospace">
              <Table.Tbody>
                {recentLogs.map((entry, i) => (
                  <LogRow key={i} entry={entry} />
                ))}
              </Table.Tbody>
            </Table>
          )}
        </ScrollArea>
      </Paper>
    </Stack>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  const levelName = LEVEL_NAMES[entry.level] ?? String(entry.level);
  const color = levelColor(entry.level);
  return (
    <Table.Tr>
      <Table.Td w={80} c="dimmed">
        {formatTime(entry.time)}
      </Table.Td>
      <Table.Td w={60}>
        <Badge color={color} size="xs" variant="light">
          {levelName}
        </Badge>
      </Table.Td>
      <Table.Td w={120} c="violet" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
        {entry.automation ?? ""}
      </Table.Td>
      <Table.Td>{entry.msg}</Table.Td>
    </Table.Tr>
  );
}
